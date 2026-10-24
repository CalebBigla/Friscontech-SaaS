/** Onboarding selectors + step validation. Pure functions only — no Supabase deps. */
import type { EmployeeData, EmployeeField, Onboarding } from "@/data/onboarding";
import type { AccessScope } from "@/lib/session";

export const ONBOARDING_STEPS = [
  "Personal",
  "Job & reference",
  "Family & emergency",
  "Statutory & guarantor",
  "Documents",
  "Declaration",
] as const;

export type StepErrors = Partial<Record<EmployeeField | "photo" | "password" | "form", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9\s-]{6,17}$/;

function req(d: EmployeeData, e: StepErrors, keys: EmployeeField[]) {
  for (const k of keys) if (!d[k].trim()) e[k] = "Required";
}
function email(d: EmployeeData, e: StepErrors, k: EmployeeField, required = true) {
  if (!d[k].trim()) { if (required) e[k] = "Required"; return; }
  if (!EMAIL.test(d[k].trim())) e[k] = "Enter a valid email";
}
function phone(d: EmployeeData, e: StepErrors, k: EmployeeField, required = true) {
  if (!d[k].trim()) { if (required) e[k] = "Required"; return; }
  if (!PHONE.test(d[k].trim())) e[k] = "Enter a valid phone number";
}

export const isMarried = (d: EmployeeData) => d.maritalStatus === "Married";

/**
 * Company e-mail ID generated from the member's names: firstname.surname,
 * lower-case, letters and digits only (accents removed). Replaces the
 * "Preferred company e-mail name ID" field the member used to type.
 */
export function companyEmailId(d: Pick<EmployeeData, "firstName" | "lastName">): string {
  const part = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return [part(d.firstName), part(d.lastName)].filter(Boolean).join(".");
}
/** The data with its company e-mail ID filled from the names. */
export const withCompanyEmailId = (d: EmployeeData): EmployeeData => ({ ...d, preferredEmailId: companyEmailId(d) });
export const needsSecondContact = (d: EmployeeData) => isMarried(d) && d.spouseIsEmergency === "Yes";

export function validateStep(o: Pick<Onboarding, "photo">, d: EmployeeData, step: number, password?: { pw: string; confirm: string }): StepErrors {
  const e: StepErrors = {};
  if (step === 0) {
    req(d, e, ["lastName", "firstName", "address", "gender", "birthDate", "maritalStatus", "nationality", "stateOfOrigin", "lga"]);
    phone(d, e, "phone");
    email(d, e, "email");
    // Company e-mail ID is generated from the names (see companyEmailId), not typed.
    // if (d.preferredEmailId && !/^[a-z0-9._-]+$/i.test(d.preferredEmailId)) e.preferredEmailId = "Letters, numbers, dots or dashes only";
    if (d.birthDate && d.birthDate > new Date(Date.now() - 16 * 365.25 * 864e5).toISOString().slice(0, 10)) e.birthDate = "Enter a valid birth date";
  }
  if (step === 1) {
    req(d, e, ["refName", "refJobTitle", "refCompany"]);
    email(d, e, "refEmail");
  }
  if (step === 2) {
    if (isMarried(d)) {
      req(d, e, ["spouseLastName", "spouseFirstName", "spouseWorkAddress", "spouseIsEmergency"]);
      phone(d, e, "spousePhone");
      email(d, e, "spouseEmail", false);
    }
    if (!isMarried(d) || d.spouseIsEmergency !== "Yes" || needsSecondContact(d)) {
      // first contact is required unless the spouse already is it — then a second contact is required
      const p = needsSecondContact(d) ? "ec2" : "ec";
      req(d, e, [`${p}LastName`, `${p}FirstName`, `${p}Address`, `${p}Relationship`, `${p}Occupation`] as EmployeeField[]);
      phone(d, e, `${p}Phone` as EmployeeField);
      phone(d, e, `${p}AltPhone` as EmployeeField, false);
    }
  }
  if (step === 3) {
    if (!/^\d{11}$/.test(d.nin.trim())) e.nin = "NIN must be 11 digits";
    if (!d.bankName) e.bankName = "Select your bank";
    if (!/^\d{10}$/.test(d.accountNumber.trim())) e.accountNumber = "Account number must be exactly 10 digits";
    req(d, e, ["guarantorFirstName", "guarantorSurname", "guarantorAddress"]);
    email(d, e, "guarantorEmail");
    phone(d, e, "guarantorPhone");
  }
  if (step === 4 && !o.photo) e.photo = "Upload a passport photograph";
  if (step === 5) {
    if (d.declarationAccepted !== "yes") e.declarationAccepted = "You must accept the declaration";
    if (d.signature.trim().length < 3) e.signature = "Type your full name as signature";
    if (!d.signedDate) e.signedDate = "Required";
    if (password) {
      if (password.pw.length < 8 || !/[0-9]/.test(password.pw) || !/[a-z]/i.test(password.pw)) e.password = "At least 8 characters with letters and numbers";
      else if (password.pw !== password.confirm) e.password = "Passwords don't match";
    }
  }
  return e;
}

export type LinkState = "valid" | "expired" | "revoked" | "used" | "missing";
export function onboardingLinkState(o: Pick<Onboarding, "tokenRevoked" | "tokenUsed" | "tokenExpiresAt" | "status"> | undefined, now = new Date().toISOString()): LinkState {
  if (!o) return "missing";
  if (o.tokenRevoked) return "revoked";
  // The link is used once the account exists (sign-up consumes the token) or the
  // owner approved. A submitted form without an account can retry the sign-up step.
  if (o.tokenUsed || o.status === "approved") return "used";
  if (o.tokenExpiresAt < now) return "expired";
  return "valid";
}

/** URL helpers — pure, no store. */
export function onboardingUrl(rawToken: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/onboard/${rawToken}`;
}
export function guarantorUrl(token: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/guarantor/${token}`;
}

/** Only the Owner sees full form data, documents and the confidential guarantor response. */
export const canViewOnboardingDetails = (scope: AccessScope) => scope.user.role === "owner";

export const fullName = (d: EmployeeData, p: "" | "spouse" | "ec" | "ec2" = "") => {
  const g = (k: string) => (d as Record<string, string>)[p ? `${p}${k}` : k.charAt(0).toLowerCase() + k.slice(1)] ?? "";
  return [g("FirstName"), g("MiddleInitial"), g("LastName")].filter(Boolean).join(" ");
};
