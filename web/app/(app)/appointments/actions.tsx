"use client";

import { useState } from "react";
import { setAppointmentStatus } from "@/lib/actions";

const NEXT: Record<string, { status: string; label: string }[]> = {
  scheduled: [
    { status: "confirmed", label: "Confirmer" },
    { status: "cancelled", label: "Annuler" },
  ],
  confirmed: [
    { status: "done", label: "Terminé" },
    { status: "no_show", label: "Absent" },
    { status: "cancelled", label: "Annuler" },
  ],
};

export default function AppointmentActions({ id, status }: { id: string; status: string }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const actions = NEXT[status] ?? [];
  if (!actions.length) return null;

  async function run(s: string) {
    setBusy(true);
    setMsg("");
    const r = await setAppointmentStatus(id, s);
    if (!r.ok) setMsg(r.message ?? "Erreur");
    setBusy(false);
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      {actions.map((a) => (
        <button key={a.status} className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: ".82rem" }}
          disabled={busy} onClick={() => run(a.status)}>
          {a.label}
        </button>
      ))}
      {msg && <span className="hint" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}
