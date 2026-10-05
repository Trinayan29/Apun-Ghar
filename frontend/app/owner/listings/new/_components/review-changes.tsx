"use client";

import Link from "next/link";
import { useState } from "react";
import { FormError } from "@/components/auth-ui";
import { FormSection, WizardActions } from "@/components/ui/wizard";
import {
  countChanges,
  hasSignificantChanges,
  type ChangeField,
  type ChangeGroup,
} from "@/lib/listing-changes";
import {
  EDIT_SAVE_STEP_LABELS,
  type EditSaveFailure,
  type EditSaveStep,
} from "@/lib/listing-edit-save";

function ChangeRow({ field }: { field: ChangeField }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[14px] font-bold">{field.label}</p>
        {field.significant && (
          <span className="rounded-full bg-cream px-2.5 py-0.5 text-[11.5px] font-bold text-brand-700">
            Significant change
          </span>
        )}
      </div>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-paper px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            Before
          </p>
          <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed">
            {field.before}
          </p>
        </div>
        <div className="rounded-xl bg-brand-50 px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-700">
            After
          </p>
          <p className="mt-1 whitespace-pre-line text-[14px] font-bold leading-relaxed">
            {field.after}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * P2.2 Review Changes screen. Pure presentation over the P2.1 edit
 * session: renders the savedSnapshot-vs-draft diff and returns to
 * editing. No backend calls, no storage writes, no save pipeline —
 * Back to editing leaves the session exactly as it was.
 *
 * P2.3c adds an optional save entry point (see ReviewSaveRequest): the
 * review still never mutates anything itself — it reports the owner's
 * intent (save with explicit confirmation state) to the wizard, which
 * owns the orchestrator run.
 */
export interface ReviewSaveRequest {
  /** True when the diff carries rent/rental-type changes. */
  significant: boolean;
  /** Owner tapped Save; confirmed reflects the commercial checkbox. */
  onSave: (confirmed: boolean) => void;
}

function SaveActionRow({
  significant,
  onSave,
}: {
  significant: boolean;
  onSave: (confirmed: boolean) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const ready = !significant || confirmed;
  return (
    <div className="mt-6 rounded-2xl border border-line bg-white px-4 py-3.5">
      {significant && (
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-brand-600"
          />
          <span className="text-[13.5px] leading-relaxed">
            <span className="font-bold">
              I understand this changes the rent or rental type.
            </span>{" "}
            <span className="text-muted">
              Those affect what renters pay or what you&apos;re offering.
            </span>
          </span>
        </label>
      )}
      <button
        type="button"
        disabled={!ready}
        onClick={() => onSave(confirmed)}
        className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-brand-600 px-8 text-[16px] font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[240px]"
      >
        Save Changes
      </button>
      {significant && !confirmed && (
        <p className="mt-2 text-[12.5px] text-muted">
          Confirm above to enable saving.
        </p>
      )}
    </div>
  );
}

export function ReviewChanges({
  groups,
  onBack,
  save,
}: {
  groups: ChangeGroup[];
  onBack: () => void;
  save?: ReviewSaveRequest;
}) {
  const total = countChanges(groups);
  const significant = hasSignificantChanges(groups);

  if (total === 0) {
    return (
      <div>
        <FormSection
          id="review-changes"
          kicker="Review"
          title="No changes to review"
          lede="Your draft matches the saved version — there is nothing to compare yet."
        >
          <p className="rounded-2xl bg-cream px-4 py-3 text-[14.5px] font-bold">
            Make an edit first, then come back to review it.
          </p>
        </FormSection>
        <WizardActions onContinue={onBack} continueLabel="Back to editing" />
      </div>
    );
  }

  return (
    <div>
      <FormSection
        id="review-changes"
        kicker="Review"
        title="Review your changes"
        lede={`${
          total === 1 ? "1 change" : `${total} changes`
        } compared with the saved version. Nothing is sent anywhere from here.`}
      >
        {significant && (
          <div
            role="note"
            className="mb-4 rounded-2xl border border-line bg-cream px-4 py-3"
          >
            <p className="text-[14px] font-bold">
              This includes rent or rental-type changes.
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
              Those affect what renters pay or what you&apos;re offering, so
              look them over carefully. Saving arrives separately.
            </p>
          </div>
        )}
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.id} aria-label={group.title}>
              <div className="flex items-baseline gap-2">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-brand-700">
                  {group.title}
                </h3>
                <span className="text-[12px] font-semibold text-muted">
                  {group.changes.length === 1
                    ? "1 change"
                    : `${group.changes.length} changes`}
                </span>
              </div>
              <div className="mt-2.5 space-y-2.5">
                {group.changes.map((field: ChangeField) => (
                  <ChangeRow key={field.key} field={field} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </FormSection>
      {save && total > 0 && (
        <SaveActionRow significant={save.significant} onSave={save.onSave} />
      )}
      <WizardActions onContinue={onBack} continueLabel="Back to editing" />
    </div>
  );
}

/** Ordered logical save steps for the progress panel. */
const SAVE_PROGRESS_STEPS: EditSaveStep[] = [
  "property",
  "unit",
  "listing",
  "price",
  "availability",
];

/**
 * P2.3c save progress. Renders completed / in-flight / pending logical
 * steps. Rent-basis substeps stay hidden: pricing appears as one step.
 */
export function SaveProgressPanel({
  done,
  current,
}: {
  done: EditSaveStep[];
  current: EditSaveStep | null;
}) {
  return (
    <FormSection
      id="save-progress"
      kicker="Saving"
      title="Saving changes"
      lede="Sending your edits to Apun-Ghar, step by step. Please wait."
    >
      <ol className="space-y-2">
        {SAVE_PROGRESS_STEPS.map((step) => {
          const isDone = done.includes(step);
          const isCurrent = !isDone && current === step;
          return (
            <li
              key={step}
              className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3"
            >
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ${
                  isDone
                    ? "bg-[#2F7D4F] text-white"
                    : isCurrent
                      ? "bg-brand-600 text-white"
                      : "bg-paper text-muted"
                }`}
              >
                {isDone ? "✓" : isCurrent ? "→" : "○"}
              </span>
              <span className="text-[14.5px] font-bold">
                {EDIT_SAVE_STEP_LABELS[step]}
              </span>
              <span className="sr-only">
                {isDone ? "saved" : isCurrent ? "saving" : "pending"}
              </span>
            </li>
          );
        })}
      </ol>
    </FormSection>
  );
}

/**
 * P2.3c save failure. Names the failed step, lists what was already
 * saved vs never attempted, and offers retry-from-failed-step. Never
 * claims nothing was saved when earlier steps succeeded.
 */
export function SaveFailurePanel({
  failure,
  onRetry,
  onRetryReload,
  onBack,
}: {
  failure: EditSaveFailure;
  onRetry: () => void;
  onRetryReload: () => void;
  onBack: () => void;
}) {
  const retryable =
    failure.reason === "step-failed" ||
    failure.reason === "context-failed" ||
    failure.reason === "reload-failed";
  const title =
    failure.reason === "reload-failed"
      ? "Saved, but couldn't confirm"
      : "Couldn't save your changes";
  const labels = (steps: EditSaveStep[]) =>
    steps.map((s) => EDIT_SAVE_STEP_LABELS[s]).join(", ");
  return (
    <div>
      <FormSection id="save-failure" kicker="Saving" title={title}>
        <FormError message={failure.error} />
        {failure.appliedSteps.length > 0 && (
          <p className="mt-3 rounded-2xl bg-cream px-4 py-3 text-[14px] font-bold">
            Already saved: {labels(failure.appliedSteps)}.
          </p>
        )}
        {failure.pendingSteps.length > 0 && (
          <p className="mt-2 text-[13.5px] text-muted">
            Not attempted: {labels(failure.pendingSteps)}.
          </p>
        )}
      </FormSection>
      <div className="mt-6 flex flex-col gap-2 pb-4 sm:flex-row">
        {failure.needsReloadOnly ? (
          <button
            type="button"
            onClick={onRetryReload}
            className="flex min-h-[54px] items-center justify-center rounded-2xl bg-brand-600 px-8 text-[16px] font-bold text-white transition active:scale-[0.99] sm:min-w-[240px]"
          >
            Retry confirmation
          </button>
        ) : (
          retryable && (
            <button
              type="button"
              onClick={onRetry}
              className="flex min-h-[54px] items-center justify-center rounded-2xl bg-brand-600 px-8 text-[16px] font-bold text-white transition active:scale-[0.99] sm:min-w-[240px]"
            >
              {failure.failedStep
                ? `Retry from ${EDIT_SAVE_STEP_LABELS[failure.failedStep]}`
                : "Retry save"}
            </button>
          )
        )}
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-[52px] items-center justify-center rounded-2xl border border-line bg-white px-6 text-[15px] font-bold transition active:scale-[0.99]"
        >
          Back to editing
        </button>
      </div>
    </div>
  );
}

/**
 * P2.3c save success. Adopted success ends at the Studio; a
 * generation-mismatch success keeps the owner's newer edits and returns
 * to editing for another review.
 */
export function SaveSuccessPanel({
  stale,
  onBackEditing,
}: {
  stale: boolean;
  onBackEditing: () => void;
}) {
  return (
    <div>
      <FormSection
        id="save-success"
        kicker="Saving"
        title={stale ? "Saved — with newer edits kept" : "Changes saved"}
        lede={
          stale
            ? "The server save completed, but you kept editing while it ran — those newer edits were kept and still need reviewing."
            : "Your listing now matches your edits. Renters see the updated version."
        }
      >
        {stale && (
          <p className="rounded-2xl bg-cream px-4 py-3 text-[14.5px] font-bold">
            Review the remaining changes before saving again.
          </p>
        )}
      </FormSection>
      <div className="mt-6 flex flex-col gap-2 pb-4 sm:flex-row">
        {stale ? (
          <button
            type="button"
            onClick={onBackEditing}
            className="flex min-h-[54px] items-center justify-center rounded-2xl bg-brand-600 px-8 text-[16px] font-bold text-white transition active:scale-[0.99] sm:min-w-[240px]"
          >
            Back to editing
          </button>
        ) : (
          <Link
            href="/owner/dashboard"
            className="flex min-h-[54px] items-center justify-center rounded-2xl bg-brand-600 px-8 text-[16px] font-bold text-white transition active:scale-[0.99] sm:min-w-[240px]"
          >
            Back to Studio
          </Link>
        )}
      </div>
    </div>
  );
}
