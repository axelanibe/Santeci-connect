"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, ...(needTotp ? { totp } : {}) }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      if (data.error === "mfa_required") {
        setNeedTotp(true);
        setError("");
      } else {
        setError(data.message ?? "Erreur de connexion.");
      }
    } catch {
      setError("Serveur injoignable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="logo">
          <span className="dot" />
          <h1>SanteCI Connect</h1>
        </div>
        <p className="sub">Espace clinique — connectez-vous pour continuer.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          {!needTotp ? (
            <>
              <div className="field">
                <label htmlFor="identifier">E-mail ou téléphone</label>
                <input
                  id="identifier" type="text" autoComplete="username" required
                  value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="ex. marie@clinique.ci" disabled={loading}
                />
              </div>
              <div className="field">
                <label htmlFor="password">Mot de passe</label>
                <input
                  id="password" type="password" autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
            </>
          ) : (
            <div className="field">
              <label htmlFor="totp">Code de vérification à 6 chiffres</label>
              <input
                id="totp" className="code-input" inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} required autoFocus
                value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••" disabled={loading}
              />
              <p className="hint">Ouvrez votre application d'authentification (ou utilisez un code de secours).</p>
            </div>
          )}
          <button className="btn" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Connexion…" : needTotp ? "Vérifier et me connecter" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
