-- =============================================================
-- SanteCI Connect — schéma initial (PostgreSQL 15+)
-- Données sensibles : chiffrées au niveau applicatif (bytea),
-- clé gérée hors base (KMS/HSM). Voir README.md.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------- Types énumérés ----------
CREATE TYPE user_role AS ENUM (
  'admin_clinique', 'medecin', 'secretaire', 'caissier', 'patient', 'agent_assureur'
);
CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'cancelled', 'done', 'no_show');
CREATE TYPE invoice_status AS ENUM ('draft', 'pending', 'sent', 'validated', 'rejected', 'paid');
CREATE TYPE payment_operator AS ENUM ('wave', 'orange', 'mtn', 'cash');

-- ---------- Cliniques ----------
CREATE TABLE clinics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,            -- ex. '001', utilisé dans FAC-{code}-YYYYMM-seq
  name        text NOT NULL,
  city        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- Utilisateurs (personnel + patients avec compte) ----------
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid REFERENCES clinics(id),   -- NULL pour patients et agents assureurs
  role            user_role NOT NULL,
  full_name       text NOT NULL,
  email           text UNIQUE,
  phone           text UNIQUE,                   -- format E.164, ex. +2250789451233
  password_hash   text,                          -- Argon2id ; NULL pour patients (OTP)
  mfa_secret_enc  bytea,                         -- chiffré applicatif (AES-256-GCM)
  mfa_last_step   bigint,                        -- dernier pas TOTP accepté (anti-rejeu)
  failed_logins   int NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK (role IN ('patient', 'agent_assureur') OR clinic_id IS NOT NULL),
  CHECK (role <> 'patient' OR password_hash IS NULL)
);

-- Sessions (révocables à distance, expiration 30 min web / 2 h mobile)
CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,            -- SHA-256 du jeton ; le jeton brut n'est jamais stocké
  channel      text NOT NULL CHECK (channel IN ('web', 'mobile')),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Permissions par rôle (matrice rôles × permissions, configurable)
CREATE TABLE role_permissions (
  role        user_role NOT NULL,
  permission  text NOT NULL,                     -- ex. 'patient:read', 'diagnosis:read'
  PRIMARY KEY (role, permission)
);

-- ---------- Assureurs et couvertures ----------
CREATE TABLE insurers (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code   text NOT NULL UNIQUE,                   -- ex. 'MUGEF-CI', 'CMU', 'ASACI'
  name   text NOT NULL
);

-- ---------- Patients ----------
CREATE TABLE patients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES clinics(id),   -- dossier rattaché à la clinique
  user_id       uuid UNIQUE REFERENCES users(id),        -- compte app patient (optionnel)
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  birth_date    date NOT NULL,
  sex           text NOT NULL CHECK (sex IN ('F', 'M')),
  phone         text,                                    -- E.164
  email         text,
  address       text,
  cni_enc       bytea,                                   -- chiffré
  cmu_number_enc bytea,                                  -- chiffré
  blood_group   text,                                    -- donnée de santé : chiffrer si stocké en clair ailleurs
  allergies_enc bytea,                                   -- donnée de santé : chiffrée
  qr_token      uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  deleted_at    timestamptz,                             -- suppression logique
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX patients_clinic_name_idx ON patients (clinic_id, last_name, first_name);
CREATE INDEX patients_phone_idx ON patients (phone);

-- Couverture d'assurance du patient
CREATE TABLE patient_insurance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      uuid NOT NULL REFERENCES patients(id),
  insurer_id      uuid NOT NULL REFERENCES insurers(id),
  member_number   text NOT NULL,
  coverage_rate   numeric(4,3) NOT NULL CHECK (coverage_rate >= 0 AND coverage_rate <= 1),
  valid_until     date,
  UNIQUE (patient_id, insurer_id, member_number)
);

-- ---------- Rendez-vous ----------
CREATE TABLE appointments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL REFERENCES clinics(id),
  patient_id  uuid NOT NULL REFERENCES patients(id),
  doctor_id   uuid NOT NULL REFERENCES users(id),
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  status      appointment_status NOT NULL DEFAULT 'scheduled',
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  -- Pas deux RDV actifs qui se chevauchent pour le même médecin (US-07)
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status <> 'cancelled')
);

