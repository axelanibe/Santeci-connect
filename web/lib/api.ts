import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export interface Session {
  token: string;
  role: string;
  clinic: { code: string; name: string } | null;
}

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  const token = c.get("santeci_token")?.value;
  const role = c.get("santeci_role")?.value;
  if (!token || !role) return null;
  let clinic: Session["clinic"] = null;
  try {
    const raw = c.get("santeci_clinic")?.value;
    clinic = raw ? (JSON.parse(raw) as Session["clinic"]) : null;
  } catch { clinic = null; }
  return { token, role, clinic };
}

/** Appel à l'API SanteCI avec le jeton de session. Ne pas utiliser côté client. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = await getSession();
  return fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? `Erreur ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const ROLE_LABELS: Record<string, string> = {
  admin_clinique: "Administrateur clinique",
  medecin: "Médecin",
  secretaire: "Secrétaire",
  caissier: "Caissier",
  agent_assureur: "Agent assureur",
  patient: "Patient",
};

export const STATUS_LABELS: Record<string, string> = {
  scheduled: "Planifié",
  confirmed: "Confirmé",
  cancelled: "Annulé",
  done: "Terminé",
  no_show: "Absent",
  draft: "Brouillon",
  pending: "En attente",
  sent: "Envoyée",
  validated: "Validée",
  rejected: "Rejetée",
  paid: "Payée",
};

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
export function fmtFcfa(n: number): string {
  return `${Number(n).toLocaleString("fr-FR")} F CFA`;
}
