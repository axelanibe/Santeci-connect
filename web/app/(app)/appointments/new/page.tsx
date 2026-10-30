import Link from "next/link";
import { apiJson } from "@/lib/api";
import NewAppointmentForm from "./form";

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<{ patientId?: string }> }) {
  const { patientId } = await searchParams;
  const { users } = await apiJson<{ users: { id: string; fullName: string }[] }>("/users?role=medecin")
    .catch(() => ({ users: [] }));

  let initialPatient = null;
  if (patientId) {
    try {
      const { patient } = await apiJson<{ patient: { id: string; firstName: string; lastName: string } }>(
        `/patients/${patientId}`,
      );
      initialPatient = patient;
    } catch { /* ignore */ }
  }

  return (
    <>
      <div className="page-head">
        <h1>Nouveau rendez-vous</h1>
        <Link href="/appointments" className="btn btn-secondary">Retour</Link>
      </div>
      {users.length === 0 ? (
        <div className="card"><p className="empty">Aucun médecin actif dans la clinique.</p></div>
      ) : (
        <NewAppointmentForm doctors={users} initialPatient={initialPatient} />
      )}
    </>
  );
}
