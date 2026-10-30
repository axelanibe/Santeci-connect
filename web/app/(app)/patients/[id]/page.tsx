import Link from "next/link";
import { notFound } from "next/navigation";
import { apiJson, fmtDate, fmtDateTime, STATUS_LABELS } from "@/lib/api";
import { ApiError } from "@/lib/api";

interface PatientDetail {
  id: string; firstName: string; lastName: string; birthDate: string; sex: string;
  phone: string | null; email: string | null; address: string | null; bloodGroup: string | null;
  insurance: { insurerCode: string; insurerName: string; memberNumber: string; coverageRate: number; validUntil: string | null }[];
}

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let patient: PatientDetail;
  try {
    ({ patient } = await apiJson<{ patient: PatientDetail }>(`/patients/${id}`));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const appts = await apiJson<{ appointments: { id: string; startsAt: string; status: string; doctorName: string }[] }>(
    `/appointments?patientId=${id}`,
  ).catch(() => ({ appointments: [] }));
  const myAppts = appts.appointments.slice(0, 5);

  const consultations = await apiJson<{ consultations: { id: string; createdAt: string; diagnosisCode: string | null; signedAt: string | null }[] }>(
    `/consultations?patientId=${id}`,
  ).catch(() => ({ consultations: [] }));

  return (
    <>
      <div className="page-head">
        <h1>{patient.lastName} {patient.firstName}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/consultations/new?patientId=${id}`} className="btn btn-secondary">Nouvelle consultation</Link>
          <Link href={`/invoices/new?patientId=${id}`} className="btn btn-secondary">Nouvelle facture</Link>
          <Link href="/patients" className="btn btn-secondary">Retour</Link>
        </div>
      </div>

      <div className="card">
        <h3>Dossier patient</h3>
        <dl className="kv">
          <dt>Date de naissance</dt><dd>{fmtDate(patient.birthDate)}</dd>
          <dt>Sexe</dt><dd>{patient.sex === "F" ? "Femme" : "Homme"}</dd>
          <dt>Téléphone</dt><dd>{patient.phone ?? "—"}</dd>
          <dt>E-mail</dt><dd>{patient.email ?? "—"}</dd>
          <dt>Adresse</dt><dd>{patient.address ?? "—"}</dd>
          <dt>Groupe sanguin</dt><dd>{patient.bloodGroup ?? "—"}</dd>
        </dl>
      </div>

      <div className="card">
        <h3>Couverture d'assurance</h3>
        {patient.insurance.length === 0 ? (
          <p className="hint">Aucune couverture enregistrée.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>Assureur</th><th>N° adhérent</th><th>Taux</th><th>Valide jusqu'au</th></tr></thead>
            <tbody>
              {patient.insurance.map((i, idx) => (
                <tr key={idx}>
                  <td>{i.insurerName} ({i.insurerCode})</td>
                  <td>{i.memberNumber}</td>
                  <td>{Math.round(i.coverageRate * 100)} %</td>
                  <td>{i.validUntil ? fmtDate(i.validUntil) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Derniers rendez-vous</h3>
        {myAppts.length === 0 ? <p className="hint">Aucun rendez-vous.</p> : (
          <table className="tbl">
            <thead><tr><th>Date</th><th>Médecin</th><th>Statut</th></tr></thead>
            <tbody>
              {myAppts.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDateTime(a.startsAt)}</td>
                  <td>{a.doctorName}</td>
                  <td><span className={`badge b-${a.status}`}>{STATUS_LABELS[a.status] ?? a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Consultations</h3>
        {consultations.consultations.length === 0 ? <p className="hint">Aucune consultation.</p> : (
          <table className="tbl">
            <thead><tr><th>Date</th><th>Diagnostic (CIM-10)</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {consultations.consultations.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDateTime(c.createdAt)}</td>
                  <td>{c.diagnosisCode ?? "—"}</td>
                  <td>{c.signedAt ? <span className="badge b-validated">Signée</span> : <span className="badge b-draft">Brouillon</span>}</td>
                  <td><Link href={`/consultations/${c.id}`}>Ouvrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
