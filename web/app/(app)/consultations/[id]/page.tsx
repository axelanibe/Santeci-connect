import Link from "next/link";
import { notFound } from "next/navigation";
import { apiJson, ApiError, fmtDateTime } from "@/lib/api";
import ConsultationDetail from "./detail";

export default async function ConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let consultation;
  try {
    ({ consultation } = await apiJson<{ consultation: Record<string, unknown> }>(`/consultations/${id}`));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <>
      <div className="page-head">
        <h1>Consultation du {fmtDateTime(consultation.createdAt as string)}</h1>
        <Link href={`/patients/${consultation.patientId}`} className="btn btn-secondary">Dossier patient</Link>
      </div>
      <ConsultationDetail consultation={consultation as never} />
    </>
  );
}
