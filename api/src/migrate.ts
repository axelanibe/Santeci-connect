import { config } from "dotenv";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, "..", ".env") });

import { Pool } from "pg";
const db = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  // Base : schéma initial si la base est vide
  const { rows } = await db.query(`SELECT to_regclass('public.users') AS t`);
  if (!rows[0].t) {
    console.log("application du schéma initial (db/schema.sql)…");
    await db.query(readFileSync(join(root, "..", "db", "schema.sql"), "utf8"));
    await db.query(`INSERT INTO schema_migrations (name) VALUES ('000_baseline')`);
  }

  // Migrations numérotées, dans l'ordre
  const dir = join(root, "..", "db", "migrations");
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith(".sql")) continue;
      const name = f.replace(/\.sql$/, "");
      const done = await db.query(`SELECT 1 FROM schema_migrations WHERE name = $1`, [name]);
      if (done.rowCount === 0) {
        console.log(`migration ${name}…`);
        await db.query(readFileSync(join(dir, f), "utf8"));
        await db.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [name]);
      }
    }
  }
  console.log("migrations à jour.");
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
