import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/shared";
import { InvalidLink, PublicFrame } from "@/components/onboarding/onboarding-form-page";
import { GUARANTOR_INTRO } from "@/data/onboarding";
import { onboardingService } from "@/services/onboarding-service";
import { supabase } from "@/lib/supabase";

type GuarantorInfo = {
  id: string;
  employee_name: string;
  job_title: string;
  guarantor_first_name: string;
  guarantor_surname: string;
  guarantor_status: string;
};

export function GuarantorFormPage({ token }: { token: string }) {
  const [info, setInfo] = useState<GuarantorInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ yearsKnown: "", relationship: "", character: "", comments: "", signature: "", signedDate: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc("get_onboarding_for_guarantor", {
        p_guarantor_token: token,
      });
      if (!active) return;
      if (error || !data || !Array.isArray(data) || data.length === 0) {
        setLoadError("This guarantor link is not valid.");
        setLoading(false);
        return;
      }
      setInfo(data[0] as GuarantorInfo);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [token]);

  if (loading) return <PublicFrame title="Loading…"><Loader2 className="size-5 animate-spin" /></PublicFrame>;
  if (loadError) return <InvalidLink message={loadError} />;
  if (!info) return <InvalidLink message="This guarantor link is not valid." />;

  if (info.guarantor_status === "completed" || done) {
    return (
      <PublicFrame title="Thank you" subtitle="Your guarantor response has been received.">
        <div className="rounded-lg border border-border bg-card p-6 text-sm">
          Your answers are confidential and visible only to the Business Owner.
        </div>
      </PublicFrame>
    );
  }

  async function submit() {
    setErr("");
    setSaving(true);
    const r = await onboardingService.submitGuarantor(token, f);
    setSaving(false);
    if (!r.ok) { setErr(r.errors.form ?? "Please complete the form"); return; }
    toast.success("Thank you — your response was submitted");
    setDone(true);
  }

  const T = (k: keyof typeof f, label: string, required = true) => (
    <div>
      <Label htmlFor={k} className="text-xs">{label}{required ? " *" : ""}</Label>
      <Textarea id={k} rows={3} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1.5" />
    </div>
  );

  return (
    <PublicFrame title="Guarantor Form" subtitle={`Applicant: ${info.employee_name} · ${info.job_title}`}>
      <p className="mb-4 rounded-md bg-muted/40 p-4 text-sm leading-relaxed">
        Dear {info.guarantor_first_name} {info.guarantor_surname}, {GUARANTOR_INTRO}
      </p>
      <p className="mb-4 flex items-center gap-1.5 text-xs font-semibold text-destructive">
        <ShieldAlert className="size-4" />Confidential
      </p>
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div>
          <Label htmlFor="yearsKnown" className="text-xs">How long have you known the employee? *</Label>
          <Input id="yearsKnown" value={f.yearsKnown} onChange={(e) => setF({ ...f, yearsKnown: e.target.value })} className="mt-1.5 h-10" placeholder="e.g. 6 years" />
        </div>
        {T("relationship", "Nature of relationship")}
        {T("character", "Description of character")}
        {T("comments", "Additional comments", false)}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="sig" className="text-xs">Signature (type your full name) *</Label>
            <Input id="sig" value={f.signature} onChange={(e) => setF({ ...f, signature: e.target.value })} className="mt-1.5 h-10" />
          </div>
          <div>
            <Label htmlFor="sd" className="text-xs">Date *</Label>
            <Input id="sd" type="date" value={f.signedDate} onChange={(e) => setF({ ...f, signedDate: e.target.value })} className="mt-1.5 h-10" />
          </div>
        </div>
        <FieldError message={err} />
        <Button className="w-full" onClick={submit} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}Submit response
        </Button>
      </div>
    </PublicFrame>
  );
}
