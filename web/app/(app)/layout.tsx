import Link from "next/link";
import { getSession, ROLE_LABELS } from "@/lib/api";
import { logout } from "@/lib/actions";

const NAV: { href: string; label: string; roles: string[] }[] = [
  { href: "/dashboard", label: "Accueil", roles: ["admin_clinique", "medecin", "secretaire", "caissier", "agent_assureur"] },
  { href: "/patients", label: "Patients", roles: ["admin_clinique", "medecin", "secretaire", "caissier"] },
  { href: "/appointments", label: "Rendez-vous", roles: ["admin_clinique", "medecin", "secretaire"] },
  { href: "/invoices", label: "Factures", roles: ["admin_clinique", "caissier", "agent_assureur"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const nav = NAV.filter((n) => session && n.roles.includes(session.role));

  return (
    <>
      <header className="topbar">
        <div className="container">
          <Link href="/dashboard" className="brand">
            <span className="dot" /> SanteCI Connect
          </Link>
          <nav>
            {nav.map((n) => (
              <Link key={n.href} href={n.href}>{n.label}</Link>
            ))}
          </nav>
          <span className="spacer" />
          {session && <span className="role">{ROLE_LABELS[session.role] ?? session.role}</span>}
          <form action={logout}>
            <button className="btn-logout" type="submit">Déconnexion</button>
          </form>
        </div>
      </header>
      <main className="page">
        <div className="container">{children}</div>
      </main>
    </>
  );
}
