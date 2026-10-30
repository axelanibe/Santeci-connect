import { config } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Charge ~/workspace/santeci-connect/.env (à la racine du projet)
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env") });

import { Pool } from "pg";
import { buildApp } from "./app.js";

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const app = buildApp(db);

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
