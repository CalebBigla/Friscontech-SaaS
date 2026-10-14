import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, FilterSelect } from "@/components/shared";
import { copyText } from "@/components/team/onboarding-panel";
import {
  CREDENTIAL_MAX_BYTES, DECLARATION_TEXT, guarantorStatusLabel, NIGERIAN_BANKS, PHOTO_MAX_BYTES,
  type EmployeeData, type EmployeeField, type StoredFile,
} from "@/data/onboarding";
import { formatDate } from "@/lib/format";
import { findOnboardingByToken, guarantorUrl, isMarried, needsSecondContact, onboardingLinkState, ONBOARDING_STEPS, validateStep, type StepErrors } from "@/lib/onboarding";
import { useDb } from "@/services/mock-store";
import { onboardingService } from "@/services/services";

function readFile(file: File): Promise<StoredFile> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res({ name: file.name, type: file.type, size: file.size, dataUrl: String(r.result) });
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export function PublicFrame({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <span className="text-lg font-extrabold text-primary">Friscontech</span>
          <span className="text-[11px] text-muted-foreground">Friscon Tech Limited</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </main>
    </div>
  );
}
export function InvalidLink({ message }: { message: string }) {
  return <PublicFrame title="Link unavailable"><div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">{message}</div></PublicFrame>;
}

