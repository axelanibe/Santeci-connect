import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { authed, dbError } from "../route-helpers.js";
import { auditLog } from "../auth.js";
import { encryptField, decryptField } from "../crypto.js";

const soapSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional().nullable(),
  subjective: z.string().max(20000).optional().nullable(),
  objective: z.string().max(20000).optional().nullable(),
  assessment: z.string().max(20000).optional().nullable(),
  plan: z.string().max(20000).optional().nullable(),
  diagnosisCode: z.string().max(20).optional().nullable(), // CIM-10, en clair pour stats
});

const toConsultation = (r: Record<string, unknown>) => ({
  id: r.id,
  patientId: r.patient_id,
  doctorId: r.doctor_id,
  appointmentId: r.appointment_id,
  subjective: decryptField(r.subjective_enc as Buffer | null),
  objective: decryptField(r.objective_enc as Buffer | null),
  assessment: decryptField(r.assessment_enc as Buffer | null),
  plan: decryptField(r.plan_enc as Buffer | null),
  diagnosisCode: r.diagnosis_code,
  signedAt: r.signed_at,
  signedBy: r.signed_by,
  createdAt: r.created_at,
});

export function registerConsultationRoutes(app: FastifyInstance, db: Pool) {
  app.get("/consultations", { preHandler: authed(db, "consultation:read") }, async (req) => {
    const q = req.query as { patientId?: string };
    const params: unknown[] = [req.user.clinicId];
    let where = `clinic_id = $1`;
    if (q.patientId) { params.push(q.patientId); where += ` AND patient_id = $${params.length}`; }
    const { rows } = await db.query(
      `SELECT id, patient_id, doctor_id, appointment_id, subjective_enc, objective_enc,
              assessment_enc, plan_enc, diagnosis_code, signed_at, signed_by, created_at
         FROM consultations WHERE ${where} ORDER BY created_at DESC LIMIT 100`,
      params,
    );
    return { consultations: rows.map(toConsultation) };
  });

  app.get("/consultations/:id", { preHandler: authed(db, "consultation:read") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await db.query(
      `SELECT id, patient_id, doctor_id, appointment_id, subjective_enc, objective_enc,
              assessment_enc, plan_enc, diagnosis_code, signed_at, signed_by, created_at
         FROM consultations WHERE id = $1 AND clinic_id = $2`,
      [id, req.user.clinicId],
    );
    if (!rows[0]) return reply.code(404).send({ error: "not_found", message: "Consultation introuvable." });
    return { consultation: toConsultation(rows[0]) };
  });

  // Création d'une consultation (brouillon, SOAP chiffré)
  app.post("/consultations", { preHandler: authed(db, "consultation:write") }, async (req, reply) => {
    const parsed = soapSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", message: "Données de consultation invalides." });
    const s = parsed.data;
    const pat = await db.query(
      `SELECT 1 FROM patients WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
      [s.patientId, req.user.clinicId],
    );
    if (!pat.rowCount) return reply.code(400).send({ error: "invalid_reference", message: "Patient invalide." });
    try {
      const { rows } = await db.query(
        `INSERT INTO consultations
           (clinic_id, patient_id, doctor_id, appointment_id,
            subjective_enc, objective_enc, assessment_enc, plan_enc, diagnosis_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, patient_id, doctor_id, appointment_id, subjective_enc, objective_enc,
                   assessment_enc, plan_enc, diagnosis_code, signed_at, signed_by, created_at`,
        [req.user.clinicId, s.patientId, req.user.userId, s.appointmentId ?? null,
         encryptField(s.subjective), encryptField(s.objective),
         encryptField(s.assessment), encryptField(s.plan), s.diagnosisCode ?? null],
      );
      await auditLog(db, req.user.userId, req.user.clinicId, "consultation.create", "consultation", rows[0].id, req.ip);
      return reply.code(201).send({ consultation: toConsultation(rows[0]) });
    } catch (e) {
      return dbError(reply, e);
    }
  });

  // Modification du brouillon (interdite après signature — trigger + 409)
  app.patch("/consultations/:id", { preHandler: authed(db, "consultation:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = soapSchema.omit({ patientId: true, appointmentId: true }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", message: "Données invalides." });
    const s = parsed.data;
    try {
      const { rows } = await db.query(
        `UPDATE consultations
            SET subjective_enc = COALESCE($2, subjective_enc),
                objective_enc = COALESCE($3, objective_enc),
                assessment_enc = COALESCE($4, assessment_enc),
                plan_enc = COALESCE($5, plan_enc),
                diagnosis_code = COALESCE($6, diagnosis_code)
          WHERE id = $1 AND clinic_id = $7 RETURNING id`,
        [id, encryptField(s.subjective), encryptField(s.objective), encryptField(s.assessment),
         encryptField(s.plan), s.diagnosisCode ?? null, req.user.clinicId],
      );
      if (!rows[0]) return reply.code(404).send({ error: "not_found", message: "Consultation introuvable." });
      await auditLog(db, req.user.userId, req.user.clinicId, "consultation.update", "consultation", id, req.ip);
      return { ok: true };
    } catch (e) {
      return dbError(reply, e);
    }
  });

  // Signature : fige la consultation (immuable ensuite, cf. US-06)
  app.post("/consultations/:id/sign", { preHandler: authed(db, "consultation:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await db.query(
      `UPDATE consultations SET signed_at = now(), signed_by = $2
        WHERE id = $1 AND clinic_id = $3 AND signed_at IS NULL
        RETURNING id`,
      [id, req.user.userId, req.user.clinicId],
    );
    if (!rows[0]) {
      return reply.code(400).send({ error: "invalid_state", message: "Consultation introuvable ou déjà signée." });
    }
    await auditLog(db, req.user.userId, req.user.clinicId, "consultation.sign", "consultation", id, req.ip);
    return { ok: true };
  });
}
