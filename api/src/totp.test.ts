import { describe, expect, it, beforeAll } from "vitest";
import { generateTotp, verifyTotp, base32Encode, base32Decode, encryptSecret, decryptSecret, stepAt } from "./totp.js";

// Vecteurs de test RFC 6238 (SHA-1, secret ASCII "12345678901234567890", 8 chiffres)
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");

describe("TOTP — RFC 6238", () => {
  it("reproduit le vecteur T=59 s", () => {
    expect(generateTotp(RFC_SECRET, stepAt(59_000), 8)).toBe("94287082");
  });

  it("reproduit le vecteur T=1111111109 s", () => {
    expect(generateTotp(RFC_SECRET, stepAt(1_111_111_109_000), 8)).toBe("07081804");
  });
});

describe("verifyTotp", () => {
  it("accepte le code courant", () => {
    const at = 1_700_000_000_000;
    const code = generateTotp(RFC_SECRET, stepAt(at));
    expect(verifyTotp(RFC_SECRET, code, null, at)).toBe(stepAt(at));
  });

  it("refuse un code rejoué (même pas ou pas antérieur)", () => {
    const at = 1_700_000_000_000;
    const step = stepAt(at);
    const code = generateTotp(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, step, at)).toBeNull();
  });

  it("refuse un format invalide", () => {
    expect(verifyTotp(RFC_SECRET, "12ab56", null)).toBeNull();
  });
});

describe("base32", () => {
  it("fait l'aller-retour", () => {
    const buf = Buffer.from("SanteCI!");
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });
});

describe("chiffrement des secrets 2FA", () => {
  beforeAll(() => {
    process.env.MFA_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("déchiffre ce qui a été chiffré", () => {
    const blob = encryptSecret(RFC_SECRET);
    expect(decryptSecret(blob).equals(RFC_SECRET)).toBe(true);
  });

  it("détecte une altération du chiffré", () => {
    const blob = encryptSecret(RFC_SECRET);
    blob[blob.length - 1] ^= 1;
    expect(() => decryptSecret(blob)).toThrow();
  });
});
