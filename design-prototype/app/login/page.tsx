"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/Icon";
import { PrimaryButton, SecondaryButton, TextInput } from "@/components/ui";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const signIn = () => {
    if (!email.includes("@") || password.length < 4) {
      setError("Enter a valid email and your password to continue.");
      return;
    }
    router.push("/home");
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-14">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white">
          <Icon name="home" size={22} />
        </span>
        <span className="text-[19px] font-bold tracking-tight">Apun-Ghar</span>
      </Link>

      <h1 className="mt-8 text-[26px] font-bold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-[14.5px] text-muted">Sign in to pick up where you left off.</p>

      <div className="mt-7 space-y-4">
        <TextInput label="Email" placeholder="you@college.edu" type="email" value={email} onChange={(v) => { setEmail(v); setError(""); }} />
        <div>
          <TextInput label="Password" placeholder="••••••••" type="password" value={password} onChange={(v) => { setPassword(v); setError(""); }} />
          <div className="mt-2 text-right">
            <button className="text-[13.5px] font-semibold text-brand-700">Forgot password?</button>
          </div>
        </div>
        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-[13.5px] font-medium text-red-700">{error}</p>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <PrimaryButton onClick={signIn}>Sign in</PrimaryButton>
        <SecondaryButton onClick={() => router.push("/home")}>
          <span className="inline-flex items-center gap-2">
            <Icon name="google" size={18} /> Continue with Google
          </span>
        </SecondaryButton>
      </div>

      <p className="mt-auto pt-8 text-center text-[14px] text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-bold text-brand-700">
          Create one
        </Link>
      </p>
    </main>
  );
}