export function OnboardingFormPage({ token }: { token: string }) {
  const db = useDb();
  const o = findOnboardingByToken(db, token);
  const [now, setNow] = useState<string | null>(null);
  const [data, setData] = useState<EmployeeData | null>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<StepErrors>({});
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ pw: "", confirm: "" });
  const [done, setDone] = useState(false);
  useEffect(() => setNow(new Date().toISOString()), []);
  useEffect(() => { if (o && !data) { setData(o.data); setStep(Math.min(o.step, 5)); } }, [o, data]);

  if (!now) return <PublicFrame title="Loading…"><Loader2 className="size-5 animate-spin" /></PublicFrame>;
  if (done) return <PublicFrame title="Thank you!" subtitle="Your onboarding form has been submitted."><div className="rounded-lg border border-border bg-card p-6 text-sm">This link can no longer be used. Once the Owner reviews your details and your guarantor, your account is activated and you can sign in with your email and the password you just set.</div></PublicFrame>;
  const state = onboardingLinkState(o, now);
  if (state !== "valid" || !o) return <InvalidLink message={state === "expired" ? "This onboarding link has expired. Ask the Owner for a new one." : state === "used" ? "This form has already been submitted." : state === "revoked" ? "This link was revoked. Ask the Owner for a new one." : "This onboarding link is not valid. (Demo: links only work in the browser session where they were created.)"} />;
  if (!data) return null;
  const d = data;
  const set = (k: EmployeeField, v: string) => setData({ ...d, [k]: v });
  const user = db.users.find((u) => u.id === o.userId);

  const F = ({ k, label, type = "text", required = true, placeholder, inputMode }: { k: EmployeeField; label: string; type?: string; required?: boolean; placeholder?: string; inputMode?: "numeric" | "tel" | "email" }) => (
    <div><Label htmlFor={k} className="text-xs">{label}{required ? " *" : ""}</Label><Input id={k} type={type} inputMode={inputMode} value={d[k]} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} className="mt-1.5 h-10" aria-invalid={!!errors[k]} /><FieldError message={errors[k]} /></div>
  );
  const S = ({ k, label, options }: { k: EmployeeField; label: string; options: string[] }) => (
    <div><Label className="text-xs">{label} *</Label><div className="mt-1.5"><FilterSelect label={label} className="h-10 w-full" value={d[k] || "__"} onChange={(v) => set(k, v === "__" ? "" : v)} options={[{ value: "__", label: "Select…" }, ...options.map((x) => ({ value: x, label: x }))]} /></div><FieldError message={errors[k]} /></div>
  );
  const Contact = ({ p }: { p: "ec" | "ec2" }) => (
    <div className="grid gap-3 sm:grid-cols-3">
      {F({ k: `${p}LastName` as EmployeeField, label: "Last name" })}{F({ k: `${p}FirstName` as EmployeeField, label: "First name" })}{F({ k: `${p}MiddleInitial` as EmployeeField, label: "M.I.", required: false })}
      <div className="sm:col-span-3">{F({ k: `${p}Address` as EmployeeField, label: "Address" })}</div>
      {F({ k: `${p}Phone` as EmployeeField, label: "Primary phone", type: "tel", inputMode: "tel" })}{F({ k: `${p}AltPhone` as EmployeeField, label: "Alternate phone", type: "tel", inputMode: "tel", required: false })}{F({ k: `${p}Relationship` as EmployeeField, label: "Relationship" })}
      {F({ k: `${p}Occupation` as EmployeeField, label: "Occupation" })}
    </div>
  );

  async function next() {
    const e = validateStep(o!, d, step);
    setErrors(e);
    if (Object.keys(e).length) { toast.error("Please fix the highlighted fields"); return; }
    setSaving(true);
    const r = await onboardingService.saveProgress(token, d, step + 1);
    setSaving(false);
    if (!r.ok) { toast.error(r.errors.form ?? "Could not save"); return; }
    setStep(step + 1);
    window.scrollTo({ top: 0 });
  }
  async function onPhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErrors({ photo: "Upload an image (JPG or PNG)" }); return; }
    if (file.size > PHOTO_MAX_BYTES) { setErrors({ photo: "Photo must be 2 MB or smaller" }); return; }
    const f = await readFile(file);
    setErrors({});
    await onboardingService.saveProgress(token, d, step, { photo: f });
  }
  async function onCredentials(files: FileList | null) {
    if (!files?.length) return;
    const ok: StoredFile[] = [];
    for (const file of Array.from(files)) {
      if (!(file.type.startsWith("image/") || file.type === "application/pdf")) { toast.error(`${file.name}: images or PDF only`); continue; }
      if (file.size > CREDENTIAL_MAX_BYTES) { toast.error(`${file.name}: must be 5 MB or smaller`); continue; }
      ok.push(await readFile(file));
    }
    if (ok.length) await onboardingService.saveProgress(token, d, step, { credentials: [...o!.credentials, ...ok] });
  }
  async function submit() {
    const e = validateStep(o!, d, 5, pw);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const r = await onboardingService.submit(token, d, pw);
    setSaving(false);
    if (!r.ok) { setErrors(r.errors); toast.error(r.errors.form ?? "Please fix the highlighted fields"); return; }
    setPw({ pw: "", confirm: "" });
    setDone(true);
  }
  async function sendGuarantor() {
    const e = validateStep(o!, d, 3);
    setErrors(e);
    if (Object.keys(e).length) return;
    await onboardingService.saveProgress(token, d, step);
    const r = await onboardingService.sendGuarantorLink(token);
    if (!r.ok) { setErrors(r.errors); return; }
    toast.success("Guarantor link ready — copy it and send it to your guarantor");
  }

  return (
    <PublicFrame title={`Welcome, ${user?.name ?? "new team member"}`} subtitle="Complete your employee data form. Your progress is saved each time you continue.">
      {o.correctionNote && <p className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-xs"><b>The Owner asked for corrections:</b> {o.correctionNote}</p>}
      <ol className="mb-5 flex gap-1.5" aria-label="Progress">
        {ONBOARDING_STEPS.map((s, i) => (
          <li key={s} className="flex-1"><button type="button" disabled={i > o.step} onClick={() => setStep(i)} className={`h-1.5 w-full rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} aria-label={s} /></li>
        ))}
      </ol>
      <p className="mb-3 text-xs font-semibold text-muted-foreground">Step {step + 1} of {ONBOARDING_STEPS.length} · {ONBOARDING_STEPS[step]}</p>
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        {step === 0 && <>
          <div className="grid gap-3 sm:grid-cols-3">{F({ k: "lastName", label: "Last name" })}{F({ k: "firstName", label: "First name" })}{F({ k: "middleInitial", label: "M.I.", required: false })}</div>
          {F({ k: "address", label: "Residential address" })}
          <div className="grid gap-3 sm:grid-cols-2">
            {S({ k: "gender", label: "Gender", options: ["Male", "Female"] })}
            {F({ k: "birthDate", label: "Birth date", type: "date" })}
            {F({ k: "phone", label: "Phone", type: "tel", inputMode: "tel", placeholder: "080…" })}
            {F({ k: "email", label: "Email", type: "email", inputMode: "email" })}
            {S({ k: "maritalStatus", label: "Marital status", options: ["Single", "Married", "Divorced", "Widowed"] })}
            {F({ k: "nationality", label: "Nationality", placeholder: "Nigerian" })}
            {F({ k: "stateOfOrigin", label: "State of origin" })}
            {F({ k: "lga", label: "LGA" })}
          </div>
          {F({ k: "preferredEmailId", label: "Preferred company e-mail name ID", required: false, placeholder: "e.g. ngozi.umeh" })}
        </>}
        {step === 1 && <>
          <p className="text-xs font-semibold">Job details (set by the Owner)</p>
          <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm">
            <div><p className="text-[11px] text-muted-foreground">Job title</p><p className="font-medium">{o.jobTitle}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Employee ID</p><p className="font-medium">{o.employeeId}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Department</p><p className="font-medium">{o.department}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Start date</p><p className="font-medium">{formatDate(o.startDate)}</p></div>
          </div>
          <p className="pt-2 text-xs font-semibold">Previous job reference</p>
          <div className="grid gap-3 sm:grid-cols-2">{F({ k: "refName", label: "Referee name" })}{F({ k: "refJobTitle", label: "Referee job title" })}{F({ k: "refCompany", label: "Company name" })}{F({ k: "refEmail", label: "Referee email", type: "email" })}</div>
        </>}
        {step === 2 && <>
          {isMarried(d) && <>
            <p className="text-xs font-semibold">Family — spouse</p>
            <div className="grid gap-3 sm:grid-cols-3">{F({ k: "spouseLastName", label: "Last name" })}{F({ k: "spouseFirstName", label: "First name" })}{F({ k: "spouseMiddleInitial", label: "M.I.", required: false })}</div>
            <div className="grid gap-3 sm:grid-cols-2">{F({ k: "spousePhone", label: "Phone", type: "tel" })}{F({ k: "spouseEmail", label: "Email", type: "email", required: false })}</div>
            {F({ k: "spouseWorkAddress", label: "Work address" })}
            {S({ k: "spouseIsEmergency", label: "Is your spouse your first emergency contact?", options: ["Yes", "No"] })}
          </>}
          {needsSecondContact(d) ? <><p className="pt-2 text-xs font-semibold">Second emergency contact</p>{Contact({ p: "ec2" })}</>
            : (!isMarried(d) || d.spouseIsEmergency === "No") ? <><p className="pt-2 text-xs font-semibold">Emergency contact</p>{Contact({ p: "ec" })}</>
            : <p className="text-xs text-muted-foreground">Answer the question above to continue.</p>}
        </>}
        {step === 3 && <>
          <p className="text-xs font-semibold">Statutory</p>
          {F({ k: "nin", label: "National ID (NIN)", inputMode: "numeric", placeholder: "11 digits" })}
          <div className="grid gap-3 sm:grid-cols-2">{S({ k: "bankName", label: "Bank name", options: NIGERIAN_BANKS })}{F({ k: "accountNumber", label: "Account number", inputMode: "numeric", placeholder: "10 digits" })}</div>
          <p className="pt-2 text-xs font-semibold">Guarantor</p>
          <div className="grid gap-3 sm:grid-cols-2">{F({ k: "guarantorFirstName", label: "First name" })}{F({ k: "guarantorSurname", label: "Surname" })}</div>
          {F({ k: "guarantorAddress", label: "Residential / office address" })}
          <div className="grid gap-3 sm:grid-cols-2">{F({ k: "guarantorEmail", label: "Email", type: "email" })}{F({ k: "guarantorPhone", label: "Phone", type: "tel" })}</div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs">Guarantor form: <b>{guarantorStatusLabel[o.guarantorStatus]}</b></p>
            {o.guarantorToken ? (
              <div className="mt-2 flex gap-2"><Input readOnly value={guarantorUrl(o.guarantorToken)} className="h-9 font-mono text-xs" /><Button type="button" size="sm" variant="outline" onClick={() => copyText(guarantorUrl(o.guarantorToken!), "Guarantor link copied")}><Copy className="size-4" />Copy</Button></div>
            ) : <Button type="button" size="sm" variant="outline" className="mt-2" onClick={sendGuarantor}>Create guarantor link</Button>}
          </div>
        </>}
        {step === 4 && <>
          <div>
            <p className="text-xs font-semibold">Passport photograph *</p>
            <p className="text-[11px] text-muted-foreground">Clear background showing your full face. Image only, up to 2 MB.</p>
            <div className="mt-2 flex items-center gap-4">
              {o.photo ? <img src={o.photo.dataUrl} alt="Your passport photograph" className="size-28 rounded-md border border-border object-cover" /> : <div className="grid size-28 place-items-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">No photo</div>}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold"><Upload className="size-4" />{o.photo ? "Replace" : "Upload"}<input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} /></label>
            </div>
            <FieldError message={errors.photo} />
          </div>
          <div>
            <p className="text-xs font-semibold">Photocopies of credentials</p>
            <p className="text-[11px] text-muted-foreground">Images or PDF, up to 5 MB each. You can add several.</p>
            <ul className="mt-2 space-y-1">{o.credentials.map((f, i) => (
              <li key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"><span className="flex items-center gap-2 truncate"><FileText className="size-4 shrink-0" />{f.name}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onboardingService.saveProgress(token, d, step, { credentials: o.credentials.filter((_, j) => j !== i) })}><X className="size-4" /></button></li>
            ))}</ul>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold"><Upload className="size-4" />Add files<input type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={(e) => { onCredentials(e.target.files); e.target.value = ""; }} /></label>
          </div>
        </>}
        {step === 5 && <>
          <p className="rounded-md bg-muted/40 p-3 text-sm leading-relaxed">{DECLARATION_TEXT}</p>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={d.declarationAccepted === "yes"} onCheckedChange={(c) => set("declarationAccepted", c ? "yes" : "")} className="mt-0.5" />I accept this declaration *</label>
          <FieldError message={errors.declarationAccepted} />
          <div className="grid gap-3 sm:grid-cols-2">{F({ k: "signature", label: "Signature (type your full name)" })}{F({ k: "signedDate", label: "Date", type: "date" })}</div>
          <p className="pt-2 text-xs font-semibold">Set your account password</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="pw" className="text-xs">Password *</Label><Input id="pw" type="password" autoComplete="new-password" value={pw.pw} onChange={(e) => setPw({ ...pw, pw: e.target.value })} className="mt-1.5 h-10" /></div>
            <div><Label htmlFor="pw2" className="text-xs">Confirm password *</Label><Input id="pw2" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className="mt-1.5 h-10" /></div>
          </div>
          <FieldError message={errors.password} />
          <FieldError message={errors.form} />
        </>}
      </div>
      <div className="mt-4 flex justify-between gap-2">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
        {step < 5 ? <Button onClick={next} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Save & continue</Button>
          : <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Submit form</Button>}
      </div>
    </PublicFrame>
  );
}
