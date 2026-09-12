"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/store/AppStore";
import Icon from "@/components/Icon";
import { PrimaryButton, SecondaryButton, TextInput } from "@/components/ui";

export default function Signup() {
  const router = useRouter();
  const { setUserName } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const create = () => {
    if (name.trim().length < 2) return setError("Please tell us your name.");
    if (!email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Password needs at least 6 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setUserName(name.trim().split(" ")[0]);
    router.push("/onboarding");
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-8 pt-14">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white">
          <Icon name="home" size={22} />
        </span>
        <span className="text-[19px] font-bold tracking-tight">Apun-Ghar</span>
      </Link>

      <h1 className="mt-8 text-[26px] font-bold tracking-tight">Create your account</h1>
      <p className="mt-1 text-[14.5px] text-muted">Takes less than a minute. No spam, ever.</p>

      <div className="mt-7 space-y-4">
        <TextInput label="Name" placeholder="Your full name" value={name} onChange={setName} />
        <TextInput label="Email" placeholder="you@college.edu" type="email" value={email} onChange={setEmail} />
        <TextInput label="Password" placeholder="Minimum 6 characters" type="password" value={password} onChange={setPassword} />
        <TextInput label="Confirm password" placeholder="Repeat your password" type="password" value={confirm} onChange={setConfirm} />
        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-[13.5px] font-medium text-red-700">{error}</p>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <PrimaryButton onClick={create}>Create account</PrimaryButton>
        <SecondaryButton onClick={() => router.push("/onboarding")}>
          <span className="inline-flex items-center gap-2">
            <Icon name="google" size={18} /> Continue with Google
          </span>
        </SecondaryButton>
      </div>

      <p className="mt-auto pt-8 text-center text-[14px] text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-brand-700">
          Sign in
        </Link>
      </p>
    </main>
  );
}
