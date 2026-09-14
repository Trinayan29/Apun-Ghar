"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  ApiError,
  getMe,
  getMyProfile,
  patchMyProfile,
  type LocationItem,
  type ProfilePatch,
} from "@/lib/api";
import {
  isOnboardingDone,
  markOnboardingDone,
} from "@/lib/onboarding-storage";
import { LocationSearchField } from "@/components/location-search";
import {
  Field,
  FormError,
  SubmitButton,
  TextField,
} from "@/components/auth-ui";

const BUDGET_CHIPS = [5000, 8000, 10000, 15000, 20000];

const STEPS = ["College", "Workplace", "Budget"] as const;

function formatINR(n: number): string {
  if (n >= 1000 && n % 1000 === 0) return `₹${n / 1000}k`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function BackButton({
  onBack,
  disabled,
}: {
  onBack: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      disabled={disabled}
      className="flex h-11 items-center text-[14px] font-bold text-brand-700 underline disabled:opacity-60"
    >
      ← Back
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  // Selections live in the parent so Back/Skip never lose them, and so
  // previously saved values can be shown again (resume).
  const [college, setCollege] = useState<LocationItem | null>(null);
  const [collegeCleared, setCollegeCleared] = useState(false);
  const [workplace, setWorkplace] = useState<LocationItem | null>(null);
  const [workplaceCleared, setWorkplaceCleared] = useState(false);

  // Budget state lives here (last step).
  const [chipMax, setChipMax] = useState<number | null>(null);
  const [minRaw, setMinRaw] = useState("");
  const [maxRaw, setMaxRaw] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [budgetError, setBudgetError] = useState("");

  const prefilled = useRef(false);

  // Routing safety: unauthenticated -> /login; already-done -> / (one way).
  // OWNER accounts never run renter onboarding -> /owner/dashboard.
  // `/` itself never auto-redirects, so this cannot loop.
  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.replace("/login");
      return;
    }
    if (isOnboardingDone(firebaseUser.uid)) {
      router.replace("/");
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
      } catch {
        // Non-OWNER roles and network hiccups keep the renter flow.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, firebaseUser, router]);

  // Resume: prefill once from the server profile. Read-only — no PATCH is
  // ever sent merely because data was prefetched.
  useEffect(() => {
    if (!ready || !firebaseUser || prefilled.current) return;
    prefilled.current = true;
    let cancelled = false;
    (async () => {
      try {
        const p = await getMyProfile();
        if (cancelled) return;
        setCollege(p.college_location);
        setWorkplace(p.workplace_location);
        const mn = p.budget_min;
        const mx = p.budget_max;
        if (mx !== null && mn === null && BUDGET_CHIPS.includes(mx)) {
          setChipMax(mx);
        } else {
          if (mn !== null) setMinRaw(String(mn));
          if (mx !== null) setMaxRaw(String(mx));
        }
        if (p.move_in_date) setMoveIn(p.move_in_date);
      } catch {
        // Start blank; the flow stays fully usable and per-step save
        // errors surface where they happen.
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      prefilled.current = false;
    };
  }, [ready, firebaseUser]);

  const finish = () => {
    // Mark BEFORE navigating, per product decision.
    if (firebaseUser) markOnboardingDone(firebaseUser.uid);
    router.replace("/?saved=1");
  };

  const goStep = (n: number) => {
    setError("");
    setStep(n);
  };

  const savePatch = async (patch: ProfilePatch, next: () => void) => {
    setError("");
    if (saving) return;
    setSaving(true);
    try {
      if (Object.keys(patch).length > 0) await patchMyProfile(patch);
      next();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save just now. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const saveCollege = () => {
    // Explicitly cleared -> send null; untouched/empty -> omit (unchanged).
    const patch: ProfilePatch = collegeCleared
      ? { college_location_id: null }
      : college
        ? { college_location_id: college.id }
        : {};
    savePatch(patch, () => goStep(1));
  };

  const saveWorkplace = () => {
    const patch: ProfilePatch = workplaceCleared
      ? { workplace_location_id: null }
      : workplace
        ? { workplace_location_id: workplace.id }
        : {};
    savePatch(patch, () => goStep(2));
  };

  const submitBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setBudgetError("");
    const parse = (v: string): number | null => {
      const t = v.trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : NaN;
    };
    let min = parse(minRaw);
    let max = parse(maxRaw);
    if (minRaw.trim() === "" && maxRaw.trim() === "" && chipMax !== null) {
      // Chip sets budget_max and leaves budget_min null (approved UX).
      min = null;
      max = chipMax;
    }
    if (Number.isNaN(min) || Number.isNaN(max)) {
      setBudgetError("Budgets must be zero or more, in rupees.");
      return;
    }
    if (min !== null && max !== null && min > max) {
      setBudgetError("Minimum budget can't be more than the maximum.");
      return;
    }
    const patch: ProfilePatch = {};
    if (min !== null || max !== null || chipMax !== null) {
      patch.budget_min = min;
      patch.budget_max = max;
    }
    if (moveIn.trim()) patch.move_in_date = moveIn.trim();
    else if (step === 2 && Object.keys(patch).length === 0) {
      finish(); // nothing entered -> treat as skip
      return;
    }
    await savePatch(patch, finish);
  };

  if (!ready || profileLoading) {
    return (
      <main className="mx-auto w-full max-w-sm px-6 py-10">
        <p className="text-[14px] text-muted" role="status">
          Loading…
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-6 pb-8 pt-10">
      <Link href="/" className="text-[18px] font-bold tracking-tight">
        Apun-Ghar
      </Link>

      <div className="mt-6 flex items-center gap-2" aria-label={`Step ${step + 1} of 3`}>
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand-600" : "bg-line"}`}
          />
        ))}
      </div>
      <p className="mt-2 text-[12.5px] font-semibold text-muted">
        Step {step + 1} of 3 · {STEPS[step]} · optional
      </p>

      <div className="mt-4">
        {step === 0 && (
          <div>
            <h1 className="text-[24px] font-bold tracking-tight">Where do you study?</h1>
            <p className="mt-1 text-[14px] text-muted">
              Helps us show places near your college. Optional — skip freely.
            </p>
            <div className="mt-4">
              <LocationSearchField
                kind="college"
                label="Search colleges"
                placeholder="e.g. Cotton University"
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
            </div>
            {error && <div className="mt-4"><FormError message={error} /></div>}
            <div className="mt-6 space-y-3">
              <button
                type="button"
                disabled={saving}
                onClick={saveCollege}
                className="h-12 w-full rounded-xl bg-brand-600 px-8 text-[15.5px] font-bold text-white transition enabled:active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
              >
                {saving ? "Saving…" : "Save & continue"}
              </button>
              <button
                type="button"
                onClick={() => goStep(1)}
                disabled={saving}
                className="h-12 w-full rounded-xl border border-line bg-white text-[15px] font-semibold disabled:opacity-60"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <BackButton onBack={() => goStep(0)} disabled={saving} />
            <h1 className="text-[24px] font-bold tracking-tight">Where do you work?</h1>
            <p className="mt-1 text-[14px] text-muted">
              For young professionals. Optional — students can skip this.
            </p>
            <div className="mt-4">
              <LocationSearchField
                kind="workplace"
                label="Search workplaces"
                placeholder="e.g. IT Park"
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
            </div>
            {error && <div className="mt-4"><FormError message={error} /></div>}
            <div className="mt-6 space-y-3">
              <button
                type="button"
                disabled={saving}
                onClick={saveWorkplace}
                className="h-12 w-full rounded-xl bg-brand-600 px-8 text-[15.5px] font-bold text-white transition enabled:active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
              >
                {saving ? "Saving…" : "Save & continue"}
              </button>
              <button
                type="button"
                onClick={() => goStep(2)}
                disabled={saving}
                className="h-12 w-full rounded-xl border border-line bg-white text-[15px] font-semibold disabled:opacity-60"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <BackButton onBack={() => goStep(1)} disabled={saving} />
            <h1 className="text-[24px] font-bold tracking-tight">Monthly budget</h1>
            <p className="mt-1 text-[14px] text-muted">
              Pick a max, or enter your own range. Everything is optional.
            </p>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Quick budget options">
              {BUDGET_CHIPS.map((amount) => {
                const active = chipMax === amount && maxRaw.trim() === "" && minRaw.trim() === "";
                return (
                  <button
                    key={amount}
                    type="button"
                    disabled={saving}
                    aria-pressed={active}
                    onClick={() => {
                      setChipMax(active ? null : amount);
                      setMinRaw("");
                      setMaxRaw("");
                      setBudgetError("");
                    }}
                    className={`h-10 rounded-full border px-4 text-[14px] font-bold transition active:scale-[0.97] disabled:opacity-60 ${
                      active
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-line bg-white"
                    }`}
                  >
                    {formatINR(amount)}
                  </button>
                );
              })}
            </div>
            <form onSubmit={submitBudget} noValidate className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field id="budget-min" label="Min (₹, optional)">
                  <TextField
                    id="budget-min"
                    type="number"
                    autoComplete="off"
                    placeholder="e.g. 5000"
                    value={minRaw}
                    disabled={saving}
                    onChange={(v) => {
                      setMinRaw(v);
                      if (v.trim()) setChipMax(null);
                      setBudgetError("");
                    }}
                  />
                </Field>
                <Field id="budget-max" label="Max (₹, optional)">
                  <TextField
                    id="budget-max"
                    type="number"
                    autoComplete="off"
                    placeholder="e.g. 10000"
                    value={maxRaw}
                    disabled={saving}
                    onChange={(v) => {
                      setMaxRaw(v);
                      if (v.trim()) setChipMax(null);
                      setBudgetError("");
                    }}
                  />
                </Field>
              </div>
              <Field id="move-in" label="Move-in date (optional)">
                <input
                  id="move-in"
                  type="date"
                  value={moveIn}
                  disabled={saving}
                  onChange={(e) => setMoveIn(e.target.value)}
                  className="h-12 w-full rounded-xl border border-line bg-white px-4 text-[15px] disabled:opacity-60"
                />
              </Field>
              {(budgetError || error) && <FormError message={budgetError || error} />}
              <SubmitButton loading={saving} label="Save & finish" loadingLabel="Saving…" />
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="h-12 w-full rounded-xl border border-line bg-white text-[15px] font-semibold disabled:opacity-60"
              >
                Skip for now
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
