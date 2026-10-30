"use client";

import { useActionState, useState } from "react";
import { updateConsultation, signConsultation, type FormState } from "@/lib/actions";

interface Consultation {
  id: string;
  subjective: string | null; objective: string | null;
  assessment: string | null; plan: string | null;
  diagnosisCode: string | null; signedAt: string | null;
}

const initial: FormState = { ok: true };

export default function ConsultationDetail({ consultation }: { consultation: Consultation }) {
  const [state, action, pending] = useActionState(
    updateConsultation.bind(null, consultation.id), initial,
  );
  const [signMsg, setSignMsg] = useState("");
  const [signing, setSigning] = useState(false);
  const signed = !!consultation.signedAt;

  async function sign() {
    if (!confirm("Signer cette consultation ? Elle deviendra immuable.")) return;
    setSigning(true);
    const r = await signConsultation(consultation.id);
    setSigning(false);
    if (!r.ok) setSignMsg(r.message ?? "Erreur");
  }

  const fields: { key: "subjective" | "objective" | "assessment" | "plan"; label: string }[] = [
    { key: "subjective", label: "S — Subjectif" },
    { key: "objective", label: "O — Objectif" },
    { key: "assessment", label: "A — Évaluation" },
    { key: "plan", label: "P — Plan" },
  ];

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      {signed ? (
        <div className="alert alert-ok">Consultation signée — immuable (tout ajout passe par un avenant).</div>
      ) : (
        <p className="hint">Brouillon — modifiable jusqu'à la signature.</p>
      )}
      {!state.ok && <div className="alert alert-error">{state.message}</div>}
      {signMsg && <div className="alert alert-error">{signMsg}</div>}

      <form action={action}>
        {fields.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={f.key}>{f.label}</label>
            <textarea id={f.key} name={f.key} defaultValue={consultation[f.key] ?? ""} disabled={signed} />
          </div>
        ))}
        <div className="field">
          <label htmlFor="diagnosisCode">Diagnostic (code CIM-10)</label>
          <input id="diagnosisCode" name="diagnosisCode" maxLength={20}
            defaultValue={consultation.diagnosisCode ?? ""} disabled={signed} style={{ maxWidth: 200 }} />
        </div>
        {!signed && (
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" type="submit" disabled={pending}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button className="btn btn-secondary" type="button" onClick={sign} disabled={signing}>
              {signing ? "Signature…" : "Signer la consultation"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
