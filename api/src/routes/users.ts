import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { authed } from "../route-helpers.js";

// Liste des utilisateurs de la clinique (sélecteurs de formulaires).
// Ne renvoie jamais les hachés de mot de passe ni les secrets 2FA.
export function registerUserRoutes(app: FastifyInstance, db: Pool) {
  app.get("/users", { preHandler: authed(db, "appointment:write") }, async (req) => {
    const q = req.query as { role?: string };
    const params: unknown[] = [req.user.clinicId];
    let where = `clinic_id = $1 AND is_active`;
    if (q.role) {
      params.push(q.role);
      where += ` AND role = $${params.length}`;
    }
    const { rows } = await db.query(
      `SELECT id, full_name, role, email, phone FROM users WHERE ${where} ORDER BY full_name`,
      params,
    );
    return {
      users: rows.map((r) => ({
        id: r.id, fullName: r.full_name, role: r.role, email: r.email, phone: r.phone,
      })),
    };
  });
}
