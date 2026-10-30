// Seed de démonstration : 1 clinique + 4 utilisateurs (mot de passe: Demo1234!)
// Exécution : cd api && ./node_modules/.bin/tsx src/seed.ts
import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env") });

import { Pool } from "pg";
import argon2 from "argon2";

const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const hash = await argon2.hash("Demo1234!");
  const { rows: c } = await db.query(
    `INSERT INTO clinics (code, name, city) VALUES ('001','Clinique Plateau','Abidjan')
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  const clinicId = c[0].id;
  const users = [
    ["admin_clinique", "Admin Démo", "admin@clinique.ci", "+2250700000001"],
    ["secretaire", "Awa Secrétaire", "secretaire@clinique.ci", "+2250700000002"],
    ["medecin", "Dr Koné", "medecin@clinique.ci", "+2250700000003"],
    ["caissier", "Ibrahim Caissier", "caisse@clinique.ci", "+2250700000004"],
  ];
  for (const [role, name, email, phone] of users) {
    await db.query(
      `INSERT INTO users (clinic_id, role, full_name, email, phone, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         failed_logins = 0, locked_until = NULL, mfa_secret_enc = NULL,
         mfa_pending_enc = NULL, is_active = true`,
      [clinicId, role, name, email, phone, hash],
    );
  }
  // Un assureur de démo
  await db.query(
    `INSERT INTO insurers (code, name) VALUES ('MUGEF-CI','MUGEF-CI')
     ON CONFLICT (code) DO NOTHING`,
  );
  console.log("Seed OK — comptes : admin@clinique.ci / secretaire@clinique.ci / medecin@clinique.ci / caisse@clinique.ci (Demo1234!)");
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
