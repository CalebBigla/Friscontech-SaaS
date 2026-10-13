import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicFrame } from "@/components/onboarding/onboarding-form-page";
import { mockAuth } from "@/services/mock-auth";

function Field({ id, label, type = "text", value, onChange, auto }: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void; auto?: string }) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type={type} autoComplete={auto} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 h-10" required />
    </div>
  );
}
const Err = ({ msg }: { msg: string }) => (msg ? <p className="text-xs font-medium text-destructive">{msg}</p> : null);

export function LoginPage() {
  const navigate = useNavigate();
  const [setup, setSetup] = useState(false);
  const [f, setF] = useState({ email: "", pw: "", confirm: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setSetup(!mockAuth.ownerHasAccount()), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (setup && f.pw !== f.confirm) return setErr("Passwords don't match");
    setBusy(true);
    const r = setup ? await mockAuth.signUpOwner(f.email, f.pw) : await mockAuth.signIn(f.email, f.pw);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.success("Signed in");
    navigate({ to: "/" });
  }

  return (
    <PublicFrame title={setup ? "Create the Owner account" : "Sign in"} subtitle={setup ? "The first account becomes the Owner. After this, staff join only through onboarding links." : "Use the email and password you set during onboarding."}>
      <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-6">
        <Field id="email" label="Email" type="email" auto="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
        <Field id="pw" label="Password" type="password" auto={setup ? "new-password" : "current-password"} value={f.pw} onChange={(v) => setF({ ...f, pw: v })} />
        {setup && <Field id="pw2" label="Confirm password" type="password" auto="new-password" value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} />}
        <Err msg={err} />
        <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />}{setup ? "Create account" : "Sign in"}</Button>
        {!setup && <p className="text-center text-xs"><Link to="/forgot-password" className="font-medium text-primary hover:underline">Forgot password?</Link></p>}
      </form>
    </PublicFrame>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ token: string | null } | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await mockAuth.requestReset(email);
    setBusy(false);
    if (r.ok) setSent({ token: r.data });
  }
  return (
    <PublicFrame title="Reset your password" subtitle="Enter your account email and we'll send you a reset link.">
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        {sent ? (
          <>
            <p className="text-sm">If an account exists for that email, a reset link has been sent. It works once and expires in 1 hour.</p>
            {sent.token && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-xs">
                Demo only (emails aren't connected yet): <Link to="/reset-password" search={{ token: sent.token }} className="font-medium text-primary hover:underline">open the reset link</Link>
              </p>
            )}
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field id="email" label="Email" type="email" auto="email" value={email} onChange={setEmail} />
            <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />}Send reset link</Button>
          </form>
        )}
        <p className="text-center text-xs"><Link to="/login" className="font-medium text-primary hover:underline">Back to sign in</Link></p>
      </div>
    </PublicFrame>
  );
}

export function ResetPasswordPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const [valid, setValid] = useState<boolean | null>(null);
  const [f, setF] = useState({ pw: "", confirm: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setValid(mockAuth.resetTokenValid(token)), [token]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.pw !== f.confirm) return setErr("Passwords don't match");
    setBusy(true);
    const r = await mockAuth.resetPassword(token, f.pw);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.success("Password updated. Sign in with your new password.");
    navigate({ to: "/login" });
  }
  return (
    <PublicFrame title="Choose a new password">
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        {valid === false ? (
          <p className="text-sm">This reset link is invalid, already used or expired. <Link to="/forgot-password" className="font-medium text-primary hover:underline">Request a new one</Link>.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field id="pw" label="New password" type="password" auto="new-password" value={f.pw} onChange={(v) => setF({ ...f, pw: v })} />
            <Field id="pw2" label="Confirm new password" type="password" auto="new-password" value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} />
            <Err msg={err} />
            <Button type="submit" className="w-full" disabled={busy || valid === null}>{busy && <Loader2 className="size-4 animate-spin" />}Update password</Button>
          </form>
        )}
      </div>
    </PublicFrame>
  );
}
