import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { authed } from "../route-helpers.js";
import { enrollMfa, confirmMfa, generateBackupCodes } from "../auth.js";

const CONFIRM_MESSAGES = {
  no_pending: "Aucun enrôlement en cours. Relancez l'enrôlement.",
  expired: "Enrôlement expiré (15 minutes). Relancez l'enrôlement.",
  invalid_code: "Code incorrect.",
} as const;

export function registerMfaRoutes(app: FastifyInstance, db: Pool) {
  // Étape 1 — génère un secret en attente et renvoie l'URI à scanner
  app.post("/auth/mfa/enroll", { preHandler: authed(db) }, async (req) => {
    const otpauth = await enrollMfa(db, req.user.userId);
    return { otpauth };
  });

  // Étape 2 — confirme avec un premier code ; le secret devient actif
  app.post("/auth/mfa/confirm", { preHandler: authed(db) }, async (req, reply) => {
    const parsed = z.object({ totp: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_input", message: "Code à 6 chiffres requis." });
    }
    const result = await confirmMfa(db, req.user.userId, parsed.data.totp);
    if (!result.ok) {
      const status = result.reason === "invalid_code" ? 400 : 409;
      return reply.code(status).send({ error: result.reason, message: CONFIRM_MESSAGES[result.reason] });
    }
    return { ok: true };
  });

  // Codes de secours : affichés une seule fois, à conserver hors ligne
  app.post("/auth/mfa/backup-codes", { preHandler: authed(db) }, async (req) => {
    const codes = await generateBackupCodes(db, req.user.userId);
    return { codes, warning: "Notez ces codes et conservez-les en lieu sûr : ils ne seront plus affichés." };
  });
}
