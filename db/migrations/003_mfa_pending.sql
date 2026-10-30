-- 003 — Enrôlement 2FA en deux temps : le secret ne devient actif qu'après
-- confirmation par un premier code (corrige le point ouvert de DECISIONS.md).
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_pending_enc bytea;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_pending_at timestamptz;
