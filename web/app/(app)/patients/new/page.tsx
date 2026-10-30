"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createPatient, type FormState } from "@/lib/actions";

const initial: FormState = { ok: true };

export default function NewPatientPage() {
  const [state, action, pending] = useActionState(createPatient, initial);

  return (
    <>
      <div className="page-head">
        <h1>Nouveau patient</h1>
        <Link href="/patients" className="btn btn-secondary">Retour</Link>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        {!state.ok && <div className="alert alert-error">{state.message}</div>}
        <form action={action}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="lastName">Nom *</label>
              <input id="lastName" name="lastName" required maxLength={100} />
            </div>
            <div className="field">
              <label htmlFor="firstName">Prénom(s) *</label>
              <input id="firstName" name="firstName" required maxLength={100} />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="birthDate">Date de naissance *</label>
              <input id="birthDate" name="birthDate" type="date" required />
            </div>
            <div className="field">
              <label htmlFor="sex">Sexe *</label>
              <select id="sex" name="sex" required defaultValue="F">
                <option value="F">Femme</option>
                <option value="M">Homme</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="phone">Téléphone</label>
              <input id="phone" name="phone" placeholder="+225…" />
            </div>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" name="email" type="email" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="address">Adresse</label>
            <input id="address" name="address" maxLength={500} />
          </div>
          <div className="field">
            <label htmlFor="bloodGroup">Groupe sanguin</label>
            <select id="bloodGroup" name="bloodGroup" defaultValue="">
              <option value="">—</option>
              {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Création…" : "Créer le dossier"}
          </button>
        </form>
      </div>
    </>
  );
}
