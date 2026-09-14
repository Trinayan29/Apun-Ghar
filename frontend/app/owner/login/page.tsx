"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { friendlyAuthError, isValidEmail } from "@/lib/auth-errors";
import { ApiError, getMe } from "@/lib/api";
import {
  Field,
  FormError,
  GoogleButton,
  SubmitButton,
  TextField,
} from "@/components/auth-ui";
import {
  OwnerAuthShell,
  OwnerBrand,
  OwnerConflictNotice,
} from "@/components/owner-ui";

type Screen = "checking" | "form" | "conflict";

export default function OwnerLoginPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [screen, setScreen] = useState<Screen>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [conflictEmail, setConflictEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetSending, setResetSending] = useState(false);

  // Already authenticated? Route by real backend role. OWNER → dashboard,
  // USER/ADMIN → account-type conflict (session stays alive).
  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      setScreen("form");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (cancelled) return;
        if (me.role === "OWNER") {
          router.replace("/owner/dashboard");
          return;
        }
        setConflictEmail(me.email ?? firebaseUser.email ?? "");
        setScreen("conflict");
      } catch {
        if (cancelled) return;
        setScreen("form");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser, router]);

  const showConflict = (forEmail: string) => {
    setConflictEmail(forEmail);
    setFormError("");
    setResetSent(false);
    setScreen("conflict");
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!isValidEmail(email))
      errors.email = "Enter the email you used for your owner account.";
    if (password.length === 0) errors.password = "Enter your password.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const routeByRole = async (fallbackEmail: string) => {
    const me = await getMe();
    if (me.role === "OWNER") {
      router.replace("/owner/dashboard");
      return;
    }
    // Never promote or convert accounts.
    showConflict(me.email ?? fallbackEmail);
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setResetSent(false);
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      try {
        await routeByRole(cred.user.email ?? email.trim());
      } catch (err) {
        setFormError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load your account. Please try again."
        );
      }
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const google = async () => {
    if (submitting) return;
    setFormError("");
    setResetSent(false);
    setSubmitting(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      try {
        await routeByRole(cred.user.email ?? "");
      } catch (err) {
        setFormError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load your account. Please try again."
        );
      }
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const forgotPassword = async () => {
    if (resetSending) return;
    if (!isValidEmail(email)) {
      setFieldErrors((e) => ({
        ...e,
        email: "Enter your owner email above first.",
      }));
      return;
    }
    setResetSending(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setResetSending(false);
    }
  };

  const useDifferentEmail = async () => {
    setSigningOut(true);
    try {
      await signOut(auth);
    } finally {
      setSigningOut(false);
    }
    setEmail("");
    setPassword("");
    setFormError("");
    setFieldErrors({});
    setScreen("form");
  };

  if (screen === "checking") {
    return (
      <main className="mx-auto w-full max-w-sm px-6 py-10">
        <p className="text-[14px] text-muted" role="status">
          Loading…
        </p>
      </main>
    );
  }

  if (screen === "conflict") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-paper px-6 pb-8 pt-8 text-ink">
        <OwnerBrand backHref="/list-your-property" />
        <div className="mt-8">
          <OwnerConflictNotice
            email={conflictEmail}
            onSignOut={useDifferentEmail}
            signingOut={signingOut}
            variant="login"
          />
          <p className="mt-6 text-center text-[14px] text-muted">
            New to Apun-Ghar ownership?{" "}
            <Link
              href="/owner/signup"
              className="font-bold text-brand-700 underline underline-offset-2"
            >
              Create an owner account
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <OwnerAuthShell
      title="Owner sign-in"
      subtitle="Welcome back to your Owner Studio."
      footer={
        <>
          New to Apun-Ghar ownership?{" "}
          <Link href="/owner/signup" className="font-bold text-brand-700">
            Create an owner account
          </Link>
        </>
      }
    >
      <form onSubmit={signIn} noValidate className="space-y-4">
        <Field id="owner-login-email" label="Email" error={fieldErrors.email}>
          <TextField
            id="owner-login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            disabled={submitting}
            error={fieldErrors.email}
            onChange={(v) => {
              setEmail(v);
              setFieldErrors((e) => {
                const next = { ...e };
                delete next.email;
                return next;
              });
            }}
          />
        </Field>
        <div>
          <Field
            id="owner-login-password"
            label="Password"
            error={fieldErrors.password}
          >
            <TextField
              id="owner-login-password"
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              disabled={submitting}
              error={fieldErrors.password}
              onChange={(v) => {
                setPassword(v);
                setFieldErrors((e) => {
                  const next = { ...e };
                  delete next.password;
                  return next;
                });
              }}
            />
          </Field>
          <div className="mt-2 text-right">
            {resetSent ? (
              <p role="status" className="text-[13px] font-medium text-brand-700">
                Reset link sent — check your inbox.
              </p>
            ) : (
              <button
                type="button"
                onClick={forgotPassword}
                disabled={resetSending}
                className="min-h-[44px] text-[13.5px] font-semibold text-brand-700 disabled:opacity-60"
              >
                {resetSending ? "Sending…" : "Forgot password?"}
              </button>
            )}
          </div>
        </div>
        {formError && <FormError message={formError} />}
        <SubmitButton
          loading={submitting}
          label="Sign in"
          loadingLabel="Signing in…"
        />
      </form>
      <div className="mt-3">
        <GoogleButton
          onClick={google}
          disabled={submitting}
          label="Continue with Google"
        />
      </div>
      <p className="mt-6 text-center text-[13.5px] text-muted">
        Looking for a place to rent?{" "}
        <Link
          href="/login"
          className="font-bold text-brand-700 underline underline-offset-2"
        >
          Go to renter sign-in
        </Link>
      </p>
    </OwnerAuthShell>
  );
}
