import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { authed, dbError } from "../route-helpers.js";
import { auditLog } from "../auth.js";

const lineSchema = z.object({
  actCode: z.string().min(1).max(30),
  label: z.string().min(1).max(200),
  quantity: z.number().int().min(1),
  unitFcfa: z.number().int().min(0),
});

const createInvoiceSchema = z.object({
  patientId: z.string().uuid(),
  consultationId: z.string().uuid().optional().nullable(),
  insurerId: z.string().uuid().optional().nullable(),
  lines: z.array(lineSchema).min(1),
  insurerPartFcfa: z.number().int().min(0).default(0),
  patientPartFcfa: z.number().int().min(0).default(0),
});

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending"],
  pending: ["sent"],
  sent: ["validated", "rejected"],
  validated: [],
  rejected: ["draft"],
  paid: [],
};

// Numéro FAC-{code_clinique}-{AAAAMM}-{seq} — compteur atomique par clinique et mois
async function nextInvoiceNumber(db: Pool, clinicId: string): Promise<string> {
  const yyyymm = new Date().toISOString().slice(0, 7).replace("-", "");
  const { rows } = await db.query(
    `INSERT INTO invoice_counters (clinic_id, yyyymm, seq) VALUES ($1, $2, 1)
     ON CONFLICT (clinic_id, yyyymm) DO UPDATE SET seq = invoice_counters.seq + 1
     RETURNING seq`,
    [clinicId, yyyymm],
  );
  const seq = String(rows[0].seq).padStart(4, "0");
  const c = await db.query(`SELECT code FROM clinics WHERE id = $1`, [clinicId]);
  return `FAC-${c.rows[0].code}-${yyyymm}-${seq}`;
}

const toInvoice = (r: Record<string, unknown>) => ({
  id: r.id,
  number: r.number,
  patientId: r.patient_id,
  consultationId: r.consultation_id,
  insurerId: r.insurer_id,
  status: r.status,
  totalFcfa: r.total_fcfa,
  insurerPartFcfa: r.insurer_part_fcfa,
  patientPartFcfa: r.patient_part_fcfa,
  insurerFileRef: r.insurer_file_ref,
  createdAt: r.created_at,
});

