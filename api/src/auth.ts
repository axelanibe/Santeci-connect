import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import type { Pool } from "pg";
import { decryptSecret, verifyTotp, encryptSecret, newSecret, otpauthUri } from "./totp.js";

// Paramètres de l'US-01 et du PAS
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const SESSION_TTL_MINUTES = { web: 30, mobile: 120 } as const;

const loginSchema = z.object({
  identifier: z.string().min(3).max(254), // email ou téléphone E.164
  password: z.string().min(8).max(256),
  channel: z.enum(["web", "mobile"]),
  // code TOTP à 6 chiffres ou code de secours alphanumérique
  totp: z.string().min(6).max(16).optional(),
});

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; userId: string; role: string }
  | {
      ok: false;
      reason: "invalid_input" | "invalid_credentials" | "mfa_required" | "locked" | "inactive";
    };

export const hashToken = (token: string): Buffer =>
  createHash("sha256").update(token).digest();

// Hachage Argon2id jetable, calculé une seule fois, pour égaliser le temps de réponse
// quand le compte n'existe pas.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= argon2.hash(randomBytes(16).toString("hex")));

export async function login(db: Pool, rawInput: unknown, ip: string | null): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "invalid_input" };
  const { identifier, password, channel, totp } = parsed.data;

  const { rows } = await db.query(
    `SELECT id, role, password_hash, is_active, failed_logins, locked_until,
            mfa_secret_enc, mfa_last_step
       FROM users
      WHERE email = $1 OR phone = $1
      LIMIT 1`,
    [identifier],
  );
  const user = rows[0];

  if (!user || !user.password_hash) {
    await argon2.verify(await getDummyHash(), password).catch(() => false);
    return { ok: false, reason: "invalid_credentials" };
  }
  if (!user.is_active) return { ok: false, reason: "inactive" };
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return { ok: false, reason: "locked" };
  }

  const passwordOk = await argon2.verify(user.password_hash, password).catch(() => false);
  if (!passwordOk) return recordFailure(db, user, ip);

  // 2FA obligatoire si un secret est enregistré (rôles admin et médecin, cf. PAS 2.7.2).
  // Accepte le code TOTP ou, à défaut, un code de secours (usage unique).
  if (user.mfa_secret_enc) {
    if (!totp) return { ok: false, reason: "mfa_required" };

    let step: number | null = null;
    let viaBackup = false;
    if (/^\d{6}$/.test(totp)) {
      const secret = decryptSecret(user.mfa_secret_enc);
      step = verifyTotp(secret, totp, user.mfa_last_step);
    } else {
      viaBackup = await verifyBackupCode(db, user.id, totp.toUpperCase());
    }
    if (step === null && !viaBackup) return recordFailure(db, user, ip);

    if (step !== null) {
      await db.query(`UPDATE users SET mfa_last_step = $2 WHERE id = $1`, [user.id, step]);
    }
  }

  await db.query(`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1`, [user.id]);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES[channel] * 60_000);
  await db.query(
    `INSERT INTO sessions (user_id, channel, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [user.id, channel, hashToken(token), expiresAt],
  );

  await auditLog(db, user.id, null, "auth.login_success", "user", user.id, ip);
  return { ok: true, token, expiresAt, userId: user.id, role: user.role };
}

async function recordFailure(
  db: Pool,
  user: { id: string; failed_logins: number },
  ip: string | null,
): Promise<LoginResult> {
  const attempts = user.failed_logins + 1;
  const lock = attempts >= MAX_FAILED_LOGINS;
  await db.query(
    `UPDATE users
        SET failed_logins = $2,
            locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE NULL END
      WHERE id = $1`,
    [user.id, lock ? 0 : attempts, lock, LOCK_MINUTES],
  );
  await auditLog(db, user.id, null, "auth.login_failed", "user", user.id, ip);
  return lock ? { ok: false, reason: "locked" } : { ok: false, reason: "invalid_credentials" };
}

// Enrôlement 2FA en deux temps : le secret est stocké en attente et ne devient
// actif qu'après confirmation par un premier code (confirmMfa). Sans cette étape,
// une faute de scan bloquerait le compte.
export async function enrollMfa(db: Pool, userId: string): Promise<string> {
  const secret = newSecret();
  await db.query(
    `UPDATE users SET mfa_pending_enc = $2, mfa_pending_at = now() WHERE id = $1`,
    [userId, encryptSecret(secret)],
  );
  const { rows } = await db.query(`SELECT email, phone FROM users WHERE id = $1`, [userId]);
  return otpauthUri(secret, rows[0]?.email ?? rows[0]?.phone ?? userId);
}

const PENDING_TTL_MINUTES = 15;

export async function confirmMfa(
  db: Pool,
  userId: string,
  totp: string,
): Promise<{ ok: true } | { ok: false; reason: "no_pending" | "expired" | "invalid_code" }> {
  const { rows } = await db.query(
    `SELECT mfa_pending_enc, mfa_pending_at FROM users WHERE id = $1`,
    [userId],
  );
  const pending = rows[0]?.mfa_pending_enc;
  if (!pending) return { ok: false, reason: "no_pending" };
  if (Date.now() - new Date(rows[0].mfa_pending_at).getTime() > PENDING_TTL_MINUTES * 60_000) {
    await db.query(`UPDATE users SET mfa_pending_enc = NULL, mfa_pending_at = NULL WHERE id = $1`, [userId]);
    return { ok: false, reason: "expired" };
  }
  if (!/^\d{6}$/.test(totp)) return { ok: false, reason: "invalid_code" };
  const step = verifyTotp(decryptSecret(pending), totp, null);
  if (step === null) return { ok: false, reason: "invalid_code" };
  await db.query(
    `UPDATE users SET mfa_secret_enc = mfa_pending_enc, mfa_last_step = $2,
                      mfa_pending_enc = NULL, mfa_pending_at = NULL
      WHERE id = $1`,
    [userId, step],
  );
  await auditLog(db, userId, null, "auth.mfa_enrolled", "user", userId, null);
  return { ok: true };
}

// Codes de secours 2FA : 10 codes à usage unique, hachés en SHA-256.
// Régénérer les codes invalide les précédents.
const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export async function generateBackupCodes(db: Pool, userId: string): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    let c = "";
    for (let j = 0; j < 8; j++) c += BACKUP_ALPHABET[randomBytes(1)[0] % BACKUP_ALPHABET.length];
    codes.push(c);
  }
  await db.query(`DELETE FROM mfa_backup_codes WHERE user_id = $1`, [userId]);
  for (const c of codes) {
    await db.query(`INSERT INTO mfa_backup_codes (user_id, code_hash) VALUES ($1, $2)`, [
      userId,
      createHash("sha256").update(c).digest("hex"),
    ]);
  }
  await auditLog(db, userId, null, "auth.mfa_backup_codes_regenerated", "user", userId, null);
  return codes;
}

async function verifyBackupCode(db: Pool, userId: string, code: string): Promise<boolean> {
  if (!/^[A-Z2-9]{8}$/.test(code)) return false;
  const hash = createHash("sha256").update(code).digest("hex");
  const { rows } = await db.query(
    `UPDATE mfa_backup_codes SET used_at = now()
      WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
      RETURNING id`,
    [userId, hash],
  );
  return rows.length > 0;
}

export async function revokeSession(db: Pool, token: string): Promise<void> {
  await db.query(`UPDATE sessions SET revoked_at = now() WHERE token_hash = $1`, [hashToken(token)]);
}

export async function resolveSession(db: Pool, token: string) {
  const { rows } = await db.query(
    `SELECT s.user_id, u.role, u.clinic_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.is_active`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export async function auditLog(
  db: Pool,
  actorId: string | null,
  clinicId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  ip: string | null,
) {
  await db.query(
    `INSERT INTO audit_log (actor_id, clinic_id, action, entity, entity_id, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorId, clinicId, action, entity, entityId, ip],
  );
}
