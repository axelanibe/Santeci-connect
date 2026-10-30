"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { apiFetch, ApiError } from "./api";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export type FormState = { ok: boolean; message?: string };

const fail = (e: unknown): FormState =>
  e instanceof ApiError ? { ok: false, message: e.message } : { ok: false, message: "Erreur inattendue." };

async function post(path: string, body: unknown) {
  const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { message?: string }).message ?? `Erreur ${res.status}`);
  return data;
}

async function patch(path: string, body: unknown) {
  const res = await apiFetch(path, { method: "PATCH", body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { message?: string }).message ?? `Erreur ${res.status}`);
  return data;
}

export async function logout(): Promise<void> {
  const c = await cookies();
  const token = c.get("santeci_token")?.value;
  if (token) {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
  c.delete("santeci_token");
  c.delete("santeci_role");
  c.delete("santeci_clinic");
  redirect("/login");
}

/* ---------- Patients ---------- */
export async function createPatient(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const data = (await post("/patients", {
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      birthDate: fd.get("birthDate"),
      sex: fd.get("sex"),
      phone: fd.get("phone") || undefined,
      email: fd.get("email") || undefined,
      address: fd.get("address") || undefined,
      bloodGroup: fd.get("bloodGroup") || undefined,
    })) as { patient: { id: string } };
    redirect(`/patients/${data.patient.id}`);
  } catch (e) {
    return fail(e);
  }
}

/* ---------- Rendez-vous ---------- */
export async function createAppointment(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const date = fd.get("date") as string;
    const body = {
      patientId: fd.get("patientId"),
      doctorId: fd.get("doctorId"),
      startsAt: `${date}T${fd.get("startTime")}:00`,
      endsAt: `${date}T${fd.get("endTime")}:00`,
    };
    await post("/appointments", body);
    redirect("/appointments");
  } catch (e) {
    return fail(e);
  }
}

export async function setAppointmentStatus(id: string, status: string): Promise<FormState> {
  try {
    await patch(`/appointments/${id}`, { status });
    revalidatePath("/appointments");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- Consultations ---------- */
export async function createConsultation(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const data = (await post("/consultations", {
      patientId: fd.get("patientId"),
      appointmentId: fd.get("appointmentId") || undefined,
      subjective: fd.get("subjective") || undefined,
      objective: fd.get("objective") || undefined,
      assessment: fd.get("assessment") || undefined,
      plan: fd.get("plan") || undefined,
      diagnosisCode: fd.get("diagnosisCode") || undefined,
    })) as { consultation: { id: string } };
    redirect(`/consultations/${data.consultation.id}`);
  } catch (e) {
    return fail(e);
  }
}

export async function updateConsultation(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await patch(`/consultations/${id}`, {
      subjective: fd.get("subjective") || undefined,
      objective: fd.get("objective") || undefined,
      assessment: fd.get("assessment") || undefined,
      plan: fd.get("plan") || undefined,
      diagnosisCode: fd.get("diagnosisCode") || undefined,
    });
    revalidatePath(`/consultations/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function signConsultation(id: string): Promise<FormState> {
  try {
    await post(`/consultations/${id}/sign`, {});
    revalidatePath(`/consultations/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ---------- Factures & paiements ---------- */
export async function createInvoice(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    const lines = JSON.parse((fd.get("lines") as string) ?? "[]");
    const data = (await post("/invoices", {
      patientId: fd.get("patientId"),
      lines,
      insurerPartFcfa: Number(fd.get("insurerPartFcfa") ?? 0),
      patientPartFcfa: Number(fd.get("patientPartFcfa") ?? 0),
    })) as { invoice: { id: string } };
    redirect(`/invoices/${data.invoice.id}`);
  } catch (e) {
    return fail(e);
  }
}

export async function recordPayment(invoiceId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await post(`/invoices/${invoiceId}/payments`, {
      operator: fd.get("operator"),
      amountFcfa: Number(fd.get("amountFcfa")),
      providerRef: fd.get("providerRef") || undefined,
    });
    revalidatePath(`/invoices/${invoiceId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setInvoiceStatus(id: string, status: string): Promise<FormState> {
  try {
    await patch(`/invoices/${id}`, { status });
    revalidatePath(`/invoices/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
