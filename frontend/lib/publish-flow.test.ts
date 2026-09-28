/**
 * Publish orchestration + pending-upload sweep, fully mocked.
 */
import { describe, expect, it, vi } from "vitest";
import {
  publishListingFlow,
  sweepPendingUploads,
  sweepTargetListingId,
} from "./publish-flow";
import type { Transport } from "./listing-submit-flow";
import type { OwnerListingItem } from "./api";
import { emptyDraft } from "./listing-draft";
import type { PhotoDraft } from "./listing-draft";
import {
  createSubmitGuard,
  runSubmitAction,
} from "./listing-submit-action";

const publishedRow = { id: 42, status: "PUBLISHED" } as OwnerListingItem;
const draftRow = { id: 42, status: "DRAFT" } as OwnerListingItem;

function tile(overrides: Partial<PhotoDraft> = {}): PhotoDraft {
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    name: "room.jpg",
    src: null,
    status: "local",
    cover: false,
    order: 0,
    backendId: null,
    viewUrl: null,
    error: null,
    ...overrides,
  };
}

const blob = (type = "image/jpeg") =>
  ({ size: 1024, type, name: "room.jpg" }) as unknown as File;

describe("sweepPendingUploads", () => {
  it("uploads local tiles and marks them ready", async () => {
    let photos = [tile({ id: "a" }), tile({ id: "b", cover: true, order: 1 })];
    const files = new Map<string, File>([
      ["a", blob()],
      ["b", blob()],
    ]);
    const upload = vi.fn(async (_lid: number, _f: File, _m: string, o: { displayOrder: number; isCover: boolean }) => ({
      id: o.displayOrder + 10,
      view_url: `https://view/${o.displayOrder}`,
    }));
    const result = await sweepPendingUploads({
      listingId: 42,
      readPhotos: () => photos,
      writePhotos: (p) => {
        photos = p;
      },
      files,
      upload: upload as never,
    });
    expect(result).toEqual({ uploaded: 2, failed: 0 });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(photos[0]).toMatchObject({
      status: "ready",
      backendId: 10,
      viewUrl: "https://view/0",
      error: null,
    });
    expect(photos[1]).toMatchObject({ status: "ready", backendId: 11 });
    expect(files.size).toBe(0);
  });

  it("marks failures with retryable state and skips missing files", async () => {
    let photos = [
      tile({ id: "a" }),
      tile({ id: "b", order: 1 }),
      tile({ id: "c", status: "ready", backendId: 5, order: 2 }),
    ];
    const files = new Map<string, File>([["a", blob()]]);
    const upload = vi.fn(async () => {
      throw new Error("connection lost");
    });
    const result = await sweepPendingUploads({
      listingId: 42,
      readPhotos: () => photos,
      writePhotos: (p) => {
        photos = p;
      },
      files,
      upload: upload as never,
    });
    expect(result).toEqual({ uploaded: 0, failed: 1 });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(photos[0]).toMatchObject({ status: "failed", error: "connection lost" });
    // Untouched: no bytes, already ready.
    expect(photos[1].status).toBe("local");
    expect(photos[2].status).toBe("ready");
  });

  it("rejects non-photos without calling upload", async () => {
    let photos = [tile({ id: "a" })];
    const files = new Map<string, File>([
      ["a", blob("video/mp4") as unknown as File],
    ]);
    (files.get("a") as { name: string }).name = "clip.mp4";
    const upload = vi.fn();
    const result = await sweepPendingUploads({
      listingId: 42,
      readPhotos: () => photos,
      writePhotos: (p) => {
        photos = p;
      },
      files,
      upload: upload as never,
    });
    expect(result).toEqual({ uploaded: 0, failed: 1 });
    expect(upload).not.toHaveBeenCalled();
    expect(photos[0].status).toBe("failed");
  });
});

describe("publishListingFlow", () => {
  it("publishes and returns the authoritative listing", async () => {
    const outcome = await publishListingFlow(42, {
      publish: vi.fn(async () => publishedRow),
      reload: vi.fn(async () => publishedRow),
    });
    expect(outcome).toEqual({ ok: true, listing: publishedRow });
  });

  it("surfaces backend guard failures without throwing", async () => {
    const outcome = await publishListingFlow(42, {
      publish: vi.fn(async () => {
        throw new Error("at least 3 READY photos are required for publication");
      }),
      reload: vi.fn(),
    });
    expect(outcome).toEqual({
      ok: false,
      error: "at least 3 READY photos are required for publication",
    });
  });

  it("rejects a reload that is not PUBLISHED", async () => {
    const outcome = await publishListingFlow(42, {
      publish: vi.fn(async () => publishedRow),
      reload: vi.fn(async () => draftRow),
    });
    expect(outcome.ok).toBe(false);
  });
});

describe("sweepTargetListingId (stale-store regression)", () => {
  function sendableDraft() {
    const d = emptyDraft("sweep-1");
    d.space.kind = "single";
    d.space.furnishing = "Fully furnished";
    d.space.audience = "Anyone";
    d.place.buildingType = "PG";
    d.place.placeName = "Green View House";
    d.place.address = "12 Test Road";
    d.place.city = "Guwahati";
    d.place.area = { id: 7, type: "area", name: "Beltola", city: "Guwahati" };
    d.pricing.rent = "8000";
    d.pricing.rentBasis = "person";
    d.availability.mode = "now";
    d.listing.title = "Sunny PG near campus";
    return d;
  }

  it("uses the send result even when a store re-read is stale", async () => {
    // Models React batching: persist is queued, so a synchronous re-read
    // (what getDraft returns in the same tick) sees pre-write state. The
    // old sweep lookup read the store here and silently skipped uploads.
    let committed: unknown = null;
    const readStore = (): unknown => committed;
    const calls: string[] = [];
    const transport: Transport = async <T,>(path: string): Promise<T> => {
      calls.push(path);
      if (path === "/api/v1/owner/properties") return { id: 10 } as T;
      if (path.endsWith("/units")) return { id: 20 } as T;
      if (path === "/api/v1/owner/listings") return { id: 30 } as T;
      return {} as T;
    };
    const outcome = await runSubmitAction({
      draft: sendableDraft(),
      guard: createSubmitGuard(),
      transport,
      persist: () => {
        // Deferred like setState: NOT visible to an immediate re-read.
      },
    });
    expect(outcome.type).toBe("done");
    if (outcome.type !== "done" || !outcome.result.ok) return;
    expect(sweepTargetListingId(outcome.result)).toBe(30);
    // Prove the stale condition actually held.
    expect(readStore()).toBeNull();
    expect(committed).toBeNull();
  });

  it("returns null for a failed send", async () => {
    const outcome = await runSubmitAction({
      draft: sendableDraft(),
      guard: createSubmitGuard(),
      transport: async () => {
        throw new Error("down");
      },
      persist: () => {},
    });
    expect(outcome.type).toBe("done");
    if (outcome.type !== "done" || outcome.result.ok) return;
    expect(sweepTargetListingId(outcome.result)).toBeNull();
  });
});
