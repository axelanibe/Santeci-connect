import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { authed, dbError } from "../route-helpers.js";
import { auditLog } from "../auth.js";

const createApptSchema = z.object({
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

const STATUS_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["confirmed", "cancelled"],
  confirmed: ["done", "cancelled", "no_show"],
  done: [],
  cancelled: [],
  no_show: [],
};

const toAppt = (r: Record<string, unknown>) => ({
  id: r.id,
  patientId: r.patient_id,
  doctorId: r.doctor_id,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  status: r.status,
  createdAt: r.created_at,
});

export function registerAppointmentRoutes(app: FastifyInstance, db: Pool) {
  app.get("/appointments", { preHandler: authed(db, "appointment:read") }, async (req) => {
    const q = req.query as { from?: string; to?: string; doctorId?: string; patientId?: string };
    const params: unknown[] = [req.user.clinicId];
    let where = `a.clinic_id = $1`;
    if (q.from) { params.push(q.from); where += ` AND a.starts_at >= $${params.length}`; }
    if (q.to) { params.push(q.to); where += ` AND a.starts_at < $${params.length}`; }
    if (q.doctorId) { params.push(q.doctorId); where += ` AND a.doctor_id = $${params.length}`; }
    if (q.patientId) { params.push(q.patientId); where += ` AND a.patient_id = $${params.length}`; }
    const { rows } = await db.query(
      `SELECT a.id, a.patient_id, a.doctor_id, a.starts_at, a.ends_at, a.status, a.created_at,
              p.first_name || ' ' || p.last_name AS patient_name,
              u.full_name AS doctor_name
         FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         JOIN users u ON u.id = a.doctor_id
        WHERE ${where} ORDER BY a.starts_at`,
      params,
    );
    return { appointments: rows.map((r) => ({ ...toAppt(r), patientName: r.patient_name, doctorName: r.doctor_name })) };
  });

  app.post("/appointments", { preHandler: authed(db, "appointment:write") }, async (req, reply) => {
    const parsed = createApptSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", message: "Données de rendez-vous invalides." });
    const { patientId, doctorId, startsAt, endsAt } = parsed.data;
    if (new Date(endsAt) <= new Date(startsAt)) {
      return reply.code(400).send({ error: "invalid_input", message: "La fin doit être après le début." });
    }
    // Le patient et le médecin doivent appartenir à la clinique
    const chk = await db.query(
      `SELECT (SELECT count(*) FROM patients WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL) AS p,
              (SELECT count(*) FROM users WHERE id = $3 AND clinic_id = $2 AND role = 'medecin' AND is_active) AS d`,
      [patientId, req.user.clinicId, doctorId],
    );
    if (chk.rows[0].p === "0" || chk.rows[0].d === "0") {
      return reply.code(400).send({ error: "invalid_reference", message: "Patient ou médecin invalide pour cette clinique." });
    }
    try {
      const { rows } = await db.query(
        `INSERT INTO appointments (clinic_id, patient_id, doctor_id, starts_at, ends_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, patient_id, doctor_id, starts_at, ends_at, status, created_at`,
        [req.user.clinicId, patientId, doctorId, startsAt, endsAt, req.user.userId],
      );
      await auditLog(db, req.user.userId, req.user.clinicId, "appointment.create", "appointment", rows[0].id, req.ip);
      return reply.code(201).send({ appointment: toAppt(rows[0]) });
    } catch (e) {
      return dbError(reply, e); // 23P01 → 409 créneau occupé
    }
  });

  app.patch("/appointments/:id", { preHandler: authed(db, "appointment:write") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({ status: z.enum(["scheduled", "confirmed", "cancelled", "done", "no_show"]) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", message: "Statut invalide." });
    const { rows } = await db.query(
      `SELECT status FROM appointments WHERE id = $1 AND clinic_id = $2`,
      [id, req.user.clinicId],
    );
    if (!rows[0]) return reply.code(404).send({ error: "not_found", message: "Rendez-vous introuvable." });
    const current = rows[0].status as string;
    if (!STATUS_TRANSITIONS[current]?.includes(parsed.data.status)) {
      return reply.code(400).send({
        error: "invalid_transition",
        message: `Transition impossible : ${current} → ${parsed.data.status}.`,
      });
    }
    await db.query(`UPDATE appointments SET status = $2 WHERE id = $1`, [id, parsed.data.status]);
    await auditLog(db, req.user.userId, req.user.clinicId, `appointment.${parsed.data.status}`, "appointment", id, req.ip);
    return { ok: true };
  });
}
