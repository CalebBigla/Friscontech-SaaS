/**
 * Settings rules: preferences defaults, timezones and the checks run before a
 * settings change is sent to Supabase (same rules and messages as before).
 */
import type { Db, Tenant, UserPreference } from "@/data/mock-db";
import { fieldErrorsFrom } from "@/lib/supabase-helpers";

export type GeneralSettingsInput = {
  name: string;
  businessEmail: string;
  phone: string;
  timezone: string;
};
export type OrganizationInput = { legalName: string };
export type PasswordInput = { current: string; next: string; confirm: string };

const SETTINGS_FIELDS = ["name", "businessEmail", "phone", "timezone", "legalName", "current", "next", "confirm"] as const;
export type SettingsErrors = Partial<Record<(typeof SETTINGS_FIELDS)[number] | "form", string>>;
export type SettingsResult<T> = { ok: true; data: T } | { ok: false; errors: SettingsErrors };

/** Mirrors the user_preferences column defaults (20260114120000_create_initial_schema.sql). */
export const defaultPreferences = (userId: string): UserPreference => ({
  userId,
  dateFormat: "MMM D, YYYY",
  defaultReportPeriod: "month",
  updatedAt: "",
});
export const getPreferences = (db: Db, userId: string) =>
  db.preferences.find((p) => p.userId === userId) ?? defaultPreferences(userId);

export const timezones = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Europe/London"];

/** Client checks, then the write; database errors come back as settings field errors. */
export async function runSettingsWrite<T>(invalid: SettingsErrors | null, write: () => Promise<T>): Promise<SettingsResult<T>> {
  if (invalid) return { ok: false, errors: invalid };
  try {
    return { ok: true, data: await write() };
  } catch (error) {
    return { ok: false, errors: fieldErrorsFrom(error, SETTINGS_FIELDS) };
  }
}

const has = (e: SettingsErrors) => Object.keys(e).length > 0;

/** Owner only: business profile shown across the app. */
export function validateGeneralSettings(canManage: boolean, input: GeneralSettingsInput): SettingsErrors | null {
  if (!canManage) return { form: "Only the business owner can change these settings." };
  const e: SettingsErrors = {};
  if (!input.name.trim()) e.name = "Business name is required";
  if (!/^\S+@\S+\.\S+$/.test(input.businessEmail.trim())) e.businessEmail = "Enter a valid email";
  if (!/^\+?[\d\s-]{7,}$/.test(input.phone.trim())) e.phone = "Enter a valid phone number";
  if (!timezones.includes(input.timezone)) e.timezone = "Select a timezone";
  return has(e) ? e : null;
}

/** Fields of the general form that differ from the saved tenant. */
export function changedGeneralFields(tenant: Tenant, input: GeneralSettingsInput) {
  return (Object.keys(input) as (keyof GeneralSettingsInput)[]).filter((k) => input[k].trim() !== String(tenant[k]));
}

export function validateOrganization(canManage: boolean, input: OrganizationInput): SettingsErrors | null {
  if (!canManage) return { form: "Only the business owner can change organization details." };
  if (!input.legalName.trim()) return { legalName: "Organization name is required" };
  return null;
}

export function validateExpiryAlertMonths(canManage: boolean, months: number): SettingsErrors | null {
  if (!canManage) return { form: "Only the business owner can change expiry alerts." };
  if (!Number.isInteger(months) || months < 1 || months > 12) return { form: "Enter a whole number of months between 1 and 12" };
  return null;
}

export function validatePassword(input: PasswordInput): SettingsErrors | null {
  const e: SettingsErrors = {};
  if (!input.current) e.current = "Enter your current password";
  if (!input.next) e.next = "Enter a new password";
  else if (input.next.length < 8 || !/[A-Za-z]/.test(input.next) || !/\d/.test(input.next))
    e.next = "Use at least 8 characters with a letter and a number";
  else if (input.next === input.current) e.next = "New password must be different from the current one";
  if (!input.confirm) e.confirm = "Confirm your new password";
  else if (input.confirm !== input.next) e.confirm = "Passwords do not match";
  return has(e) ? e : null;
}
