"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createInvoice, type FormState } from "@/lib/actions";

interface Line { actCode: string; label: string; quantity: number; unitFcfa: number }

const initial: FormState = { ok: true };

export default function NewInvoiceForm({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [state, action, pending] = useActionState(createInvoice, initial);
  const [lines, setLines] = useState<Line[]>([{ actCode: "CONS-01", label: "Consultation générale", quantity: 1, unitFcfa: 5000 }]);
  const [insurerPart, setInsurerPart] = useState(0);

  const total = lines.reduce((s, l) => s + l.quantity * l.unitFcfa, 0);
  const patientPart = total - insurerPart;

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      {!state.ok && <div className="alert alert-error">{state.message}</div>}
      <p className="hint">Patient : <strong>{patientName}</strong></p>
      <form action={action}>
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="lines" value={JSON.stringify(lines)} />
        <input type="hidden" name="insurerPartFcfa" value={insurerPart} />
        <input type="hidden" name="patientPartFcfa" value={patientPart} />

        {lines.map((l, i) => (
          <div key={i} className="card" style={{ padding: 12, background: "#f8fbf9" }}>
            <div className="form-row">
              <div className="field">
                <label>Code acte</label>
                <input value={l.actCode} onChange={(e) => setLine(i, { actCode: e.target.value })} required />
              </div>
              <div className="field">
                <label>Libellé</label>
                <input value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} required />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Quantité</label>
                <input type="number" min={1} value={l.quantity}
                  onChange={(e) => setLine(i, { quantity: Math.max(1, Number(e.target.value)) })} />
              </div>
              <div className="field">
                <label>Prix unitaire (F CFA)</label>
                <input type="number" min={0} value={l.unitFcfa}
                  onChange={(e) => setLine(i, { unitFcfa: Math.max(0, Number(e.target.value)) })} />
              </div>
            </div>
            {lines.length > 1 && (
              <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: ".82rem" }}
                onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                Retirer cette ligne
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-secondary"
          onClick={() => setLines((ls) => [...ls, { actCode: "", label: "", quantity: 1, unitFcfa: 0 }])}>
          + Ajouter une ligne
        </button>

        <div className="field" style={{ marginTop: 16, maxWidth: 280 }}>
          <label htmlFor="insurerPart">Part assureur (F CFA)</label>
          <input id="insurerPart" type="number" min={0} max={total} value={insurerPart}
            onChange={(e) => setInsurerPart(Math.min(total, Math.max(0, Number(e.target.value))))} />
        </div>
        <p><strong>Total : {total.toLocaleString("fr-FR")} F CFA</strong> (patient : {patientPart.toLocaleString("fr-FR")} F CFA)</p>

        <button className="btn" type="submit" disabled={pending || lines.length === 0}>
          {pending ? "Création…" : "Créer la facture"}
        </button>
      </form>
    </div>
  );
}
