"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createAppointment, type FormState } from "@/lib/actions";

interface Doctor { id: string; fullName: string }
interface Patient { id: string; firstName: string; lastName: string }

const initial: FormState = { ok: true };

export default function NewAppointmentForm({ doctors, initialPatient }: { doctors: Doctor[]; initialPatient: Patient | null }) {
  const [state, action, pending] = useActionState(createAppointment, initial);
  const [patient, setPatient] = useState<Patient | null>(initialPatient);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    try {
      const res = await fetch(`/api/patients?search=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.patients ?? []);
    } finally {
      setSearching(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      {!state.ok && <div className="alert alert-error">{state.message}</div>}
      <form action={action}>
        <input type="hidden" name="patientId" value={patient?.id ?? ""} />

        <div className="field">
          <label>Patient *</label>
          {patient ? (
            <p><strong>{patient.lastName} {patient.firstName}</strong>{" "}
              <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: ".82rem" }}
                onClick={() => setPatient(null)}>Changer</button>
            </p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom ou téléphone…" style={{ flex: 1 }} />
                <button type="button" className="btn btn-secondary" onClick={search} disabled={searching}>
                  {searching ? "…" : "Chercher"}
                </button>
              </div>
              {results.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, marginTop: 8, border: "1px solid var(--line)", borderRadius: 8 }}>
                  {results.map((p) => (
                    <li key={p.id} style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
                      <button type="button" onClick={() => { setPatient(p); setResults([]); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--green-700)", fontSize: "1rem" }}>
                        {p.lastName} {p.firstName}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!patient && <p className="hint">Choisissez un patient ci-dessus, ou <Link href="/patients/new">créez son dossier</Link>.</p>}
            </>
          )}
        </div>

        <div className="field">
          <label htmlFor="doctorId">Médecin *</label>
          <select id="doctorId" name="doctorId" required defaultValue="">
            <option value="" disabled>Choisir…</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}
          </select>
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="date">Date *</label>
            <input id="date" name="date" type="date" required defaultValue={today} min={today} />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="startTime">Début *</label>
            <input id="startTime" name="startTime" type="time" required defaultValue="09:00" />
          </div>
          <div className="field">
            <label htmlFor="endTime">Fin *</label>
            <input id="endTime" name="endTime" type="time" required defaultValue="09:30" />
          </div>
        </div>

        <button className="btn" type="submit" disabled={pending || !patient}>
          {pending ? "Planification…" : "Planifier le rendez-vous"}
        </button>
      </form>
    </div>
  );
}
