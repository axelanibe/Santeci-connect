import Link from "next/link";
import { apiJson, fmtDateTime, fmtFcfa, STATUS_LABELS } from "@/lib/api";

interface Invoice {
  id: string; number: string; status: string; totalFcfa: number;
  patientName: string; createdAt: string;
}

const STATUSES = ["", "draft", "pending", "sent", "validated", "rejected", "paid"];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const data = await apiJson<{ invoices: Invoice[] }>(
    `/invoices${status ? `?status=${status}` : ""}`,
  ).catch(() => ({ invoices: [] }));

  return (
    <>
      <div className="page-head">
        <h1>Factures</h1>
        <Link href="/invoices/new" className="btn">+ Nouvelle facture</Link>
      </div>
      <div className="card">
        <form className="toolbar" method="get">
          <select name="status" defaultValue={status ?? ""}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s ? STATUS_LABELS[s] : "Tous statuts"}</option>
            ))}
          </select>
          <button className="btn btn-secondary" type="submit">Filtrer</button>
        </form>
        {data.invoices.length === 0 ? (
          <p className="empty">Aucune facture.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>N°</th><th>Patient</th><th>Total</th><th>Statut</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {data.invoices.map((i) => (
                <tr key={i.id}>
                  <td>{i.number}</td>
                  <td>{i.patientName}</td>
                  <td>{fmtFcfa(i.totalFcfa)}</td>
                  <td><span className={`badge b-${i.status}`}>{STATUS_LABELS[i.status] ?? i.status}</span></td>
                  <td>{fmtDateTime(i.createdAt)}</td>
                  <td><Link href={`/invoices/${i.id}`}>Ouvrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
