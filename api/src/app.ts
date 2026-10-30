import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { login, revokeSession, resolveSession } from "./auth.js";
import { bearerToken } from "./route-helpers.js";
import { registerPatientRoutes } from "./routes/patients.js";
import { registerAppointmentRoutes } from "./routes/appointments.js";
import { registerConsultationRoutes } from "./routes/consultations.js";
import { registerInvoiceRoutes } from "./routes/invoices.js";
import { registerMfaRoutes } from "./routes/mfa.js";
import { registerUserRoutes } from "./routes/users.js";

// Les jeux de réponses d'erreur sont volontairement génériques
const MESSAGES = {
  invalid_input: "Requête invalide.",
  invalid_credentials: "Identifiant ou mot de passe incorrect.",
  mfa_required: "Code de vérification à 6 chiffres requis.",
  locked: "Compte verrouillé pendant 15 minutes. Vérifiez vos accès ou contactez votre administrateur.",
  inactive: "Ce compte est désactivé.",
} as const;

export function buildApp(db: Pool): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: true });

  app.post("/auth/login", async (request, reply) => {
    const result = await login(db, request.body, request.ip);
    if (!result.ok) {
      const status = result.reason === "locked" ? 423 : result.reason === "invalid_input" ? 400 : 401;
      return reply.code(status).send({ error: result.reason, message: MESSAGES[result.reason] });
    }
    return reply.code(200).send({
      token: result.token,
      expiresAt: result.expiresAt,
      role: result.role,
      clinic: result.clinic,
    });
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = bearerToken(request);
    if (token) await revokeSession(db, token);
    return reply.code(204).send();
  });

  app.get("/me", async (request, reply) => {
    const token = bearerToken(request);
    const session = token ? await resolveSession(db, token) : null;
    if (!session) return reply.code(401).send({ error: "unauthorized" });
    return { userId: session.user_id, role: session.role, clinicId: session.clinic_id };
  });

  app.get("/health", async () => ({ status: "ok" }));

  registerMfaRoutes(app, db);
  registerUserRoutes(app, db);
  registerPatientRoutes(app, db);
  registerAppointmentRoutes(app, db);
  registerConsultationRoutes(app, db);
  registerInvoiceRoutes(app, db);

  return app;
}
