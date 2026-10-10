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

export default function OwnerLogin() {
  const router = useRouter();
  const { setOwner } = useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const signIn = () => {
    setError("");
    setConflict(false);
    setForgotSent(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter the email you used for your owner account.");
      return;
    }
    if (password.length === 0) {
      setError("Enter your password.");
      return;
    }
    // Prototype simulation: this email belongs to a renter account.
    if (email.trim().toLowerCase().includes("renter")) {
      setConflict(true);
      return;
    }
    setOwner({ name: "Priya Sharma", email: email.trim(), phone: "+919012345678" });
    router.push("/owner/dashboard");
  };

  const google = () => {
    setError("");
    setConflict(false);
    setOwner({ name: "Priya Sharma", email: "priya.sharma@gmail.com", phone: "+919012345678" });
    router.push("/owner/dashboard");
  };

  if (conflict) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-8">
        <OwnerBrand backHref="/list-your-property" />
        <div className="mt-8">
          <OwnerConflictNotice email={email.trim()} onSignOut={() => setConflict(false)} />
          <p className="mt-6 text-center text-[14px] text-[#5B6B7C]">
            New to Apun-Ghar ownership?{" "}
            <Link href="/owner/signup" className="font-bold text-[#1677E8]">
              Create an owner account
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-8">
      <OwnerBrand backHref="/list-your-property" />

      <h1 className="mt-8 text-[26px] font-bold tracking-tight">Owner sign-in</h1>
      <p className="mt-1 text-[14.5px] text-[#5B6B7C]">Welcome back to your Owner Studio.</p>

      <div className="mt-7 space-y-4">
        <OwnerField id="login-email" label="Email">
          <OwnerInput
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={setEmail}
          />
        </OwnerField>
        <div>
          <OwnerField id="login-password" label="Password">
            <OwnerInput
              id="login-password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={setPassword}
              trailing={
                <PasswordToggle
                  visible={showPw}
                  onToggle={() => setShowPw((s) => !s)}
                  label={showPw ? "Hide password" : "Show password"}
                />
              }
            />
          </OwnerField>
          <div className="mt-2 text-right">
            {forgotSent ? (
              <p role="status" className="text-[13px] font-medium text-[#1677E8]">
                Reset link sent — check your inbox.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setForgotSent(true)}
                className="min-h-[44px] text-[13.5px] font-semibold text-[#1677E8]"
              >
                Forgot password?
              </button>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-[13.5px] font-medium text-red-700">
            {error}
          </p>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <button
          onClick={signIn}
          className="min-h-[52px] w-full rounded-2xl bg-[#1677E8] text-[16px] font-bold text-white transition active:scale-[0.98]"
        >
          Sign in to Owner Studio
        </button>
        <button
          onClick={google}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-[#E3E8EF] bg-white text-[16px] font-semibold text-ink transition active:scale-[0.98]"
        >
          <Icon name="google" size={18} /> Continue with Google
        </button>
      </div>

      <div className="mt-auto space-y-3 pt-8 text-center text-[14px] text-[#5B6B7C]">
        <p>
          New owner?{" "}
          <Link href="/owner/signup" className="font-bold text-[#1677E8]">
            Create an owner account
          </Link>
        </p>
        <p>
          Looking for a place instead?{" "}
          <Link href="/login" className="font-bold text-[#1677E8]">
            Renter sign-in
          </Link>
        </p>
        <p className="text-[12.5px]">
          Tip for this prototype: sign in with an email containing “renter” to preview the
          account-type conflict state.
        </p>
      </div>
    </main>
  );
}
