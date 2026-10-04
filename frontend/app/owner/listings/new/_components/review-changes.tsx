"use client";

import { FormSection, WizardActions } from "@/components/ui/wizard";
import {
  countChanges,
  hasSignificantChanges,
  type ChangeField,
  type ChangeGroup,
} from "@/lib/listing-changes";

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
 */
export function ReviewChanges({
  groups,
  onBack,
}: {
  groups: ChangeGroup[];
  onBack: () => void;
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
      <WizardActions onContinue={onBack} continueLabel="Back to editing" />
    </div>
  );
}
