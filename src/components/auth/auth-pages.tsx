import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicFrame } from "@/components/onboarding/onboarding-form-page";
import * as auth from "@/services/auth";
import { useAuth } from "@/contexts/auth-context";

function Field({ id, label, type = "text", value, onChange, auto, reveal = false }: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void; auto?: string; reveal?: boolean }) {
  const [visible, setVisible] = useState(false);
  const inputType = reveal && type === "password" && visible ? "text" : type;

  return (
    <div>
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="relative mt-1.5">
        <Input id={id} type={inputType} autoComplete={auto} value={value} onChange={(e) => onChange(e.target.value)} className={reveal ? "h-10 pr-10" : "h-10"} required />
        {reveal && type === "password" && (
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  );
}
const Err = ({ msg }: { msg: string }) => (msg ? <p className="text-xs font-medium text-destructive">{msg}</p> : null);

export function LoginPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { confirmed } = useSearch({ from: "/login" });
  const [setup, setSetup] = useState(false);
  const [f, setF] = useState({ firstName: "", lastName: "", orgName: "", email: "", pw: "", confirm: "" });
  const [err, setErr] = useState("");
  // Arrived from the sign-up confirmation email.
  const [notice, setNotice] = useState(confirmed ? "Email confirmed. Staff can sign in once the Owner approves their onboarding." : "");
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
    setNotice("");
    if (setup && f.pw !== f.confirm) return setErr("Passwords don't match");
    setBusy(true);
    let notice: string | undefined;
    if (setup) {
      const r = await auth.signUpOwner({
        email: f.email,
        password: f.pw,
        firstName: f.firstName,
        lastName: f.lastName,
        orgName: f.orgName,
      });
      setBusy(false);
      if (!r.ok) return setErr(r.error);
      if (r.data.confirmationRequired) {
        notice = "Account created. Confirm your email using the link from Supabase, then return here to sign in.";
      }
    } else {
      const r = await auth.signIn(f.email, f.pw);
      setBusy(false);
      if (!r.ok) return setErr(r.error);
      // signIn does not have confirmationRequired
    }
    if (notice) {
      setNotice(notice);
      return;
    }
    toast.success(setup ? "Owner account created" : "Signed in");
    navigate({ to: "/" });
  }

  return (
    <PublicFrame title={setup ? "Create the Owner account" : "Sign in"} subtitle={setup ? "The first account becomes the Owner. After this, staff join only through onboarding links." : "Use the email and password you set during onboarding."}>
      <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-6">
        {setup && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="firstName" label="Your first name" auto="given-name" value={f.firstName} onChange={(v) => setF({ ...f, firstName: v })} />
              <Field id="lastName" label="Your last name" auto="family-name" value={f.lastName} onChange={(v) => setF({ ...f, lastName: v })} />
            </div>
            <Field id="orgName" label="Organization name" auto="organization" value={f.orgName} onChange={(v) => setF({ ...f, orgName: v })} />
          </>
        )}
        <Field id="email" label="Email" type="email" auto="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
        <Field id="pw" label="Password" type="password" auto={setup ? "new-password" : "current-password"} value={f.pw} onChange={(v) => setF({ ...f, pw: v })} reveal />
        {setup && <Field id="pw2" label="Confirm password" type="password" auto="new-password" value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} reveal />}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
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

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [f, setF] = useState({ pw: "", confirm: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ state: "checking" } | { state: "ready" } | { state: "invalid"; error: string }>({ state: "checking" });

  // The email link signs the user in for this one purpose; wait for that session.
  useEffect(() => auth.watchRecoveryLink((r) => setLink(r.ok ? { state: "ready" } : { state: "invalid", error: r.error })), []);

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
        {link.state === "checking" && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Verifying your reset link…
          </p>
        )}
        {link.state === "invalid" && (
          <>
            <p className="text-sm font-medium text-destructive">{link.error}</p>
            <p className="text-sm text-muted-foreground">Request a new link and use the latest email you receive.</p>
            <Button asChild className="w-full"><Link to="/forgot-password">Send a new reset link</Link></Button>
          </>
        )}
        {link.state === "ready" && (
          <form onSubmit={submit} className="space-y-4">
            <Field id="pw" label="New password" type="password" auto="new-password" value={f.pw} onChange={(v) => setF({ ...f, pw: v })} reveal />
            <Field id="pw2" label="Confirm new password" type="password" auto="new-password" value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} reveal />
            <Err msg={err} />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Update password
            </Button>
          </form>
        )}
      </div>
    </PublicFrame>
  );
}
