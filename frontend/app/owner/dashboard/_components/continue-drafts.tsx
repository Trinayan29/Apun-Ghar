import { OwnerSectionLabel } from "@/components/owner-ui";
import type { DeleteDraftOutcome } from "@/lib/draft-delete";
import type { StudioAttention, StudioDraft } from "@/lib/studio-data";
import { DraftCard } from "./draft-card";

/**
 * Continue / Drafts section (Phase D). A resume surface over
 * data.drafts — drafts already represented in Needs Attention are
 * excluded here so the same work never appears twice with competing
 * actions. Order: in-progress first, then most recently updated.
 * Absent when there is nothing resumable outside attention.
 */

function isVisible(draft: StudioDraft, attentionIds: Set<string>): boolean {
  return !attentionIds.has(draft.draftId);
}

function sortResumable(drafts: StudioDraft[]): StudioDraft[] {
  return [...drafts].sort((a, b) => {
    const aPending = a.kind === "pending" ? 0 : 1;
    const bPending = b.kind === "pending" ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return b.updatedAt - a.updatedAt;
  });
}

export function ContinueDrafts({
  drafts,
  attention,
  onDelete,
}: {
  drafts: StudioDraft[];
  attention: StudioAttention[];
  /** Delete wiring; when absent, cards render without the overflow menu. */
  onDelete?: (draft: StudioDraft) => Promise<DeleteDraftOutcome>;
}) {
  const attentionIds = new Set(
    attention.map((item) => item.draftId).filter((id): id is string => id !== null)
  );
  const resumable = sortResumable(drafts.filter((d) => isVisible(d, attentionIds)));
  if (resumable.length === 0) return null;
  return (
    <section aria-label="Continue where you left off">
      <OwnerSectionLabel>Continue where you left off</OwnerSectionLabel>
      <div className="mt-2.5 space-y-2.5">
        {resumable.map((draft) => (
          <DraftCard key={draft.draftId} draft={draft} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}