export function registerInvoiceRoutes(app: FastifyInstance, db: Pool) {
  app.get("/invoices", { preHandler: authed(db, "invoice:read") }, async (req) => {
    const q = req.query as { status?: string };
    const params: unknown[] = [req.user.clinicId];
    let where = `i.clinic_id = $1`;
    if (q.status) { params.push(q.status); where += ` AND i.status = $${params.length}`; }
    const { rows } = await db.query(
      `SELECT i.id, i.number, i.patient_id, i.consultation_id, i.insurer_id, i.status,
              i.total_fcfa, i.insurer_part_fcfa, i.patient_part_fcfa, i.insurer_file_ref, i.created_at,
              p.first_name || ' ' || p.last_name AS patient_name
         FROM invoices i JOIN patients p ON p.id = i.patient_id
        WHERE ${where} ORDER BY i.created_at DESC LIMIT 100`,
      params,
    );
    return { invoices: rows.map((r) => ({ ...toInvoice(r), patientName: r.patient_name })) };
  });

  app.get("/invoices/:id", { preHandler: authed(db, "invoice:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await db.query(
      `SELECT id, number, patient_id, consultation_id, insurer_id, status, total_fcfa,
              insurer_part_fcfa, patient_part_fcfa, insurer_file_ref, created_at
         FROM invoices WHERE id = $1 AND clinic_id = $2`,
      [id, req.user.clinicId],
    );
    if (!rows[0]) return reply.code(404).send({ error: "not_found", message: "Facture introuvable." });
    const lines = await db.query(
      `SELECT id, act_code, label, quantity, unit_fcfa FROM invoice_lines WHERE invoice_id = $1 ORDER BY id`,
      [id],
    );
    const pays = await db.query(
      `SELECT id, operator, amount_fcfa, provider_ref, status, created_at
         FROM payments WHERE invoice_id = $1 ORDER BY created_at`,
      [id],
    );
    return {
      invoice: {
        ...toInvoice(rows[0]),
        lines: lines.rows.map((l) => ({ id: l.id, actCode: l.act_code, label: l.label, quantity: l.quantity, unitFcfa: l.unit_fcfa })),
        payments: pays.rows.map((p) => ({ id: p.id, operator: p.operator, amountFcfa: p.amount_fcfa, providerRef: p.provider_ref, status: p.status, createdAt: p.created_at })),
      },
    };
  });

  app.post("/invoices", { preHandler: authed(db, "invoice:write") }, async (req, reply) => {
    const parsed = createInvoiceSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", message: "Données de facture invalides." });
    const inv = parsed.data;
    const total = inv.lines.reduce((s, l) => s + l.quantity * l.unitFcfa, 0);
    if (inv.insurerPartFcfa + inv.patientPartFcfa !== total) {
      return reply.code(400).send({
        error: "invalid_input",
        message: "La somme des parts (assureur + patient) doit égaler le total.",
      });
    }
    const pat = await db.query(
      `SELECT 1 FROM patients WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
      [inv.patientId, req.user.clinicId],
    );
    if (!pat.rowCount) return reply.code(400).send({ error: "invalid_reference", message: "Patient invalide." });
    try {
      const number = await nextInvoiceNumber(db, req.user.clinicId!);
      const { rows } = await db.query(
        `INSERT INTO invoices
           (clinic_id, patient_id, consultation_id, insurer_id, number, total_fcfa,
            insurer_part_fcfa, patient_part_fcfa, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, number, patient_id, consultation_id, insurer_id, status, total_fcfa,
                   insurer_part_fcfa, patient_part_fcfa, insurer_file_ref, created_at`,
        [req.user.clinicId, inv.patientId, inv.consultationId ?? null, inv.insurerId ?? null,
         number, total, inv.insurerPartFcfa, inv.patientPartFcfa, req.user.userId],
      );
      const invoiceId = rows[0].id as string;
      for (const l of inv.lines) {
        await db.query(
          `INSERT INTO invoice_lines (invoice_id, act_code, label, quantity, unit_fcfa)
           VALUES ($1,$2,$3,$4,$5)`,
          [invoiceId, l.actCode, l.label, l.quantity, l.unitFcfa],
        );
      }
      await auditLog(db, req.user.userId, req.user.clinicId, "invoice.create", "invoice", invoiceId, req.ip);
      return reply.code(201).send({ invoice: toInvoice(rows[0]) });
    } catch (e) {
      return dbError(reply, e);
    }
  });

  app.patch("/invoices/:id", { preHandler: authed(db, "invoice:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({
      status: z.enum(["draft", "pending", "sent", "validated", "rejected", "paid"]).optional(),
      insurerFileRef: z.string().max(100).optional().nullable(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", message: "Données invalides." });
    const { rows } = await db.query(`SELECT status FROM invoices WHERE id = $1 AND clinic_id = $2`, [id, req.user.clinicId]);
    if (!rows[0]) return reply.code(404).send({ error: "not_found", message: "Facture introuvable." });
    const current = rows[0].status as string;
    if (parsed.data.status && parsed.data.status !== current) {
      if (current === "paid") {
        return reply.code(400).send({ error: "invalid_transition", message: "Facture déjà payée." });
      }
      if (!STATUS_TRANSITIONS[current]?.includes(parsed.data.status)) {
        return reply.code(400).send({ error: "invalid_transition", message: `Transition impossible : ${current} → ${parsed.data.status}.` });
      }
      await db.query(`UPDATE invoices SET status = $2 WHERE id = $1`, [id, parsed.data.status]);
      await auditLog(db, req.user.userId, req.user.clinicId, `invoice.${parsed.data.status}`, "invoice", id, req.ip);
    }
    if (parsed.data.insurerFileRef !== undefined) {
      await db.query(`UPDATE invoices SET insurer_file_ref = $2 WHERE id = $1`, [id, parsed.data.insurerFileRef]);
    }
    return { ok: true };
  });

  // Paiement Mobile Money : on n'enregistre que la référence opérateur
  app.post("/invoices/:id/payments", { preHandler: authed(db, "payment:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({
      operator: z.enum(["wave", "orange", "mtn", "cash"]),
      amountFcfa: z.number().int().min(1),
      providerRef: z.string().max(100).optional(),
    }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", message: "Données de paiement invalides." });
    const inv = await db.query(
      `SELECT total_fcfa, status FROM invoices WHERE id = $1 AND clinic_id = $2`,
      [id, req.user.clinicId],
    );
    if (!inv.rows[0]) return reply.code(404).send({ error: "not_found", message: "Facture introuvable." });
    if (inv.rows[0].status === "paid") {
      return reply.code(400).send({ error: "invalid_state", message: "Facture déjà soldée." });
    }
    try {
      await db.query(
        `INSERT INTO payments (invoice_id, operator, amount_fcfa, provider_ref, status)
         VALUES ($1,$2,$3,$4,'success')`,
        [id, parsed.data.operator, parsed.data.amountFcfa, parsed.data.providerRef ?? null],
      );
    } catch (e) {
      return dbError(reply, e); // 23505 → référence opérateur déjà utilisée
    }
    const sum = await db.query(
      `SELECT COALESCE(SUM(amount_fcfa),0) AS paid FROM payments WHERE invoice_id = $1 AND status = 'success'`,
      [id],
    );
    if (Number(sum.rows[0].paid) >= inv.rows[0].total_fcfa) {
      await db.query(`UPDATE invoices SET status = 'paid' WHERE id = $1`, [id]);
      await auditLog(db, req.user.userId, req.user.clinicId, "invoice.paid", "invoice", id, req.ip);
    }
    await auditLog(db, req.user.userId, req.user.clinicId, "payment.record", "invoice", id, req.ip);
    return reply.code(201).send({ ok: true });
  });
}
