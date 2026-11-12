import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Boxes,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  TrendingUp,
  User,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as auth from "@/services/auth";
import { useAuth } from "@/contexts/auth-context";

// ─────────────────────────── Layout ───────────────────────────

const highlights: { icon: LucideIcon; title: string; detail: string }[] = [
  { icon: Boxes, title: "Live stock across branches", detail: "Every addition, request and sale moves the same numbers." },
  { icon: TrendingUp, title: "Sales and targets in real time", detail: "Reps, managers and the Owner see progress as it happens." },
  { icon: ShieldCheck, title: "The right access for every role", detail: "Approvals flow from storekeeper to manager to Owner." },
];

/**
 * Brand colours for the sign-in pages: orange, black and green. Set as variables
 * on the page root, so buttons, focus rings and info messages turn orange here
 * without changing the rest of the app. Orange buttons carry black text: white on
 * this orange would be too low in contrast to read comfortably.
 */
const ORANGE = "oklch(0.72 0.19 50)";
const GREEN = "oklch(0.72 0.17 150)";
const brandVars = {
  "--primary": ORANGE,
  "--primary-foreground": "oklch(0.17 0.02 50)",
  "--ring": ORANGE,
  "--success": "oklch(0.6 0.16 150)",
} as CSSProperties;
const linkClass = "font-medium text-orange-700 underline-offset-4 hover:underline dark:text-orange-400";

function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl bg-[oklch(0.72_0.19_50)] text-[oklch(0.17_0.02_50)] shadow-sm ${className}`}>
      <Activity className="size-1/2" aria-hidden="true" />
    </span>
  );
}

/**
 * Sign-in, sign-up and password pages: a brand panel beside the form on large
 * screens; on smaller screens the panel folds into a compact header above it.
 */
function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: string | undefined; children: ReactNode; footer?: ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <div className="flex min-h-screen bg-background text-foreground" style={brandVars}>
      <aside className="relative hidden w-[44%] max-w-[640px] shrink-0 flex-col justify-between overflow-hidden bg-[oklch(0.15_0.008_60)] p-10 text-white lg:flex xl:p-14">
        {/* Soft light and a faint grid give depth without imagery. */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 size-[28rem] rounded-full bg-[oklch(0.72_0.19_50)] opacity-25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -right-24 size-[26rem] rounded-full bg-[oklch(0.72_0.17_150)] opacity-[0.18] blur-3xl" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_80%)]"
        />

        <div className="relative flex items-center gap-3">
          <BrandMark className="size-10" />
          <span className="text-lg font-semibold tracking-tight">Friscontech</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
            Sales, stock and teams, <span style={{ color: ORANGE }}>working as one.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/75">
            Run every branch from one place, with clear numbers and clear responsibilities.
          </p>
          <ul className="mt-10 space-y-6">
            {highlights.map(({ icon: Icon, title: t, detail }) => (
              <li key={t} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
                  <Icon className="size-5" style={{ color: GREEN }} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{t}</span>
                  <span className="mt-0.5 block text-sm text-white/65">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/55">© {year} Friscon Tech Limited</p>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2.5 px-4 pt-6 sm:px-8 lg:hidden">
          <BrandMark className="size-9" />
          <span className="text-base font-semibold tracking-tight">Friscontech</span>
        </header>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[400px]">
            <div className="mb-8">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
              {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
            {footer && <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 pb-6 text-xs text-muted-foreground lg:justify-end lg:px-8">
          <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5 text-[oklch(0.6_0.16_150)]" aria-hidden="true" />Secure sign-in</span>
          <span aria-hidden="true" className="lg:hidden">·</span>
          <span className="lg:hidden">© {new Date().getFullYear()} Friscon Tech Limited</span>
        </footer>
      </main>
    </div>
  );
}

// ─────────────────────────── Pieces ───────────────────────────

function Field({ id, label, type = "text", value, onChange, auto, reveal = false, icon: Icon, placeholder, action }: {
  id: string; label: string; type?: string; value: string; onChange: (v: string) => void; auto?: string; reveal?: boolean;
  icon?: LucideIcon | undefined; placeholder?: string | undefined; action?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const inputType = reveal && type === "password" && visible ? "text" : type;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-[13px] font-medium">{label}</Label>
        {action}
      </div>
      <div className="relative mt-2">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />}
        <Input
          id={id}
          type={inputType}
          autoComplete={auto}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`h-11 bg-card text-[15px] shadow-sm sm:text-sm ${Icon ? "pl-10" : ""} ${reveal ? "pr-11" : ""}`}
          required
        />
        {reveal && type === "password" && (
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  );
}

function Message({ tone, children }: { tone: "error" | "info" | "success"; children: ReactNode }) {
  const styles = {
    error: "border-destructive/25 bg-destructive/5 text-destructive",
    info: "border-primary/30 bg-primary/10 text-foreground",
    success: "border-success/25 bg-success/5 text-foreground",
  }[tone];
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-relaxed ${styles}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone === "error" ? "" : tone === "success" ? "text-success" : "text-primary"}`} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const Err = ({ msg }: { msg: string }) => (msg ? <Message tone="error">{msg}</Message> : null);

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <Button type="submit" className="h-11 w-full text-[15px] font-semibold shadow-sm sm:text-sm" disabled={busy}>
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  );
}

