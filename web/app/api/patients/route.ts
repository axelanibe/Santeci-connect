import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

/** Proxy de recherche patients pour les formulaires (le jeton reste côté serveur). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("search") ?? "";
  const res = await apiFetch(`/patients?search=${encodeURIComponent(q)}&limit=10`);
  const data = await res.json().catch(() => ({ patients: [] }));
  return NextResponse.json(data, { status: res.status });
}
