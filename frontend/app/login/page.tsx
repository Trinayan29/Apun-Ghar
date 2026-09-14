"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { isOnboardingDone } from "@/lib/onboarding-storage";
import { getMe } from "@/lib/api";
import { friendlyAuthError, isValidEmail } from "@/lib/auth-errors";
import {
  AuthShell,
  Field,
  FormError,
  GoogleButton,
  OwnerEntryLink,
  SubmitButton,
  TextField,
} from "@/components/auth-ui";

export default function LoginPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading || !firebaseUser) return;
    // OWNER accounts live in Owner Studio — never renter onboarding.
    // Only an exact OWNER role redirects; USER/ADMIN keep renter behavior.
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (cancelled) return;
        if (me.role === "OWNER") {
          router.replace("/owner/dashboard");
          return;
        }
      } catch {
        // Fall through to renter routing on network/401 hiccups.
      }
      if (!cancelled) {
        router.replace(
          isOnboardingDone(firebaseUser.uid) ? "/" : "/onboarding"
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser, router]);

  const routeAuthenticated = async (uid: string) => {
    try {
      const me = await getMe();
      if (me.role === "OWNER") {
        router.replace("/owner/dashboard");
        return;
      }
    } catch {
      // Fall through to renter routing.
    }
    router.replace(isOnboardingDone(uid) ? "/" : "/onboarding");
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
    if (password.length === 0) errors.password = "Enter your password.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      await routeAuthenticated(cred.user.uid);
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const google = async () => {
    if (submitting) return;
    setFormError("");
    setSubmitting(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await routeAuthenticated(cred.user.uid);
    } catch (err) {
      setFormError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-bold text-brand-700">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={signIn} noValidate className="space-y-4">
        <Field id="email" label="Email" error={fieldErrors.email}>
          <TextField
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@college.edu"
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
          <Field id="password" label="Password" error={fieldErrors.password}>
            <TextField
              id="password"
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
            <span className="text-[13px] text-muted">
              Forgot password? Contact support for now.
            </span>
          </div>
        </div>
        {formError && <FormError message={formError} />}
        <SubmitButton loading={submitting} label="Sign in" loadingLabel="Signing in…" />
      </form>
      <div className="mt-3">
        <GoogleButton onClick={google} disabled={submitting} label="Continue with Google" />
      </div>
      <OwnerEntryLink />
    </AuthShell>
  );
}
