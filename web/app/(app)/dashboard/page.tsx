import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, ROLE_LABELS } from "@/lib/api";

const CARDS: { href: string; icon: string; title: string; desc: string; roles: string[] }[] = [
  { href: "/patients", icon: "🧑‍⚕️", title: "Patients", desc: "Dossiers, recherche, admissions", roles: ["admin_clinique", "medecin", "secretaire", "caissier"] },
  { href: "/patients/new", icon: "➕", title: "Nouveau patient", desc: "Créer un dossier patient", roles: ["admin_clinique", "secretaire"] },
  { href: "/appointments", icon: "📅", title: "Rendez-vous", desc: "Agenda et planification", roles: ["admin_clinique", "medecin", "secretaire"] },
  { href: "/invoices", icon: "🧾", title: "Factures", desc: "Facturation et paiements", roles: ["admin_clinique", "caissier", "agent_assureur"] },
];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const cards = CARDS.filter((c) => c.roles.includes(session.role));

  return (
    <>
      <div className="page-head">
        <h1>Tableau de bord</h1>
      </div>
      <div className="card">
        <h2>Bienvenue</h2>
        <p className="hint">Connecté en tant que <strong>{ROLE_LABELS[session.role] ?? session.role}</strong>.</p>
      </div>
      <div className="grid">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card menu-card">
            <span className="icon">{c.icon}</span>
            <h3>{c.title}</h3>
            <p>{c.desc}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
