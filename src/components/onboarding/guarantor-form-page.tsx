import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/shared";
import { InvalidLink, PublicFrame } from "@/components/onboarding/onboarding-form-page";
import { GUARANTOR_INTRO } from "@/data/onboarding";
import { findOnboardingByGuarantorToken, fullName } from "@/lib/onboarding";
import { useDb } from "@/services/mock-store";
import { onboardingService } from "@/services/services";

export function GuarantorFormPage({ token }: { token: string }) {
  const db = useDb();
  const o = findOnboardingByGuarantorToken(db, token);
  const [f, setF] = useState({ yearsKnown: "", relationship: "", character: "", comments: "", signature: "", signedDate: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  if (!o) return <InvalidLink message="This guarantor link is not valid. (Demo: links only work in the browser session where they were created.)" />;
  if (o.guarantorStatus === "completed") return <PublicFrame title="Thank you" subtitle="Your guarantor response has been received."><div className="rounded-lg border border-border bg-card p-6 text-sm">Your answers are confidential and visible only to the Business Owner.</div></PublicFrame>;
  const employee = fullName(o.data) || db.users.find((u) => u.id === o.userId)?.name || "the applicant";

  async function submit() {
    setSaving(true);
    const r = await onboardingService.submitGuarantor(token, f);
    setSaving(false);
    if (!r.ok) { setErr(r.errors.form ?? "Please complete the form"); return; }
    toast.success("Thank you — your response was submitted");
  }
  const T = (k: keyof typeof f, label: string, required = true) => (
    <div><Label htmlFor={k} className="text-xs">{label}{required ? " *" : ""}</Label><Textarea id={k} rows={3} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1.5" /></div>
  );
  return (
    <PublicFrame title="Guarantor Form" subtitle={`Applicant: ${employee} · ${o.jobTitle}`}>
      <p className="mb-4 rounded-md bg-muted/40 p-4 text-sm leading-relaxed">Dear {o.data.guarantorFirstName} {o.data.guarantorSurname}, {GUARANTOR_INTRO}</p>
      <p className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-destructive"><ShieldAlert className="size-4" />Confidential</p>
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div><Label htmlFor="yearsKnown" className="text-xs">How long have you known the employee? *</Label><Input id="yearsKnown" value={f.yearsKnown} onChange={(e) => setF({ ...f, yearsKnown: e.target.value })} className="mt-1.5 h-10" placeholder="e.g. 6 years" /></div>
        {T("relationship", "Nature of relationship")}
        {T("character", "Description of character")}
        {T("comments", "Additional comments", false)}
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="sig" className="text-xs">Signature (type your full name) *</Label><Input id="sig" value={f.signature} onChange={(e) => setF({ ...f, signature: e.target.value })} className="mt-1.5 h-10" /></div>
          <div><Label htmlFor="sd" className="text-xs">Date *</Label><Input id="sd" type="date" value={f.signedDate} onChange={(e) => setF({ ...f, signedDate: e.target.value })} className="mt-1.5 h-10" /></div>
        </div>
        <FieldError message={err} />
        <Button className="w-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}Submit response</Button>
      </div>
    </PublicFrame>
  );
}
