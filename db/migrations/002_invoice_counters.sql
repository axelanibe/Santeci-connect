-- 002 — Compteurs pour les numéros de facture FAC-{code_clinique}-{AAAAMM}-{seq}
CREATE TABLE IF NOT EXISTS invoice_counters (
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  yyyymm    text NOT NULL CHECK (yyyymm ~ '^[0-9]{6}$'),
  seq       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, yyyymm)
);
