import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export async function POST(req: Request) {
  const body = await req.json();
  const apiRes = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, channel: "web" }),
  });
  const data = await apiRes.json().catch(() => ({}));
  if (!apiRes.ok) return NextResponse.json(data, { status: apiRes.status });
  const res = NextResponse.json({ ok: true, role: (data as { role: string }).role });
  const maxAge = 30 * 60; // 30 min, comme la session web côté API
  const cookieOpts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge };
  res.cookies.set("santeci_token", (data as { token: string }).token, cookieOpts);
  res.cookies.set("santeci_role", (data as { role: string }).role, cookieOpts);
  const clinic = (data as { clinic?: { code: string; name: string } | null }).clinic ?? null;
  res.cookies.set("santeci_clinic", JSON.stringify(clinic), cookieOpts);
  return res;
}
