"use client";

import { useActionState, useState } from "react";
import { recordPayment, setInvoiceStatus, type FormState } from "@/lib/actions";

const initial: FormState = { ok: true };

const NEXT_STATUS: Record<string, { status: string; label: string }[]> = {
  draft: [{ status: "pending", label: "Passer en attente" }],
  pending: [{ status: "sent", label: "Envoyer" }],
  sent: [
    { status: "validated", label: "Valider" },
    { status: "rejected", label: "Rejeter" },
  ],
  rejected: [{ status: "draft", label: "Repasse en brouillon" }],
};

export function PaymentForm({ invoiceId }: { invoiceId: string }) {
  const [state, action, pending] = useActionState(recordPayment.bind(null, invoiceId), initial);
  return (
    <form action={action}>
      {!state.ok && <div className="alert alert-error">{state.message}</div>}
      <div className="form-row">
        <div className="field">
          <label htmlFor="operator">Opérateur *</label>
          <select id="operator" name="operator" required defaultValue="wave">
            <option value="wave">Wave</option>
            <option value="orange">Orange Money</option>
            <option value="mtn">MTN MoMo</option>
            <option value="cash">Espèces</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="amountFcfa">Montant (F CFA) *</label>
          <input id="amountFcfa" name="amountFcfa" type="number" min={1} required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="providerRef">Référence opérateur</label>
        <input id="providerRef" name="providerRef" maxLength={100} placeholder="ex. WAVE-2026-XXXX" />
      </div>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer le paiement"}
      </button>
    </form>
  );
}

export function InvoiceStatusButtons({ id, status }: { id: string; status: string }) {
  const [msg, setMsg] = useState("");
  const actions = NEXT_STATUS[status] ?? [];
  if (!actions.length) return null;
  async function run(s: string) {
    const r = await setInvoiceStatus(id, s);
    if (!r.ok) setMsg(r.message ?? "Erreur");
  }
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {actions.map((a) => (
        <button key={a.status} type="button" className="btn btn-secondary" onClick={() => run(a.status)}>
          {a.label}
        </button>
      ))}
      {msg && <span className="hint" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}
