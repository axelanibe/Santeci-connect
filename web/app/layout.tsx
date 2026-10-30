import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SanteCI Connect — Espace clinique",
  description: "Gestion de clinique : patients, rendez-vous, consultations, factures.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
