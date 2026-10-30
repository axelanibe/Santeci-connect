import type { FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { resolveSession } from "./auth.js";

export interface SessionUser {
  userId: string;
  role: string;
  clinicId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser;
  }
}

export function bearerToken(req: FastifyRequest): string | null {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

export async function requireAuth(
  db: Pool,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionUser | null> {
  const token = bearerToken(req);
  const sess = token ? await resolveSession(db, token) : null;
  if (!sess) {
    reply.code(401).send({ error: "unauthorized", message: "Session invalide ou expirée." });
    return null;
  }
  // resolveSession renvoie des clés snake_case (user_id, clinic_id)
  return { userId: sess.user_id, role: sess.role, clinicId: sess.clinic_id };
}

// Cache mémoire des permissions (la matrice change rarement ; redémarrage = recharge)
const permCache = new Map<string, Set<string>>();

export async function hasPermission(db: Pool, role: string, permission: string): Promise<boolean> {
  let set = permCache.get(role);
  if (!set) {
    const { rows } = await db.query(`SELECT permission FROM role_permissions WHERE role = $1`, [role]);
    set = new Set(rows.map((r) => r.permission as string));
    permCache.set(role, set);
  }
  return set.has(permission);
}

/** preHandler Fastify : exige une session valide et, optionnellement, une permission. */
export function authed(db: Pool, permission?: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(db, req, reply);
    if (!user) return;
    if (permission && !(await hasPermission(db, user.role, permission))) {
      reply.code(403).send({ error: "forbidden", message: "Action non autorisée pour ce rôle." });
      return;
    }
    req.user = user;
  };
}

/** Erreurs métier → réponses HTTP cohérentes. */
export function dbError(reply: FastifyReply, e: unknown): void {
  const err = e as { code?: string; message?: string };
  if (err?.code === "23P01") {
    // violation de contrainte d'exclusion (ex. double RDV)
    reply.code(409).send({ error: "conflict", message: "Conflit de planification : ce créneau est déjà occupé." });
    return;
  }
  if (err?.code === "23505") {
    reply.code(409).send({ error: "duplicate", message: "Doublon : cet élément existe déjà." });
    return;
  }
  if (err?.code === "23503") {
    reply.code(400).send({ error: "invalid_reference", message: "Référence invalide." });
    return;
  }
  if (err?.message?.includes("Consultation signée")) {
    reply.code(409).send({ error: "signed", message: "Consultation signée : modification interdite, créer un avenant." });
    return;
  }
  throw e;
}
