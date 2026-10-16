import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicFrame } from "@/components/onboarding/onboarding-form-page";
import * as auth from "@/services/auth";
import { useAuth } from "@/contexts/auth-context";

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
  const { user } = useAuth();
  const [setup, setSetup] = useState(false);
  const [f, setF] = useState({ email: "", pw: "", confirm: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate({ to: "/" });
    }
  }, [user, navigate]);

  // Check if owner account exists
  useEffect(() => {
    auth.ownerHasAccount().then((exists) => setSetup(!exists));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (setup && f.pw !== f.confirm) return setErr("Passwords don't match");
    setBusy(true);
    const r = setup 
      ? await auth.signUpOwner(f.email, f.pw) 
      : await auth.signIn(f.email, f.pw);
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
  const [sent, setSent] = useState(false);
  
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await auth.requestPasswordReset(email);
    setBusy(false);
    if (r.ok) setSent(true);
  }
  
  return (
    <PublicFrame title="Reset your password" subtitle="Enter your account email and we'll send you a reset link.">
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        {sent ? (
          <>
            <p className="text-sm">
              If an account exists for that email, a reset link has been sent. 
              Check your inbox and follow the instructions.
            </p>
            <p className="text-xs text-muted-foreground">
              The link expires in 1 hour and can only be used once.
            </p>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field id="email" label="Email" type="email" auto="email" value={email} onChange={setEmail} />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Send reset link
            </Button>
          </form>
        )}
        <p className="text-center text-xs">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </PublicFrame>
  );
}

export function ResetPasswordPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ pw: "", confirm: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  
  // Supabase handles token validation automatically via URL hash
  // The token is embedded in the auth state when user clicks email link
  
  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (f.pw !== f.confirm) return setErr("Passwords don't match");
    setBusy(true);
    const r = await auth.resetPassword(f.pw);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.success("Password updated. Sign in with your new password.");
    navigate({ to: "/login" });
  }
  
  return (
    <PublicFrame title="Choose a new password">
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field id="pw" label="New password" type="password" auto="new-password" value={f.pw} onChange={(v) => setF({ ...f, pw: v })} />
          <Field id="pw2" label="Confirm new password" type="password" auto="new-password" value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} />
          <Err msg={err} />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Update password
          </Button>
        </form>
      </div>
    </PublicFrame>
  );
}
