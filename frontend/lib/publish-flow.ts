/**
 * Real publish orchestration + pending-upload sweep (page wiring calls
 * these; unit tests cover them without React).
 *
 * Backend stays authoritative everywhere: publish reads back the listing,
 * and only backend-confirmed READY photos count.
 */
import {
  getOwnerListing,
  publishOwnerListing,
  type OwnerListingItem,
  type OwnerPhotoItem,
} from "./api";
import {
  resolveMime,
  uploadPhoto,
  type AcceptedMime,
} from "./photo-upload";
import {
  normalizeBackendId,
  type BackendIds,
  type ListingDraft,
  type PhotoDraft,
  type SubmitProgress,
} from "./listing-draft";
import {
  runSubmitAction,
  submitErrorMessage,
  type SubmitBlocker,
  type SubmitGuard,
} from "./listing-submit-action";
import type { SubmitResult, Transport } from "./listing-submit-flow";

export interface SweepUpload {
  (
    listingId: number,
    file: File,
    mime: AcceptedMime,
    opts: { displayOrder: number; isCover: boolean }
  ): Promise<OwnerPhotoItem>;
}

/**
 * Upload every local/failed tile that still has its File bytes (same
 * session). Runs after a send creates the backend listing id. Per-tile
 * failures stay visible as failed tiles; tiles without bytes are skipped.
 */
export async function sweepPendingUploads(args: {
  listingId: number;
  readPhotos: () => PhotoDraft[];
  writePhotos: (photos: PhotoDraft[]) => void;
  files: Map<string, File>;
  upload?: SweepUpload;
}): Promise<{ uploaded: number; failed: number }> {
  const upload = args.upload ?? uploadPhoto;
  let uploaded = 0;
  let failed = 0;
  const pending = [...args.readPhotos()]
    .sort((a, b) => a.order - b.order)
    .filter(
      (p) =>
        (p.status === "local" || p.status === "failed") &&
        args.files.has(p.id)
    );
  for (const tile of pending) {
    const file = args.files.get(tile.id);
    if (!file) continue;
    args.writePhotos(
      args.readPhotos().map((p) =>
        p.id === tile.id ? { ...p, status: "uploading" as const, error: null } : p
      )
    );
    const mime = resolveMime(file);
    if (!mime) {
      failed += 1;
      args.writePhotos(
        args.readPhotos().map((p) =>
          p.id === tile.id
            ? {
                ...p,
                status: "failed" as const,
                error: "Those files aren't photos — try JPG, PNG or WebP images.",
              }
            : p
        )
      );
      continue;
    }
    try {
      const row = await upload(args.listingId, file, mime, {
        displayOrder: tile.order,
        isCover: tile.cover,
      });
      args.files.delete(tile.id);
      uploaded += 1;
      args.writePhotos(
        args.readPhotos().map((p) =>
          p.id === tile.id
            ? {
                ...p,
                status: "ready" as const,
                backendId: row.id,
                viewUrl: row.view_url ?? null,
                error: null,
              }
            : p
        )
      );
    } catch (err) {
      failed += 1;
      args.writePhotos(
        args.readPhotos().map((p) =>
          p.id === tile.id
            ? {
                ...p,
                status: "failed" as const,
                error:
                  err instanceof Error ? err.message : "Upload failed — retry.",
              }
            : p
        )
      );
    }
  }
  return { uploaded, failed };
}

export type PublishOutcome =
  | { ok: true; listing: OwnerListingItem }
  | { ok: false; error: string };

/**
 * Listing id for the post-send photo sweep, taken from the send result
 * itself — never from an immediate store re-read, which stays stale under
 * batched persistence (React setState) even after a successful persist.
 */
export function sweepTargetListingId(
  result: SubmitResult
): number | null {
  if (!result.ok) return null;
  return normalizeBackendId(result.ids.listingId);
}

/**
 * DRAFT/PAUSED -> PUBLISHED through the existing endpoint, then an
 * authoritative reload. Failure keeps DRAFT and returns the backend
 * message; nothing is ever optimistically marked published.
 */
export async function publishListingFlow(
  listingId: number,
  deps: {
    publish?: (id: number) => Promise<OwnerListingItem>;
    reload?: (id: number) => Promise<OwnerListingItem>;
  } = {}
): Promise<PublishOutcome> {
  const publish = deps.publish ?? publishOwnerListing;
  const reload = deps.reload ?? getOwnerListing;
  try {
    await publish(listingId);
    const fresh = await reload(listingId);
    if (fresh.status !== "PUBLISHED") {
      return { ok: false, error: "Publish didn't take — try again." };
    }
    return { ok: true, listing: fresh };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't publish — try again.",
    };
  }
}

export type SendThenPublishOutcome =
  | { ok: true; listing: OwnerListingItem }
  | { ok: false; stage: "send"; error: string; blocker: SubmitBlocker | null }
  | { ok: false; stage: "publish"; error: string };

/**
 * Step-14 publish the safe way: run the full authoritative send first
 * (validation, create/sync, price, availability — reusing runSubmitAction),
 * then an optional photo sweep, then POST /publish. Publish never runs on
 * unsynced backend state: an early-draft listing with local-only rent
 * would otherwise fail the RENT guard. Failures at any stage keep DRAFT
 * and surface the real error; the listing is only published after a
 * successful sync.
 */
export async function sendThenPublish(deps: {
  draft: ListingDraft;
  guard: SubmitGuard;
  transport?: Transport;
  persist: (ids: BackendIds, progress: SubmitProgress) => void;
  sweep?: (listingId: number) => Promise<unknown>;
  publish?: (id: number) => Promise<OwnerListingItem>;
  reload?: (id: number) => Promise<OwnerListingItem>;
}): Promise<SendThenPublishOutcome> {
  const sent = await runSubmitAction({
    draft: deps.draft,
    guard: deps.guard,
    transport: deps.transport,
    persist: deps.persist,
  });
  if (sent.type === "busy") {
    return {
      ok: false,
      stage: "send",
      error: "Already saving — try again in a moment.",
      blocker: null,
    };
  }
  if (sent.type === "invalid") {
    return {
      ok: false,
      stage: "send",
      error: sent.blocker.message,
      blocker: sent.blocker,
    };
  }
  if (!sent.result.ok) {
    return {
      ok: false,
      stage: "send",
      error: submitErrorMessage(sent.result),
      blocker: null,
    };
  }
  const listingId = sweepTargetListingId(sent.result);
  if (listingId == null) {
    return {
      ok: false,
      stage: "send",
      error: "Couldn't save the draft — try again.",
      blocker: null,
    };
  }
  if (deps.sweep) await deps.sweep(listingId);
  const published = await publishListingFlow(listingId, {
    publish: deps.publish,
    reload: deps.reload,
  });
  if (!published.ok) {
    return { ok: false, stage: "publish", error: published.error };
  }
  return { ok: true, listing: published.listing };
}
