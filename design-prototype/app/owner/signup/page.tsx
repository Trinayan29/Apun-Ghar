"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/store/AppStore";
import Icon from "@/components/Icon";
import {
  OwnerBrand,
  OwnerConflictNotice,
  OwnerField,
  OwnerInput,
  PasswordToggle,
} from "@/components/owner-ui";

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isValidPhone(v: string): boolean {
  return /^\+?[0-9]{7,15}$/.test(v.replace(/[\s-]/g, ""));
}

export default function OwnerSignup() {
  const router = useRouter();
  const { setOwner } = useApp();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [conflict, setConflict] = useState(false);

  // Google step: popup first, phone second (backend requires it).
  const [googleMode, setGoogleMode] = useState(false);
  const [googleName, setGoogleName] = useState("");

  const clear = (k: string) =>
    setErrors((e) => {
      if (!e[k]) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Please tell us your full name.";
    if (!isValidEmail(email)) errs.email = "Enter a valid email address.";
    if (!isValidPhone(phone))
      errs.phone = "Enter a valid phone number with country code, e.g. +919012345678.";
    if (password.length < 6) errs.password = "Password needs at least 6 characters.";
    if (confirm !== password) errs.confirm = "Passwords don't match.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const create = () => {
    setFormError("");
    setConflict(false);
    if (!validate()) return;
    // Prototype simulation: an email already used for renting conflicts.
    if (email.trim().toLowerCase().includes("renter")) {
      setConflict(true);
      return;
    }
    setOwner({ name: name.trim(), email: email.trim(), phone: phone.trim() });
    router.push("/owner/dashboard");
  };

  const googleStart = () => {
    setFormError("");
    setConflict(false);
    // Simulated Google account chooser: prefill a name, still need phone.
    setGoogleName("Priya Sharma");
    setGoogleMode(true);
  };

  const googleFinish = () => {
    const errs: Record<string, string> = {};
    if (!isValidPhone(phone)) errs.phone = "We need your phone number to reach you about enquiries.";
    if (googleName.trim().length < 2) errs.name = "Please tell us your full name.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setOwner({
      name: googleName.trim(),
      email: "priya.sharma@gmail.com",
      phone: phone.trim(),
    });
    router.push("/owner/dashboard");
  };

  if (conflict) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-8">
        <OwnerBrand backHref="/list-your-property" />
        <div className="mt-8">
          <OwnerConflictNotice email={email.trim()} onSignOut={() => setConflict(false)} />
          <p className="mt-6 text-center text-[14px] text-[#5B6B7C]">
            Want an owner account instead?{" "}
            <button
              type="button"
              onClick={() => {
                setConflict(false);
                setEmail("");
              }}
              className="font-bold text-[#1677E8]"
            >
              Use a different email
            </button>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-8">
      <OwnerBrand backHref="/list-your-property" />

      {!googleMode ? (
        <>
          <h1 className="mt-8 text-[26px] font-bold tracking-tight">Create your owner account</h1>
          <p className="mt-1 text-[14.5px] text-[#5B6B7C]">
            List rooms, hear from tenants, manage everything in Owner Studio.
          </p>

          <div className="mt-7 space-y-4">
            <OwnerField id="owner-name" label="Full name" error={errors.name}>
              <OwnerInput
                id="owner-name"
                autoComplete="name"
                placeholder="e.g. Priya Sharma"
                value={name}
                error={errors.name}
                onChange={(v) => {
                  setName(v);
                  clear("name");
                }}
              />
            </OwnerField>
            <OwnerField id="owner-email" label="Email" error={errors.email}>
              <OwnerInput
                id="owner-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                error={errors.email}
                onChange={(v) => {
                  setEmail(v);
                  clear("email");
                }}
              />
            </OwnerField>
            <OwnerField
              id="owner-phone"
              label="Phone number"
              error={errors.phone}
              hint="With country code — tenants' enquiries reach you here."
            >
              <OwnerInput
                id="owner-phone"
                type="tel"
                autoComplete="tel"
                placeholder="+919012345678"
                value={phone}
                error={errors.phone}
                onChange={(v) => {
                  setPhone(v);
                  clear("phone");
                }}
              />
            </OwnerField>
            <OwnerField id="owner-password" label="Password" error={errors.password}>
              <OwnerInput
                id="owner-password"
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Minimum 6 characters"
                value={password}
                error={errors.password}
                onChange={(v) => {
                  setPassword(v);
                  clear("password");
                }}
                trailing={
                  <PasswordToggle
                    visible={showPw}
                    onToggle={() => setShowPw((s) => !s)}
                    label={showPw ? "Hide password" : "Show password"}
                  />
                }
              />
            </OwnerField>
            <OwnerField id="owner-confirm" label="Confirm password" error={errors.confirm}>
              <OwnerInput
                id="owner-confirm"
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Repeat your password"
                value={confirm}
                error={errors.confirm}
                onChange={(v) => {
                  setConfirm(v);
                  clear("confirm");
                }}
                trailing={
                  <PasswordToggle
                    visible={showConfirm}
                    onToggle={() => setShowConfirm((s) => !s)}
                    label={showConfirm ? "Hide password" : "Show password"}
                  />
                }
              />
            </OwnerField>
            {formError && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-[13.5px] font-medium text-red-700">
                {formError}
              </p>
            )}
          </div>

          <div className="mt-6 space-y-3">
            <button
              onClick={create}
              className="min-h-[52px] w-full rounded-2xl bg-[#1677E8] text-[16px] font-bold text-white transition active:scale-[0.98]"
            >
              Create owner account
            </button>
            <button
              onClick={googleStart}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-[#E3E8EF] bg-white text-[16px] font-semibold text-ink transition active:scale-[0.98]"
            >
              <Icon name="google" size={18} /> Continue with Google
            </button>
          </div>

          <div className="mt-auto space-y-3 pt-8 text-center text-[14px] text-[#5B6B7C]">
            <p>
              Already have an owner account?{" "}
              <Link href="/owner/login" className="font-bold text-[#1677E8]">
                Sign in
              </Link>
            </p>
            <p>
              Looking for a place instead?{" "}
              <Link href="/signup" className="font-bold text-[#1677E8]">
                Join as a renter
              </Link>
            </p>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setGoogleMode(false)}
            className="mt-8 inline-flex min-h-[44px] items-center gap-1 self-start text-[14px] font-bold text-[#1677E8]"
          >
            <Icon name="back" size={17} /> Back
          </button>
          <h1 className="mt-2 text-[26px] font-bold tracking-tight">One last step</h1>
          <p className="mt-1 text-[14.5px] text-[#5B6B7C]">
            Signed in with Google as <span className="font-semibold text-ink">priya.sharma@gmail.com</span>.
            Add your name and phone to finish your owner account.
          </p>

          <div className="mt-7 space-y-4">
            <OwnerField id="g-name" label="Full name" error={errors.name}>
              <OwnerInput
                id="g-name"
                autoComplete="name"
                placeholder="Your full name"
                value={googleName}
                error={errors.name}
                onChange={(v) => {
                  setGoogleName(v);
                  clear("name");
                }}
              />
            </OwnerField>
            <OwnerField
              id="g-phone"
              label="Phone number"
              error={errors.phone}
              hint="Required — this is how enquiry updates reach you."
            >
              <OwnerInput
                id="g-phone"
                type="tel"
                autoComplete="tel"
                placeholder="+919012345678"
                value={phone}
                error={errors.phone}
                onChange={(v) => {
                  setPhone(v);
                  clear("phone");
                }}
              />
            </OwnerField>
          </div>

          <div className="mt-6">
            <button
              onClick={googleFinish}
              className="min-h-[52px] w-full rounded-2xl bg-[#1677E8] text-[16px] font-bold text-white transition active:scale-[0.98]"
            >
              Finish creating owner account
            </button>
          </div>
        </>
      )}
    </main>
  );
}
