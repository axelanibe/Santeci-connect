import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // tolère ±30 secondes de décalage d'horloge
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Base32 invalide");
    value = ((value << 5) | idx) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// Compteur de pas (RFC 6238) pour un instant donné
export function stepAt(atMs: number): number {
  return Math.floor(atMs / 1000 / STEP_SECONDS);
}

export function generateTotp(secret: Buffer, step: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", secret).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code =
    ((h[offset] & 0x7f) << 24) |
    (h[offset + 1] << 16) |
    (h[offset + 2] << 8) |
    h[offset + 3];
  return (code % 10 ** digits).toString().padStart(digits, "0");
}

// Renvoie le pas accepté, ou null. Le pas doit être strictement supérieur au dernier utilisé (anti-rejeu).
export function verifyTotp(
  secret: Buffer,
  code: string,
  lastStep: number | null,
  atMs: number = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepAt(atMs);
  for (let drift = -WINDOW; drift <= WINDOW; drift++) {
    const step = now + drift;
    if (lastStep !== null && step <= lastStep) continue;
    const expected = Buffer.from(generateTotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

export function newSecret(): Buffer {
  return randomBytes(20);
}

export function otpauthUri(secret: Buffer, accountLabel: string, issuer = "SanteCI Connect"): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=${encodeURIComponent(issuer)}&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// Chiffrement applicatif. La clé vient de l'environnement pour le MVP ; à remplacer par un KMS.
function encKey(): Buffer {
  const key = Buffer.from(process.env.MFA_ENC_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("MFA_ENC_KEY doit contenir 32 octets encodés en base64");
  return key;
}

export function encryptSecret(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

export function decryptSecret(blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
