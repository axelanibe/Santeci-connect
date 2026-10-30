"use client";

import { useActionState } from "react";
import { createConsultation, type FormState } from "@/lib/actions";

const initial: FormState = { ok: true };

export default function NewConsultationForm({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [state, action, pending] = useActionState(createConsultation, initial);

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      {!state.ok && <div className="alert alert-error">{state.message}</div>}
      <p className="hint">Patient : <strong>{patientName}</strong></p>
      <form action={action}>
        <input type="hidden" name="patientId" value={patientId} />
        <div className="field">
          <label htmlFor="subjective"><strong>S</strong> — Subjectif (motif, symptômes rapportés)</label>
          <textarea id="subjective" name="subjective" />
        </div>
        <div className="field">
          <label htmlFor="objective"><strong>O</strong> — Objectif (examen clinique, constantes)</label>
          <textarea id="objective" name="objective" />
        </div>
        <div className="field">
          <label htmlFor="assessment"><strong>A</strong> — Évaluation (analyse, hypothèses)</label>
          <textarea id="assessment" name="assessment" />
        </div>
        <div className="field">
          <label htmlFor="plan"><strong>P</strong> — Plan (conduite à tenir, ordonnance)</label>
          <textarea id="plan" name="plan" />
        </div>
        <div className="field">
          <label htmlFor="diagnosisCode">Diagnostic (code CIM-10)</label>
          <input id="diagnosisCode" name="diagnosisCode" maxLength={20} placeholder="ex. B54" style={{ maxWidth: 200 }} />
        </div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer le brouillon"}
        </button>
      </form>
    </div>
  );
}
