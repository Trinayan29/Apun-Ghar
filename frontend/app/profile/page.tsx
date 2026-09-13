"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { LocationSearchField } from "@/components/location-search";
import {
  ApiError,
  getMe,
  getMyProfile,
  patchMyProfile,
  type AppUser,
  type LocationItem,
  type UserProfile,
} from "@/lib/api";
import {
  Field,
  FormError,
  SubmitButton,
  TextField,
} from "@/components/auth-ui";

export default function ProfilePage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading, signOut } = useAuth();
  const [me, setMe] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [college, setCollege] = useState<LocationItem | null>(null);
  const [collegeCleared, setCollegeCleared] = useState(false);
  const [workplace, setWorkplace] = useState<LocationItem | null>(null);
  const [workplaceCleared, setWorkplaceCleared] = useState(false);
  const [minRaw, setMinRaw] = useState("");
  const [maxRaw, setMaxRaw] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [savedNote, setSavedNote] = useState("");

  // Routing safety: /profile requires auth but NEVER redirects for
  // incomplete onboarding — it stays directly accessible.
  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/login");
    }
  }, [authLoading, firebaseUser, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [u, p] = await Promise.all([getMe(), getMyProfile()]);
      setMe(u);
      setProfile(p);
      setCollege(p.college_location);
      setWorkplace(p.workplace_location);
      setMinRaw(p.budget_min !== null ? String(p.budget_min) : "");
      setMaxRaw(p.budget_max !== null ? String(p.budget_max) : "");
      setMoveIn(p.move_in_date ?? "");
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Couldn't load your profile."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && firebaseUser) void load();
  }, [authLoading, firebaseUser, load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSavedNote("");
    const parse = (v: string): number | null => {
      if (v.trim() === "") return null;
      const n = Number(v.trim());
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : NaN;
    };
    const min = parse(minRaw);
    const max = parse(maxRaw);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      setFormError("Budgets must be zero or more, in rupees.");
      return;
    }
    if (min !== null && max !== null && min > max) {
      setFormError("Minimum budget can't be more than the maximum.");
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const updated = await patchMyProfile({
        college_location_id: collegeCleared ? null : college?.id,
        workplace_location_id: workplaceCleared ? null : workplace?.id,
        budget_min: min,
        budget_max: max,
        move_in_date: moveIn.trim() ? moveIn.trim() : null,
      });
      setProfile(updated);
      setCollege(updated.college_location);
      setCollegeCleared(false);
      setWorkplace(updated.workplace_location);
      setWorkplaceCleared(false);
      setSavedNote("Preferences saved.");
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Couldn't save. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <main className="mx-auto w-full max-w-sm px-6 py-10">
        <p className="text-[14px] text-muted" role="status">Loading…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto w-full max-w-sm px-6 py-10">
        <FormError message={loadError} />
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 h-12 w-full rounded-xl border border-line bg-white text-[15px] font-semibold"
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-sm px-6 pb-10 pt-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-[18px] font-bold tracking-tight">
          Apun-Ghar
        </Link>
        <button
          type="button"
          onClick={() => {
            void signOut().then(() => router.replace("/login"));
          }}
          className="text-[13.5px] font-bold text-brand-700 underline"
        >
          Sign out
        </button>
      </div>

      <h1 className="mt-6 text-[24px] font-bold tracking-tight">Your profile</h1>
      <p className="mt-1 text-[14px] text-muted">
        {me?.email ?? firebaseUser?.email ?? "Signed in"}
        {me ? ` · ${me.role}` : ""}
      </p>

      <form onSubmit={save} noValidate className="mt-6 space-y-5">
        <LocationSearchField
          kind="college"
          label="College (optional)"
          placeholder="Search colleges"
          value={college}
          disabled={saving}
          onSelect={(loc) => {
            setCollege(loc);
            setCollegeCleared(false);
          }}
          onClear={() => {
            setCollege(null);
            setCollegeCleared(true);
          }}
        />
        <LocationSearchField
          kind="workplace"
          label="Workplace (optional)"
          placeholder="Search workplaces"
          value={workplace}
          disabled={saving}
          onSelect={(loc) => {
            setWorkplace(loc);
            setWorkplaceCleared(false);
          }}
          onClear={() => {
            setWorkplace(null);
            setWorkplaceCleared(true);
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field id="profile-min" label="Min budget (₹)">
            <TextField
              id="profile-min"
              type="number"
              autoComplete="off"
              placeholder="Optional"
              value={minRaw}
              disabled={saving}
              onChange={setMinRaw}
            />
          </Field>
          <Field id="profile-max" label="Max budget (₹)">
            <TextField
              id="profile-max"
              type="number"
              autoComplete="off"
              placeholder="Optional"
              value={maxRaw}
              disabled={saving}
              onChange={setMaxRaw}
            />
          </Field>
        </div>
        <Field id="profile-move-in" label="Move-in date (optional)">
          <input
            id="profile-move-in"
            type="date"
            value={moveIn}
            disabled={saving}
            onChange={(e) => setMoveIn(e.target.value)}
            className="h-12 w-full rounded-xl border border-line bg-white px-4 text-[15px] disabled:opacity-60"
          />
        </Field>
        {formError && <FormError message={formError} />}
        {savedNote && (
          <p role="status" className="rounded-xl bg-brand-50 px-3.5 py-3 text-[13.5px] font-medium text-brand-700">
            {savedNote}
          </p>
        )}
        <SubmitButton loading={saving} label="Save preferences" loadingLabel="Saving…" />
      </form>

      <Link
        href="/"
        className="mt-6 block h-12 w-full rounded-xl border border-line bg-white py-3 text-center text-[15px] font-semibold"
      >
        Back home
      </Link>
    </main>
  );
}
