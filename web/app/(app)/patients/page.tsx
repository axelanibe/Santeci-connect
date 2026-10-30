import Link from "next/link";
import { apiJson, fmtDate } from "@/lib/api";

interface Patient {
  id: string; firstName: string; lastName: string; birthDate: string;
  sex: string; phone: string | null;
}

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { search } = await searchParams;
  const data = await apiJson<{ patients: Patient[] }>(
    `/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`,
  );

  return (
    <>
      <div className="page-head">
        <h1>Patients</h1>
        <Link href="/patients/new" className="btn">+ Nouveau patient</Link>
      </div>
      <div className="card">
        <form className="toolbar" method="get">
          <input type="search" name="search" placeholder="Nom, prénom ou téléphone…" defaultValue={search ?? ""} />
          <button className="btn btn-secondary" type="submit">Rechercher</button>
        </form>
        {data.patients.length === 0 ? (
          <p className="empty">Aucun patient trouvé.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>Nom</th><th>Naissance</th><th>Sexe</th><th>Téléphone</th><th></th></tr></thead>
            <tbody>
              {data.patients.map((p) => (
                <tr key={p.id}>
                  <td>{p.lastName} {p.firstName}</td>
                  <td>{fmtDate(p.birthDate)}</td>
                  <td>{p.sex === "F" ? "Femme" : "Homme"}</td>
                  <td>{p.phone ?? "—"}</td>
                  <td><Link href={`/patients/${p.id}`}>Ouvrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
