import { useState, type FormEvent } from "react";
import { supabase } from "../lib/db";
import { Field } from "../components/ui";

/**
 * Magic link / email code sign-in. The screen says the same thing whatever
 * email is typed, so it never reveals which addresses are allowed.
 */
export function Login({ notAllowed, onSignOut }: { notAllowed?: boolean; onSignOut?: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const request = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    // Errors are swallowed on purpose: an unknown email and a known one look identical.
    await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + window.location.pathname },
    }).catch(() => {});
    setBusy(false);
    setSent(true);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setCodeError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(), token: code.trim(), type: "email",
    });
    setBusy(false);
    if (error) setCodeError("That code did not work. Check it, or ask for a new one.");
  };

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 text-buff lg:flex">
        <p className="text-[20px] font-bold tracking-[0.04em]">PAIDI CRM</p>
        <div>
          <p className="max-w-[18ch] text-[44px] font-bold leading-[1.05] tracking-[-0.02em]">
            Every prospect, every touch, and where they drop off.
          </p>
          <p className="mt-4 max-w-[38ch] text-[16px] text-rail-text">
            The outreach pipeline for Philadelphia AI Development Initiative.
          </p>
        </div>
        <div className="flex h-16 overflow-hidden rounded-[14px]" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <span key={n} className={`flex-1 depth-${n}`} />)}
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          <p className="mb-8 text-[18px] font-bold tracking-[0.04em] lg:hidden">PAIDI CRM</p>
          {notAllowed ? (
            <>
              <h1 className="page-title">This account does not have access</h1>
              <p className="mt-2 text-mute">PAIDI CRM is limited to the PAIDI team. Sign out and use your team email.</p>
              <button className="btn btn-navy mt-6" onClick={onSignOut}>Sign out</button>
            </>
          ) : !sent ? (
            <form onSubmit={request}>
              <h1 className="page-title">Sign in</h1>
              <p className="mt-2 text-mute">Enter your email and we will send you a sign-in link. No password.</p>
              <Field label="Email" className="mt-6">
                <input
                  className="input" type="email" inputMode="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                />
              </Field>
              <button className="btn btn-primary mt-4 w-full" disabled={busy}>
                {busy ? "Sending…" : "Send sign-in link"}
              </button>
              <button
                type="button" className="btn btn-ghost mt-2 w-full"
                onClick={(e) => { if (e.currentTarget.form?.reportValidity()) setSent(true); }}
              >
                I already have a code
              </button>
            </form>
          ) : (
            <form onSubmit={verify}>
              <h1 className="page-title">Check your email</h1>
              <p className="mt-2 text-mute">
                If <strong className="text-ink">{email.trim()}</strong> has access, a sign-in link is on its way.
                Open it in this browser, on this device.
              </p>
              <Field label="Sign-in code" className="mt-6" error={codeError}
                hint="If the email shows a code, you can type it here instead of opening the link.">
                <input
                  className="input tracking-[0.25em]" inputMode="numeric" autoComplete="one-time-code"
                  maxLength={8} value={code} aria-invalid={!!codeError}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
              <button className="btn btn-primary mt-4 w-full" disabled={busy || code.length < 6}>
                {busy ? "Checking…" : "Sign in with code"}
              </button>
              <button type="button" className="btn btn-ghost mt-2 w-full" onClick={() => { setSent(false); setCode(""); setCodeError(null); }}>
                Use a different email
              </button>
              <p className="hint mt-4">
                Nothing after a few minutes? Sign-in emails are limited to a few per hour, so wait before asking again.
              </p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
