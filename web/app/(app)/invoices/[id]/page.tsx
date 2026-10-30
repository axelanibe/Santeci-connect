import Link from "next/link";
import { notFound } from "next/navigation";
import { apiJson, ApiError, fmtDateTime, fmtFcfa, STATUS_LABELS } from "@/lib/api";
import { PaymentForm, InvoiceStatusButtons } from "./forms";

interface InvoiceDetail {
  id: string; number: string; status: string; totalFcfa: number;
  insurerPartFcfa: number; patientPartFcfa: number; insurerFileRef: string | null;
  createdAt: string;
  lines: { id: string; actCode: string; label: string; quantity: number; unitFcfa: number }[];
  payments: { id: string; operator: string; amountFcfa: number; providerRef: string | null; status: string; createdAt: string }[];
}

const OPERATORS: Record<string, string> = { wave: "Wave", orange: "Orange Money", mtn: "MTN MoMo", cash: "Espèces" };

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let invoice: InvoiceDetail;
  try {
    ({ invoice } = await apiJson<{ invoice: InvoiceDetail }>(`/invoices/${id}`));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const paid = invoice.payments.filter((p) => p.status === "success").reduce((s, p) => s + p.amountFcfa, 0);
  const rest = invoice.totalFcfa - paid;

  return (
    <>
      <div className="page-head">
        <h1>Facture {invoice.number}</h1>
        <Link href="/invoices" className="btn btn-secondary">Retour</Link>
      </div>

      <div className="card">
        <p>
          <span className={`badge b-${invoice.status}`}>{STATUS_LABELS[invoice.status] ?? invoice.status}</span>{" "}
          <span className="hint">créée le {fmtDateTime(invoice.createdAt)}</span>
        </p>
        <table className="tbl">
          <thead><tr><th>Code</th><th>Libellé</th><th>Qté</th><th>Prix unit.</th><th>Total</th></tr></thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.actCode}</td><td>{l.label}</td><td>{l.quantity}</td>
                <td>{fmtFcfa(l.unitFcfa)}</td><td>{fmtFcfa(l.quantity * l.unitFcfa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>Total</dt><dd><strong>{fmtFcfa(invoice.totalFcfa)}</strong></dd>
          <dt>Part assureur</dt><dd>{fmtFcfa(invoice.insurerPartFcfa)}</dd>
          <dt>Part patient</dt><dd>{fmtFcfa(invoice.patientPartFcfa)}</dd>
          <dt>Encaissé</dt><dd>{fmtFcfa(paid)}</dd>
          <dt>Reste dû</dt><dd><strong>{fmtFcfa(Math.max(0, rest))}</strong></dd>
          {invoice.insurerFileRef && <><dt>Dossier assureur</dt><dd>{invoice.insurerFileRef}</dd></>}
        </dl>
        <div style={{ marginTop: 12 }}>
          <InvoiceStatusButtons id={invoice.id} status={invoice.status} />
        </div>
      </div>

      <div className="card">
        <h3>Paiements</h3>
        {invoice.payments.length === 0 ? <p className="hint">Aucun paiement enregistré.</p> : (
          <table className="tbl">
            <thead><tr><th>Date</th><th>Opérateur</th><th>Montant</th><th>Référence</th><th>Statut</th></tr></thead>
            <tbody>
              {invoice.payments.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.createdAt)}</td>
                  <td>{OPERATORS[p.operator] ?? p.operator}</td>
                  <td>{fmtFcfa(p.amountFcfa)}</td>
                  <td>{p.providerRef ?? "—"}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {invoice.status !== "paid" && (
        <div className="card">
          <h3>Enregistrer un paiement</h3>
          <PaymentForm invoiceId={invoice.id} />
          <p className="hint">Seule la référence de l'opérateur est conservée — aucune donnée bancaire.</p>
        </div>
      )}
    </>
  );
}
