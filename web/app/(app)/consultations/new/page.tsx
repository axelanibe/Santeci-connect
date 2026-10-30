import Link from "next/link";
import { notFound } from "next/navigation";
import { apiJson, ApiError } from "@/lib/api";
import NewConsultationForm from "./form";

export default async function NewConsultationPage({ searchParams }: { searchParams: Promise<{ patientId?: string }> }) {
  const { patientId } = await searchParams;
  if (!patientId) {
    return (
      <div className="card">
        <p>Choisissez d'abord un patient depuis <Link href="/patients">la liste des patients</Link>.</p>
      </div>
    );
  }
  let patientName = "";
  try {
    const { patient } = await apiJson<{ patient: { firstName: string; lastName: string } }>(`/patients/${patientId}`);
    patientName = `${patient.lastName} ${patient.firstName}`;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <>
      <div className="page-head">
        <h1>Nouvelle consultation</h1>
        <Link href={`/patients/${patientId}`} className="btn btn-secondary">Retour au dossier</Link>
      </div>
      <NewConsultationForm patientId={patientId} patientName={patientName} />
    </>
  );
}
