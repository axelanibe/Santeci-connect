import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { authed, dbError } from "../route-helpers.js";
import { auditLog } from "../auth.js";

const createPatientSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date au format AAAA-MM-JJ"),
  sex: z.enum(["F", "M"]),
  phone: z.string().regex(/^\+\d{7,15}$/, "Téléphone au format E.164 (+225…) ").optional(),
  email: z.string().email().max(254).optional(),
  address: z.string().max(500).optional(),
  bloodGroup: z.string().max(10).optional(),
});

const updatePatientSchema = createPatientSchema.partial().omit({ birthDate: true, sex: true });

const toPatient = (r: Record<string, unknown>) => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  birthDate: r.birth_date,
  sex: r.sex,
  phone: r.phone,
  email: r.email,
  address: r.address,
  bloodGroup: r.blood_group,
  qrToken: r.qr_token,
  createdAt: r.created_at,
});

export function registerPatientRoutes(app: FastifyInstance, db: Pool) {
  // Recherche et liste (secrétaires, médecins, caissiers, admin)
  app.get("/patients", { preHandler: authed(db, "patient:read") }, async (req, reply) => {
    const q = req.query as { search?: string; limit?: string; offset?: string };
    const limit = Math.min(Math.max(parseInt(q.limit ?? "20", 10) || 20, 1), 100);
    const offset = Math.max(parseInt(q.offset ?? "0", 10) || 0, 0);
    const params: unknown[] = [req.user.clinicId];
    let where = `clinic_id = $1 AND deleted_at IS NULL`;
    if (q.search?.trim()) {
      params.push(`%${q.search.trim()}%`);
      where += ` AND (first_name ILIKE $2 OR last_name ILIKE $2 OR phone ILIKE $2)`;
    }
    const { rows } = await db.query(
      `SELECT id, first_name, last_name, birth_date, sex, phone, email, address,
              blood_group, qr_token, created_at
         FROM patients WHERE ${where}
        ORDER BY last_name, first_name LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return { patients: rows.map(toPatient) };
  });

  // Création du dossier patient
  app.post("/patients", { preHandler: authed(db, "patient:write") }, async (req, reply) => {
    const parsed = createPatientSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", message: "Données patient invalides." });
    const p = parsed.data;
    try {
      const { rows } = await db.query(
        `INSERT INTO patients (clinic_id, first_name, last_name, birth_date, sex, phone, email, address, blood_group)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, first_name, last_name, birth_date, sex, phone, email, address, blood_group, qr_token, created_at`,
        [req.user.clinicId, p.firstName, p.lastName, p.birthDate, p.sex, p.phone ?? null,
         p.email ?? null, p.address ?? null, p.bloodGroup ?? null],
      );
      await auditLog(db, req.user.userId, req.user.clinicId, "patient.create", "patient", rows[0].id, req.ip);
      return reply.code(201).send({ patient: toPatient(rows[0]) });
    } catch (e) {
      return dbError(reply, e);
    }
  });

  // Détail + couvertures d'assurance
  app.get("/patients/:id", { preHandler: authed(db, "patient:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await db.query(
      `SELECT id, first_name, last_name, birth_date, sex, phone, email, address,
              blood_group, qr_token, created_at
         FROM patients WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
      [id, req.user.clinicId],
    );
    if (!rows[0]) return reply.code(404).send({ error: "not_found", message: "Patient introuvable." });
    const ins = await db.query(
      `SELECT pi.id, i.code AS insurerCode, i.name AS insurerName,
              pi.member_number AS memberNumber, pi.coverage_rate AS coverageRate,
              pi.valid_until AS validUntil
         FROM patient_insurance pi JOIN insurers i ON i.id = pi.insurer_id
        WHERE pi.patient_id = $1`,
      [id],
    );
    return { patient: { ...toPatient(rows[0]), insurance: ins.rows } };
  });

  // Mise à jour (champs non identitaires)
  app.patch("/patients/:id", { preHandler: authed(db, "patient:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updatePatientSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", message: "Données invalides." });
    const sets: string[] = [];
    const params: unknown[] = [];
    const map: Record<string, string> = {
      firstName: "first_name", lastName: "last_name", phone: "phone",
      email: "email", address: "address", bloodGroup: "blood_group",
    };
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) {
        params.push(v);
        sets.push(`${map[k]} = $${params.length}`);
      }
    }
    if (!sets.length) return reply.code(400).send({ error: "invalid_input", message: "Rien à mettre à jour." });
    params.push(id, req.user.clinicId);
    const { rows } = await db.query(
      `UPDATE patients SET ${sets.join(", ")}
        WHERE id = $${params.length - 1} AND clinic_id = $${params.length} AND deleted_at IS NULL
        RETURNING id`,
      params,
    );
    if (!rows[0]) return reply.code(404).send({ error: "not_found", message: "Patient introuvable." });
    await auditLog(db, req.user.userId, req.user.clinicId, "patient.update", "patient", id, req.ip);
    return { ok: true };
  });

  // Suppression logique
  app.delete("/patients/:id", { preHandler: authed(db, "patient:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await db.query(
      `UPDATE patients SET deleted_at = now()
        WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL RETURNING id`,
      [id, req.user.clinicId],
    );
    if (!rows[0]) return reply.code(404).send({ error: "not_found", message: "Patient introuvable." });
    await auditLog(db, req.user.userId, req.user.clinicId, "patient.delete", "patient", id, req.ip);
    return reply.code(204).send();
  });
}
