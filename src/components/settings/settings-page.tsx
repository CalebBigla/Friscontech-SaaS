import { useEffect, useState, type ReactNode } from "react";
import { Building2, Lock, SlidersHorizontal, Store } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { DetailItem, FieldError, FilterSelect, Panel } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDb } from "@/services/mock-store";
import { getPreferences, settingsService, timezones, type SettingsErrors } from "@/services/services";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { formatPrefDate } from "@/lib/audit";
import { roleLabel } from "@/lib/format";
import type { DateFormatPref, ReportPeriodPref } from "@/data/mock-db";

type Section = "general" | "organization" | "preferences" | "security";
const sectionMeta: Record<Section, { label: string; detail: string; Icon: typeof Store }> = {
  general: { label: "General", detail: "Business profile", Icon: Store },
  organization: { label: "Organization", detail: "Company record", Icon: Building2 },
  preferences: { label: "Preferences", detail: "Your display options", Icon: SlidersHorizontal },
  security: { label: "Security", detail: "Password and session", Icon: Lock },
};

export function SettingsPage() {
  const db = useDb();
  const scope = getAccessScope(db, useCurrentUserId());
  const sections: Section[] = scope.canViewOrganizationSettings ? ["general", "organization", "preferences", "security"] : ["preferences", "security"];
  const [active, setActive] = useState<Section>(sections[0]!);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 250); return () => clearTimeout(t); }, []);
  const current = sections.includes(active) ? active : sections[0]!;

  return (
    <AppShell title="Settings" subtitle={scope.canManageSettings ? "Organization and account settings" : "Your account settings"}>
      <div className="mb-5"><h1 className="text-xl font-bold">Settings</h1><p className="mt-1 text-xs text-muted-foreground">Manage your business profile, preferences and account security.</p></div>
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="grid gap-1 self-start rounded-lg border border-border bg-card p-2 shadow-panel sm:grid-cols-2 lg:grid-cols-1">
          {sections.map((s) => { const { label, detail, Icon } = sectionMeta[s]; return (
            <button key={s} onClick={() => setActive(s)} aria-current={current === s ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${current === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              <Icon className="size-4 shrink-0" /><span><span className="block text-sm font-semibold">{label}</span><span className={`block text-[11px] ${current === s ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{detail}</span></span>
            </button>); })}
        </nav>
        <div className="min-w-0">
          {!ready ? <div className="space-y-3 rounded-lg border border-border bg-card p-5"><Skeleton className="h-5 w-40" />{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            : current === "general" ? <GeneralSection key={db.tenant.updatedAt} />
            : current === "organization" ? <OrganizationSection key={db.tenant.updatedAt} />
            : current === "preferences" ? <PreferencesSection />
            : <SecuritySection />}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string | undefined; hint?: string; children: ReactNode }) {
  return <div className="min-w-0"><Label htmlFor={id} className="text-xs font-semibold">{label}</Label><div className="mt-1.5">{children}</div>{hint && !error && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}<FieldError message={error} /></div>;
}
function FormActions({ dirty, saving, onCancel }: { dirty: boolean; saving: boolean; onCancel: () => void }) {
  return <div className="flex flex-col-reverse gap-2 border-t border-border p-5 sm:flex-row sm:justify-end">
    <Button type="button" variant="outline" disabled={!dirty || saving} onClick={onCancel}>Cancel</Button>
    <Button type="submit" disabled={!dirty || saving}>{saving ? "Saving…" : "Save Changes"}</Button>
  </div>;
}
function ReadOnlyNote() { return <p className="mx-5 mt-5 rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">Only the business owner can change these details.</p>; }

function GeneralSection() {
  const db = useDb();
  const actorId = useCurrentUserId();
  const scope = getAccessScope(db, actorId);
  const init = { name: db.tenant.name, businessEmail: db.tenant.businessEmail, phone: db.tenant.phone, timezone: db.tenant.timezone };
  const [form, setForm] = useState(init);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [saving, setSaving] = useState(false);
  const edit = scope.canManageSettings;
  const dirty = (Object.keys(init) as (keyof typeof init)[]).some((k) => form[k] !== init[k]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const r = await settingsService.updateGeneral(form, actorId).catch(() => null);
    setSaving(false);
    if (!r) { toast.error("Unable to save settings. Please try again."); return; }
    if (!r.ok) { setErrors(r.errors); toast.error(r.errors.form ?? "Please fix the highlighted fields."); return; }
    setErrors({}); toast.success("Settings saved.");
  };
  return (
    <Panel title="General" subtitle="Business details shown across SalesFlow Pro">
      {!edit && <ReadOnlyNote />}
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field id="s-name" label="Business name" error={errors.name}><Input id="s-name" value={form.name} disabled={!edit} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field id="s-email" label="Business email" error={errors.businessEmail}><Input id="s-email" type="email" value={form.businessEmail} disabled={!edit} onChange={(e) => setForm({ ...form, businessEmail: e.target.value })} /></Field>
          <Field id="s-phone" label="Phone number" error={errors.phone}><Input id="s-phone" value={form.phone} disabled={!edit} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field id="s-tz" label="Timezone" error={errors.timezone}>{edit ? <FilterSelect label="Timezone" className="w-full" value={form.timezone} onChange={(v) => setForm({ ...form, timezone: v })} options={timezones.map((t) => ({ value: t, label: t }))} /> : <Input id="s-tz" value={form.timezone} disabled />}</Field>
          <Field id="s-cur" label="Currency" hint="All amounts are shown in Naira."><Input id="s-cur" value="NGN — Nigerian Naira" disabled /></Field>
        </div>
        {edit && <FormActions dirty={dirty} saving={saving} onCancel={() => { setForm(init); setErrors({}); }} />}
      </form>
    </Panel>
  );
}

function OrganizationSection() {
  const db = useDb();
  const actorId = useCurrentUserId();
  const scope = getAccessScope(db, actorId);
  const fmt = getPreferences(db, actorId).dateFormat;
  const [legalName, setLegalName] = useState(db.tenant.legalName);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [saving, setSaving] = useState(false);
  const edit = scope.canManageSettings;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const r = await settingsService.updateOrganization({ legalName }, actorId).catch(() => null);
    setSaving(false);
    if (!r) { toast.error("Unable to save settings. Please try again."); return; }
    if (!r.ok) { setErrors(r.errors); toast.error(r.errors.form ?? "Please fix the highlighted fields."); return; }
    setErrors({}); toast.success("Organization details saved.");
  };
  return (
    <Panel title="Organization" subtitle="Your company's account with SalesFlow Pro">
      {!edit && <ReadOnlyNote />}
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field id="o-name" label="Organization name" error={errors.legalName}><Input id="o-name" value={legalName} disabled={!edit} onChange={(e) => setLegalName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-4 sm:col-span-2 sm:grid-cols-3">
            <DetailItem label="Organization ID">{db.tenant.id.replace("tenant-", "ORG-")}</DetailItem>
            <DetailItem label="Plan">{db.tenant.plan}</DetailItem>
            <DetailItem label="Created">{formatPrefDate(db.tenant.createdAt, fmt)}</DetailItem>
          </div>
        </div>
        {edit && <FormActions dirty={legalName !== db.tenant.legalName} saving={saving} onCancel={() => { setLegalName(db.tenant.legalName); setErrors({}); }} />}
      </form>
    </Panel>
  );
}

const dateFormats: DateFormatPref[] = ["MMM D, YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];
const reportPeriods: { value: ReportPeriodPref; label: string }[] = [{ value: "today", label: "Today" }, { value: "week", label: "Last 7 days" }, { value: "month", label: "This month" }, { value: "quarter", label: "This quarter" }];

function PreferencesSection() {
  const db = useDb();
  const actorId = useCurrentUserId();
  const saved = getPreferences(db, actorId);
  const scope = getAccessScope(db, actorId);
  const [form, setForm] = useState({ dateFormat: saved.dateFormat, defaultReportPeriod: saved.defaultReportPeriod });
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm({ dateFormat: saved.dateFormat, defaultReportPeriod: saved.defaultReportPeriod }); }, [actorId, saved.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = form.dateFormat !== saved.dateFormat || form.defaultReportPeriod !== saved.defaultReportPeriod;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const r = await settingsService.updatePreferences(form, actorId).catch(() => null);
    setSaving(false);
    if (!r?.ok) { toast.error("Unable to save preferences. Please try again."); return; }
    toast.success("Preferences saved.");
  };
  return (
    <Panel title="Preferences" subtitle="These apply to your account only">
      <form onSubmit={submit}>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field id="p-date" label="Date format" hint={`Used in the Audit Log and Settings. Example: ${formatPrefDate(db.tenant.referenceDate, form.dateFormat)}`}>
            <FilterSelect label="Date format" className="w-full" value={form.dateFormat} onChange={(v) => setForm({ ...form, dateFormat: v as DateFormatPref })} options={dateFormats.map((f) => ({ value: f, label: formatPrefDate(db.tenant.referenceDate, f) }))} />
          </Field>
          {scope.canViewReports && <Field id="p-period" label="Default report period" hint="The date range Reports opens with.">
            <FilterSelect label="Default report period" className="w-full" value={form.defaultReportPeriod} onChange={(v) => setForm({ ...form, defaultReportPeriod: v as ReportPeriodPref })} options={reportPeriods} />
          </Field>}
        </div>
        <FormActions dirty={dirty} saving={saving} onCancel={() => setForm({ dateFormat: saved.dateFormat, defaultReportPeriod: saved.defaultReportPeriod })} />
      </form>
    </Panel>
  );
}

function SecuritySection() {
  const db = useDb();
  const actorId = useCurrentUserId();
  const { user } = getAccessScope(db, actorId);
  const empty = { current: "", next: "", confirm: "" };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [saving, setSaving] = useState(false);
  const branch = db.branches.find((b) => b.id === user.branchId);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const r = await settingsService.changePassword(form, actorId).catch(() => null);
    setSaving(false);
    if (!r) { toast.error("Unable to update password. Please try again."); return; }
    if (!r.ok) { setErrors(r.errors); return; }
    setErrors({}); setForm(empty); toast.success("Password updated successfully.");
  };
  const pw = (k: keyof typeof empty, id: string, label: string, auto: string) => (
    <Field id={id} label={label} error={errors[k]} {...(k === "next" ? { hint: "At least 8 characters, with a letter and a number." } : {})}>
      <Input id={id} type="password" autoComplete={auto} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </Field>
  );
  return (
    <div className="space-y-5">
      <Panel title="Account" subtitle="The account you are signed in with">
        <div className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
          <DetailItem label="Name">{user.name}</DetailItem><DetailItem label="Email">{user.email}</DetailItem>
          <DetailItem label="Role">{roleLabel[user.role]}</DetailItem><DetailItem label="Branch">{branch?.name ?? "All branches"}</DetailItem>
        </div>
      </Panel>
      <Panel title="Change password" subtitle="Demo mode: sign-in accounts are not connected yet, so no password is stored.">
        <form onSubmit={submit} noValidate>
          <div className="grid gap-4 p-5 sm:grid-cols-3">{pw("current", "pw-cur", "Current password", "current-password")}{pw("next", "pw-new", "New password", "new-password")}{pw("confirm", "pw-conf", "Confirm new password", "new-password")}</div>
          <FormActions dirty={Object.values(form).some(Boolean)} saving={saving} onCancel={() => { setForm(empty); setErrors({}); }} />
        </form>
      </Panel>
    </div>
  );
}