-- ---------- Consultations (SOAP, immuable après signature) ----------
CREATE TABLE consultations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES clinics(id),
  patient_id        uuid NOT NULL REFERENCES patients(id),
  doctor_id         uuid NOT NULL REFERENCES users(id),
  appointment_id    uuid REFERENCES appointments(id),
  subjective_enc    bytea,                    -- S
  objective_enc     bytea,                    -- O
  assessment_enc    bytea,                    -- A
  plan_enc          bytea,                    -- P
  diagnosis_code    text,                     -- CIM-10 (non chiffré pour recherche/statistiques anonymisées)
  signed_at         timestamptz,
  signed_by         uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ---------- Facturation ----------
CREATE TABLE invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES clinics(id),
  patient_id      uuid NOT NULL REFERENCES patients(id),
  consultation_id uuid REFERENCES consultations(id),
  insurer_id      uuid REFERENCES insurers(id),
  number          text NOT NULL UNIQUE,            -- FAC-{clinic_code}-YYYYMM-seq
  status          invoice_status NOT NULL DEFAULT 'draft',
  total_fcfa      integer NOT NULL CHECK (total_fcfa >= 0),
  insurer_part_fcfa integer NOT NULL DEFAULT 0 CHECK (insurer_part_fcfa >= 0),
  patient_part_fcfa integer NOT NULL DEFAULT 0 CHECK (patient_part_fcfa >= 0),
  insurer_file_ref  text,                          -- numéro de dossier côté assureur
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (insurer_part_fcfa + patient_part_fcfa = total_fcfa)
);

CREATE TABLE invoice_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  act_code    text NOT NULL,                       -- ex. 'CONS-01'
  label       text NOT NULL,
  quantity    integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_fcfa   integer NOT NULL CHECK (unit_fcfa >= 0)
);

-- Paiements Mobile Money : références uniquement, aucune donnée bancaire
CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES invoices(id),
  operator      payment_operator NOT NULL,
  amount_fcfa   integer NOT NULL CHECK (amount_fcfa > 0),
  provider_ref  text UNIQUE,                       -- référence de l'opérateur
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'timeout')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- Journal d'audit : append-only + chaînage de hachage ----------
CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid REFERENCES users(id),
  clinic_id    uuid REFERENCES clinics(id),
  action       text NOT NULL,                      -- ex. 'patient.read', 'invoice.export'
  entity       text NOT NULL,
  entity_id    uuid,
  ip           inet,
  prev_hash    bytea,
  hash         bytea
);

CREATE OR REPLACE FUNCTION audit_chain() RETURNS trigger AS $$
DECLARE last_hash bytea;
BEGIN
  -- Sérialise les insertions pour que la chaîne reste cohérente
  PERFORM pg_advisory_xact_lock(4242);
  SELECT hash INTO last_hash FROM audit_log ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := COALESCE(last_hash, '\x00'::bytea);
  NEW.hash := digest(
    NEW.prev_hash || convert_to(
      concat_ws('|', NEW.occurred_at, NEW.actor_id, NEW.clinic_id, NEW.action, NEW.entity, NEW.entity_id, NEW.ip),
      'UTF8'),
    'sha256');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_chain_trg BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_chain();

CREATE OR REPLACE FUNCTION deny_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % en lecture seule (journal d''audit / consultation signée)', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION deny_mutation();

-- Une consultation signée ne peut plus être modifiée (modification = avenant)
CREATE OR REPLACE FUNCTION consultation_lock() RETURNS trigger AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Consultation signée : modification interdite, créer un avenant';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER consultation_lock_trg BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION consultation_lock();

-- ---------- Index utiles ----------
CREATE INDEX appointments_doctor_day_idx ON appointments (doctor_id, starts_at);
CREATE INDEX invoices_clinic_status_idx ON invoices (clinic_id, status);
CREATE INDEX audit_entity_idx ON audit_log (entity, entity_id);
