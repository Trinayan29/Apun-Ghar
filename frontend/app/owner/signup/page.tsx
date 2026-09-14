"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { friendlyAuthError, isValidEmail } from "@/lib/auth-errors";
import {
  ApiError,
  getMe,
  isAccountTypeConflict,
  ownerSignup,
} from "@/lib/api";
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
  isValidPhone,
  normalizePhone,
} from "@/components/owner-ui";

type Screen = "checking" | "form" | "google-details" | "conflict";

export default function OwnerSignupPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [screen, setScreen] = useState<Screen>("checking");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [conflictEmail, setConflictEmail] = useState("");

  // INVARIANT: a fresh Firebase identity must reach POST /owners/signup
  // before ANY GET /users/me, because /users/me auto-provisions unknown
  // identities as USER. While this ref is set, the auth-state guard below
  // must not call getMe(): we are actively provisioning (or retrying)
  // owner signup for a fresh identity. Reset whenever no fresh identity
  // needs protection: auth call failed before sign-in, or we signed out.
  const suppressRoleCheck = useRef(false);

  // Already signed in? Route by real backend role — never by client state.
  // OWNER → dashboard. USER/ADMIN → conflict (session stays alive).
  // Unauthenticated → owner signup form. Never touches renter onboarding flag.
  // Skipped while an owner signup is in flight (see invariant above).
  useEffect(() => {
    if (authLoading) return;
    if (suppressRoleCheck.current) return;
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
      } catch (err) {
        if (cancelled) return;
        // 401 (stale session) or network: fall through to the form. A
        // genuine ownerSignup 409 is handled at submit time instead.
        if (err instanceof ApiError && err.isUnauthorized) {
          setScreen("form");
        } else {
          setConflictEmail(firebaseUser.email ?? "");
          setScreen("conflict");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser, router]);

  const clearError = (key: string) =>
    setFieldErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = "Please tell us your full name.";
    if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
    if (!isValidPhone(phone))
      errors.phone =
        "Enter a valid phone number, e.g. +919012345678.";
    if (password.length < 6)
      errors.password = "Password needs at least 6 characters.";
    if (confirm !== password) errors.confirm = "Passwords don't match.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateGoogleDetails = (): boolean => {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = "Please tell us your full name.";
    if (!isValidPhone(phone))
      errors.phone =
        "We need your phone number to reach you about enquiries, e.g. +919012345678.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const showConflict = (forEmail: string) => {
    setConflictEmail(forEmail);
    setFormError("");
    setScreen("conflict");
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!validateForm() || submitting) return;
    setSubmitting(true);
    // From here a fresh Firebase identity may exist at any moment: keep
    // the background guard from calling getMe() until ownerSignup resolves.
    suppressRoleCheck.current = true;
    try {
      // CRITICAL ORDER: ownerSignup() BEFORE any getMe(). /users/me
      // auto-provisions unknown Firebase users as USER, which would
      // turn a fresh owner identity into a 409.
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      try {
        await updateProfile(cred.user, { displayName: name.trim() });
      } catch {
        await signOut(auth);
        suppressRoleCheck.current = false;
        setFormError(
          "Your sign-in was created, but we couldn't save your name. Please sign in and try again."
        );
        return;
      }
      try {
        await ownerSignup({
          display_name: name.trim(),
          phone_number: normalizePhone(phone),
        });
      } catch (apiErr) {
        if (isAccountTypeConflict(apiErr)) {
          // Session stays alive on the conflict screen.
          showConflict(cred.user.email ?? email.trim());
          return;
        }
        // Owner record creation failed for a fresh identity: don't leave
        // a stranded Firebase user behind on a generic error.
        if (apiErr instanceof ApiError && apiErr.status === 422) {
          setFormError(
            "We couldn't create your owner account. Check your details and try again."
          );
          return;
        }
        setFormError(
          apiErr instanceof ApiError
            ? apiErr.message
            : "Couldn't create your owner account. Please try again."
        );
        return;
      }
      router.replace("/owner/dashboard");
    } catch (err) {
      // Firebase-level failure: no fresh identity was created by us, so
      // the background guard may evaluate auth state normally again.
      // (ownerSignup failures are handled above and keep suppression until
      // retry/success, so a fresh identity is never provisioned as USER
      // while the user corrects the form.)
      suppressRoleCheck.current = false;
      const msg = friendlyAuthError(err);
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const googleStart = async () => {
    if (submitting) return;
    setFormError("");
    setSubmitting(true);
    // The identity from the popup must reach ownerSignup() before ANY
    // getMe(): /users/me would auto-provision a fresh Google identity as
    // USER. So: no role pre-check here — collect mandatory name/phone
    // first. Existing USER/ADMIN identities surface as 409 in
    // googleFinish; existing OWNERs succeed idempotently.
    suppressRoleCheck.current = true;
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      setName(cred.user.displayName ?? "");
      setFieldErrors({});
      setScreen("google-details");
    } catch (err) {
      // Popup failed/cancelled: no session change attributable to us.
      suppressRoleCheck.current = false;
      setFormError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const googleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!validateGoogleDetails() || submitting) return;
    setSubmitting(true);
    try {
      await ownerSignup({
        display_name: name.trim(),
        phone_number: normalizePhone(phone),
      });
      router.replace("/owner/dashboard");
    } catch (err) {
      if (isAccountTypeConflict(err)) {
        showConflict(auth.currentUser?.email ?? "");
        return;
      }
      setFormError(
        err instanceof ApiError
          ? err.message
          : "Couldn't create your owner account. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const signOutToForm = async () => {
    setSigningOut(true);
    try {
      await signOut(auth);
    } finally {
      setSigningOut(false);
    }
    // Session ended: no fresh identity needs protection anymore.
    suppressRoleCheck.current = false;
    setEmail("");
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
            onSignOut={signOutToForm}
            signingOut={signingOut}
            variant="signup"
          />
          <p className="mt-6 text-center text-[14px] text-muted">
            Looking for a place to rent instead?{" "}
            <Link
              href="/login"
              className="font-bold text-brand-700 underline underline-offset-2"
            >
              Go to renter sign-in
            </Link>
          </p>
        </div>
      </main>
    );
  }

  if (screen === "google-details") {
    return (
      <OwnerAuthShell
        title="Almost done"
        subtitle="Confirm your details to finish creating your owner account."
        footer={
          <>
            Not you?{" "}
            <button
              type="button"
              onClick={signOutToForm}
              disabled={signingOut}
              className="font-bold text-brand-700 disabled:opacity-60"
            >
              {signingOut ? "Signing out…" : "Use a different Google account"}
            </button>
          </>
        }
      >
        <form onSubmit={googleFinish} noValidate className="space-y-4">
          <Field id="owner-gname" label="Full name" error={fieldErrors.name}>
            <TextField
              id="owner-gname"
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
          <Field
            id="owner-gphone"
            label="Phone number"
            error={fieldErrors.phone}
          >
            <TextField
              id="owner-gphone"
              type="tel"
              autoComplete="tel"
              placeholder="+919012345678"
              value={phone}
              disabled={submitting}
              error={fieldErrors.phone}
              onChange={(v) => {
                setPhone(v);
                clearError("phone");
              }}
            />
          </Field>
          <p className="-mt-1 text-[12.5px] text-muted">
            Required — tenants and Apun-Ghar reach you on this number.
          </p>
          {formError && <FormError message={formError} />}
          <SubmitButton
            loading={submitting}
            label="Create owner account"
            loadingLabel="Creating…"
          />
        </form>
      </OwnerAuthShell>
    );
  }

  return (
    <OwnerAuthShell
      title="Create your owner account"
      subtitle="List your property and manage enquiries from Owner Studio."
      footer={
        <>
          Already an owner?{" "}
          <Link href="/owner/login" className="font-bold text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={create} noValidate className="space-y-4">
        <Field id="owner-name" label="Full name" error={fieldErrors.name}>
          <TextField
            id="owner-name"
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
        <Field id="owner-email" label="Email" error={fieldErrors.email}>
          <TextField
            id="owner-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            disabled={submitting}
            error={fieldErrors.email}
            onChange={(v) => {
              setEmail(v);
              clearError("email");
            }}
          />
        </Field>
        <Field id="owner-phone" label="Phone number" error={fieldErrors.phone}>
          <TextField
            id="owner-phone"
            type="tel"
            autoComplete="tel"
            placeholder="+919012345678"
            value={phone}
            disabled={submitting}
            error={fieldErrors.phone}
            onChange={(v) => {
              setPhone(v);
              clearError("phone");
            }}
          />
        </Field>
        <Field id="owner-password" label="Password" error={fieldErrors.password}>
          <TextField
            id="owner-password"
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
        <Field
          id="owner-confirm"
          label="Confirm password"
          error={fieldErrors.confirm}
        >
          <TextField
            id="owner-confirm"
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
        <SubmitButton
          loading={submitting}
          label="Create owner account"
          loadingLabel="Creating…"
        />
      </form>
      <div className="mt-3">
        <GoogleButton
          onClick={googleStart}
          disabled={submitting}
          label="Continue with Google"
        />
      </div>
      <p className="mt-6 text-center text-[13.5px] text-muted">
        Looking for a place to rent?{" "}
        <Link
          href="/signup"
          className="font-bold text-brand-700 underline underline-offset-2"
        >
          Create a renter account
        </Link>
      </p>
    </OwnerAuthShell>
  );
}