const backToSignIn = (
  <Link to="/login" className={`inline-flex items-center gap-1.5 ${linkClass}`}>
    <ArrowLeft className="size-4" aria-hidden="true" />Back to sign in
  </Link>
);

// ─────────────────────────── Pages ───────────────────────────

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
    <AuthFrame
      title={setup ? "Create the Owner account" : "Welcome back"}
      subtitle={setup ? "The first account becomes the Owner. After this, staff join only through onboarding links." : "Sign in with the email and password you set during onboarding."}
      footer={!setup && <>New to the team? Ask the Owner for an onboarding link.</>}
    >
      <form onSubmit={submit} className="space-y-5">
        {setup && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="firstName" label="First name" auto="given-name" icon={User} value={f.firstName} onChange={(v) => setF({ ...f, firstName: v })} />
              <Field id="lastName" label="Last name" auto="family-name" value={f.lastName} onChange={(v) => setF({ ...f, lastName: v })} />
            </div>
            <Field id="orgName" label="Organization name" auto="organization" icon={Building2} value={f.orgName} onChange={(v) => setF({ ...f, orgName: v })} />
          </>
        )}
        <Field id="email" label="Email" type="email" auto="email" icon={Mail} placeholder="you@company.com" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
        <Field
          id="pw"
          label="Password"
          type="password"
          auto={setup ? "new-password" : "current-password"}
          icon={Lock}
          value={f.pw}
          onChange={(v) => setF({ ...f, pw: v })}
          reveal
          action={!setup && <Link to="/forgot-password" className={`text-[13px] ${linkClass}`}>Forgot password?</Link>}
        />
        {setup && <Field id="pw2" label="Confirm password" type="password" auto="new-password" icon={Lock} value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} reveal />}
        {notice && <Message tone="info">{notice}</Message>}
        <Err msg={err} />
        <SubmitButton busy={busy}>{setup ? "Create account" : "Sign in"}</SubmitButton>
      </form>
    </AuthFrame>
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
    <AuthFrame
      title={sent ? "Check your email" : "Reset your password"}
      subtitle={sent ? undefined : "Enter your account email and we'll send you a reset link."}
      footer={backToSignIn}
    >
      {sent ? (
        <Message tone="success">
          <p>If an account exists for that email, a reset link has been sent. Check your inbox and follow the instructions.</p>
          <p className="mt-1.5 text-muted-foreground">The link expires in 1 hour and can only be used once.</p>
        </Message>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field id="email" label="Email" type="email" auto="email" icon={Mail} placeholder="you@company.com" value={email} onChange={setEmail} />
          <SubmitButton busy={busy}>Send reset link</SubmitButton>
        </form>
      )}
    </AuthFrame>
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
    <AuthFrame
      title="Choose a new password"
      subtitle={link.state === "ready" ? "Enter a new password for your account." : undefined}
      footer={backToSignIn}
    >
      {link.state === "checking" && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Verifying your reset link…
        </p>
      )}
      {link.state === "invalid" && (
        <div className="space-y-5">
          <Message tone="error">
            <p className="font-medium">{link.error}</p>
            <p className="mt-1 text-muted-foreground">Request a new link and use the latest email you receive.</p>
          </Message>
          <Button asChild className="h-11 w-full font-semibold"><Link to="/forgot-password">Send a new reset link</Link></Button>
        </div>
      )}
      {link.state === "ready" && (
        <form onSubmit={submit} className="space-y-5">
          <Field id="pw" label="New password" type="password" auto="new-password" icon={Lock} value={f.pw} onChange={(v) => setF({ ...f, pw: v })} reveal />
          <Field id="pw2" label="Confirm new password" type="password" auto="new-password" icon={Lock} value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} reveal />
          <Err msg={err} />
          <SubmitButton busy={busy}>Update password</SubmitButton>
        </form>
      )}
    </AuthFrame>
  );
}
