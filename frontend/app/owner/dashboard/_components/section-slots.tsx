import { InboxIcon, OwnerEmptyState } from "@/components/owner-ui";

/**
 * Phase B shell survivors: only structure that is genuinely useful before
 * Phases C–G land. Headings-with-counts for unimplemented sections were
 * removed — a label without its content reads as unfinished, not as a
 * shell. Bodies (cards, rows, actions) arrive with their own phases.
 *
 * The Inbox stub stays as an intentional empty state (existing atom, no
 * fake messages, no route), because "no inbox yet" is a real product
 * fact worth stating once.
 */
export function InboxStub() {
  return (
    <OwnerEmptyState
      title="Inbox"
      body="Messages from renters will appear here."
      icon={<InboxIcon />}
    />
  );
}
