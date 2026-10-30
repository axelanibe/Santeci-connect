import Link from "next/link";
import { apiJson, fmtDateTime, STATUS_LABELS } from "@/lib/api";
import AppointmentActions from "./actions";

interface Appt {
  id: string; startsAt: string; endsAt: string; status: string;
  patientName: string; doctorName: string; patientId: string;
}

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const day = date ?? new Date().toISOString().slice(0, 10);
  const from = `${day}T00:00:00`;
  const to = new Date(new Date(day).getTime() + 86400000).toISOString().slice(0, 10) + "T00:00:00";

  const data = await apiJson<{ appointments: Appt[] }>(
    `/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  ).catch(() => ({ appointments: [] }));

  return (
    <>
      <div className="page-head">
        <h1>Rendez-vous</h1>
        <Link href="/appointments/new" className="btn">+ Nouveau rendez-vous</Link>
      </div>
      <div className="card">
        <form className="toolbar" method="get">
          <input type="date" name="date" defaultValue={day} />
          <button className="btn btn-secondary" type="submit">Voir ce jour</button>
        </form>
        {data.appointments.length === 0 ? (
          <p className="empty">Aucun rendez-vous ce jour-là.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>Heure</th><th>Patient</th><th>Médecin</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              {data.appointments.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDateTime(a.startsAt)}</td>
                  <td><Link href={`/patients/${a.patientId}`}>{a.patientName}</Link></td>
                  <td>{a.doctorName}</td>
                  <td><span className={`badge b-${a.status}`}>{STATUS_LABELS[a.status] ?? a.status}</span></td>
                  <td><AppointmentActions id={a.id} status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
