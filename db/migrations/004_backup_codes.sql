-- 004 — Codes de secours 2FA (usage unique, hachés en SHA-256)
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mfa_backup_codes_user_idx ON mfa_backup_codes (user_id);
