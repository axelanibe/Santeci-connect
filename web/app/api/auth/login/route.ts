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
  res.cookies.set("santeci_token", (data as { token: string }).token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge,
  });
  res.cookies.set("santeci_role", (data as { role: string }).role, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge,
  });
  return res;
}
