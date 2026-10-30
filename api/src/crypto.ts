import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Chiffrement applicatif des données de santé (colonnes *_enc, bytea).
// La clé vient de DATA_ENC_KEY pour le MVP (32 octets en base64) ;
// à remplacer par un KMS/HSM avant toute donnée réelle (cf. DECISIONS.md).
function dataKey(): Buffer {
  const key = Buffer.from(process.env.DATA_ENC_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("DATA_ENC_KEY doit contenir 32 octets encodés en base64");
  return key;
}

export function encryptField(plain: string | null | undefined): Buffer | null {
  if (plain == null || plain === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

export function decryptField(blob: Buffer | Uint8Array | null | undefined): string | null {
  if (blob == null) return null;
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  if (buf.length < 28) throw new Error("Chiffré invalide");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", dataKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
