"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
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

export default function SignupPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading || !firebaseUser) return;
    // OWNER accounts live in Owner Studio — never renter onboarding.
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

  const clearError = (key: string) =>
    setFieldErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = "Please tell us your name.";
    if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
    if (password.length < 6)
      errors.password = "Password needs at least 6 characters.";
    if (confirm !== password) errors.confirm = "Passwords don't match.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      try {
        await updateProfile(cred.user, { displayName: name.trim() });
      } catch {
        await signOut(auth);
        setFormError(
          "Your account was created, but we couldn't save your name. Please sign in to continue."
        );
        return;
      }
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
      title="Create your account"
      subtitle="Takes less than a minute. No spam, ever."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={create} noValidate className="space-y-4">
        <Field id="name" label="Name" error={fieldErrors.name}>
          <TextField
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Your full name"
            value={name}
            disabled={submitting}
            error={fieldErrors.name}
            onChange={(v) => {
              setName(v);
              clearError("name");
            }}
          />
        </Field>
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
              clearError("email");
            }}
          />
        </Field>
        <Field id="password" label="Password" error={fieldErrors.password}>
          <TextField
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Minimum 6 characters"
            value={password}
            disabled={submitting}
            error={fieldErrors.password}
            onChange={(v) => {
              setPassword(v);
              clearError("password");
            }}
          />
        </Field>
        <Field id="confirm" label="Confirm password" error={fieldErrors.confirm}>
          <TextField
            id="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={confirm}
            disabled={submitting}
            error={fieldErrors.confirm}
            onChange={(v) => {
              setConfirm(v);
              clearError("confirm");
            }}
          />
        </Field>
        {formError && <FormError message={formError} />}
        <SubmitButton loading={submitting} label="Create account" loadingLabel="Creating…" />
      </form>
      <div className="mt-3">
        <GoogleButton onClick={google} disabled={submitting} label="Continue with Google" />
      </div>
      <OwnerEntryLink />
    </AuthShell>
  );
}
