/**
 * P2.3c orchestrator tests: sequencing, fail-stop, retry-from-failed,
 * rent-basis branch, reload/generation safety. Transport is fully faked;
 * every assertion checks actual call order and arguments.
 */
import { describe, expect, it, vi } from "vitest";
import {
  EDIT_SAVE_STEP_LABELS,
  confirmEditSaveReload,
  runEditSave,
  type EditSaveIds,
  type EditSaveProgressEvent,
  type EditSaveStep,
} from "./listing-edit-save";
import type { SaveContext } from "./listing-save";
import { emptyDraft, type ListingDraft } from "./listing-draft";
import type { Transport } from "./listing-submit-flow";

const IDS: EditSaveIds = { propertyId: 1, unitId: 10, listingId: 100 };
const CTX: SaveContext = { listingStatus: "PUBLISHED", rentBasis: "PER_PERSON" };

function validDraft(): ListingDraft {
  const d = emptyDraft("save-orch-fixture");
  d.propertySource = "existing";
  d.backendIds = { propertyId: 1, unitId: 10, listingId: 100 };
  d.place.buildingType = "PG";
  d.place.placeName = "Green View House";
  d.place.address = "12 Test Road";
  d.place.areaCustomName = "Jyotikuchi";
  d.place.city = "Guwahati";
  d.space.kind = "single";
  d.space.furnishing = "Fully furnished";
  d.space.audience = "Anyone";
  d.space.policies.couples = true;
  d.pricing.rent = "9000";
  d.pricing.rentBasis = "person";
  d.availability = { mode: "now", date: "" };
  d.listing.title = "Sunny PG near campus";
  return d;
}

function clone(d: ListingDraft): ListingDraft {
  return JSON.parse(JSON.stringify(d)) as ListingDraft;
}

function apiError(status: number, message: string): Error {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

function makeTransport(failures: Record<string, Error> = {}) {
  const calls: RecordedCall[] = [];
  const transport = (async <T>(
    path: string,
    body: unknown,
    method: "POST" | "PUT" | "GET" | "PATCH"
  ): Promise<T> => {
    calls.push({ method, path, body });
    const key = `${method} ${path}`;
    if (key in failures) throw failures[key];
    return {} as T;
  }) as Transport;
  return { calls, transport };
}

function paths(calls: RecordedCall[]): string[] {
  return calls.map((c) => `${c.method} ${c.path}`);
}

function ctxStub(context: SaveContext = CTX) {
  const fetchContext = vi.fn(async (_id: number) => ({ ...context }));
  return fetchContext;
}

function reloadStub(fresh?: ListingDraft) {
  const reloadDraft = vi.fn(async (_id: number) =>
    fresh ? clone(fresh) : validDraft()
  );
  return reloadDraft;
}

describe("runEditSave success path", () => {
  it("1. all steps succeed in order and adopt the reload", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.place.placeName = "Blue View House";
    draft.space.furnishing = "Unfurnished";
    draft.listing.title = "Renamed place";
    draft.pricing.rent = "10000";
    draft.availability = { mode: "from", date: "2099-01-15" };
    const { calls, transport } = makeTransport();
    const fetchContext = ctxStub();
    const reloaded = clone(draft);
    reloaded.listing.title = "Renamed place";
    const reloadDraft = reloadStub(reloaded);

    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 7,
      significant: false,
      confirmed: true,
      transport,
      fetchContext,
      reloadDraft,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(paths(calls)).toEqual([
      "PATCH /api/v1/owner/properties/1",
      "PATCH /api/v1/owner/units/10",
      "PATCH /api/v1/owner/listings/100",
      "PUT /api/v1/owner/listings/100/price-components",
      "POST /api/v1/owner/listings/100/availability",
    ]);
    expect(calls[0].body).toEqual({ name: "Blue View House" });
    expect(calls[2].body).toEqual({ title: "Renamed place" });
    expect(outcome.appliedSteps).toEqual([
      "property",
      "unit",
      "listing",
      "price",
      "availability",
    ]);
    expect(outcome.adopted).toBe(true);
    expect(outcome.freshDraft.listing.title).toBe("Renamed place");
    expect(fetchContext).toHaveBeenCalledWith(100);
  });

  it("20. clean session performs zero calls", async () => {
    const snapshot = validDraft();
    const { calls, transport } = makeTransport();
    const outcome = await runEditSave({
      draft: clone(snapshot),
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(calls).toEqual([]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.appliedSteps).toEqual([]);
  });
});

describe("runEditSave per-step failures", () => {
  function dirtyPair() {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.place.placeName = "Blue View House";
    draft.space.furnishing = "Unfurnished";
    draft.listing.title = "Renamed place";
    return { snapshot, draft };
  }

  it("2. property failure stops everything", async () => {
    const { snapshot, draft } = dirtyPair();
    const { calls, transport } = makeTransport({
      "PATCH /api/v1/owner/properties/1": apiError(422, "bad address"),
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("step-failed");
    expect(outcome.failedStep).toBe("property");
    expect(outcome.appliedSteps).toEqual([]);
    expect(outcome.pendingSteps).toEqual(["unit", "listing"]);
    expect(outcome.status).toBe(422);
    expect(outcome.error).toContain("Property");
    expect(calls).toHaveLength(1);
  });

  it("3. unit failure keeps property applied", async () => {
    const { snapshot, draft } = dirtyPair();
    const { calls, transport } = makeTransport({
      "PATCH /api/v1/owner/units/10": apiError(500, "boom"),
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failedStep).toBe("unit");
    expect(outcome.appliedSteps).toEqual(["property"]);
    expect(outcome.status).toBe(500);
    expect(calls.map((c) => c.path)).not.toContain(
      "/api/v1/owner/listings/100"
    );
  });

  it("4. listing failure reports applied property+unit", async () => {
    const { snapshot, draft } = dirtyPair();
    const { calls, transport } = makeTransport({
      "PATCH /api/v1/owner/listings/100": apiError(422, "title cannot be blank"),
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failedStep).toBe("listing");
    expect(outcome.appliedSteps).toEqual(["property", "unit"]);
    expect(outcome.error).toContain("Listing");
  });

  it("5. pricing failure names pricing and keeps earlier steps", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.pricing.rent = "10000";
    const { transport } = makeTransport({
      "PUT /api/v1/owner/listings/100/price-components": apiError(
        409,
        "duplicate price component identity"
      ),
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: true,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failedStep).toBe("price");
    expect(outcome.status).toBe(409);
    expect(outcome.error).toContain("Pricing");
  });

  it("6. availability failure is terminal with everything applied", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.availability = { mode: "from", date: "2099-06-01" };
    const { calls, transport } = makeTransport({
      "POST /api/v1/owner/listings/100/availability": apiError(
        422,
        "available_from cannot be in the past"
      ),
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failedStep).toBe("availability");
    expect(outcome.pendingSteps).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("7. property+unit succeed then listing fails; later steps untouched", async () => {
    const { snapshot, draft } = dirtyPair();
    const { calls, transport } = makeTransport({
      "PATCH /api/v1/owner/listings/100": apiError(422, "nope"),
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(paths(calls)).toEqual([
      "PATCH /api/v1/owner/properties/1",
      "PATCH /api/v1/owner/units/10",
      "PATCH /api/v1/owner/listings/100",
    ]);
    expect(outcome.appliedSteps).toEqual(["property", "unit"]);
    expect(outcome.pendingSteps).toEqual([]);
  });
});

describe("rent-basis branch", () => {
  function basisPair() {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.pricing.rentBasis = "room";
    return { snapshot, draft };
  }

  it("8. runs PUT([]) then PATCH basis then PUT(full) in exact order", async () => {
    const { snapshot, draft } = basisPair();
    const { calls, transport } = makeTransport();
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(true);
    expect(paths(calls)).toEqual([
      "PUT /api/v1/owner/listings/100/price-components",
      "PATCH /api/v1/owner/listings/100",
      "PUT /api/v1/owner/listings/100/price-components",
    ]);
    expect(calls[0].body).toEqual([]);
    expect(calls[1].body).toEqual({ rent_basis: "PER_ROOM" });
    const full = calls[2].body as { calculation_basis: string }[];
    expect(full.length).toBeGreaterThan(0);
    expect(
      full.every((r) => r.calculation_basis === "PER_ROOM")
    ).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.appliedSteps).toEqual(["listing", "price"]);
  });

  it("9. failure during PUT([]) reports price-clear with nothing applied", async () => {
    const { snapshot, draft } = basisPair();
    const { calls, transport } = makeTransport({
      "PUT /api/v1/owner/listings/100/price-components": apiError(
        500,
        "down"
      ),
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failedStep).toBe("price");
    expect(outcome.failedDetail).toBe("price-clear");
    expect(outcome.appliedSteps).toEqual([]);
    // The clear itself failed: nothing was reset, so the flag stays off
    // and ordinary pending semantics apply (failed step excluded).
    expect(outcome.pricingCleared).toBeUndefined();
    expect(outcome.pendingSteps).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("10. failure during the basis PATCH keeps the clear off applied", async () => {
    const { snapshot, draft } = basisPair();
    const { calls, transport } = makeTransport({
      "PATCH /api/v1/owner/listings/100": apiError(422, "basis mismatch"),
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(paths(calls)).toEqual([
      "PUT /api/v1/owner/listings/100/price-components",
      "PATCH /api/v1/owner/listings/100",
    ]);
    expect(outcome.failedStep).toBe("listing");
    expect(outcome.appliedSteps).toEqual([]);
  });

  it("11. failure during final PUT reports price-full after listing applied", async () => {
    const { snapshot, draft } = basisPair();
    let puts = 0;
    const calls: { method: string; path: string; body: unknown }[] = [];
    const transport = (async <T>(
      path: string,
      body: unknown,
      method: "POST" | "PUT" | "GET" | "PATCH"
    ): Promise<T> => {
      calls.push({ method, path, body });
      if (method === "PUT") {
        puts += 1;
        if (puts === 2) throw apiError(500, "full failed");
      }
      return {} as T;
    }) as Transport;
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failedStep).toBe("price");
    expect(outcome.failedDetail).toBe("price-full");
    expect(outcome.appliedSteps).toEqual(["listing"]);
  });

  it("12. retry after clear failure replays the trio safely", async () => {
    const { snapshot, draft } = basisPair();
    const attempt1 = makeTransport({
      "PUT /api/v1/owner/listings/100/price-components": apiError(500, "down"),
    });
    const first = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport: attempt1.transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.failedStep).toBe("price");

    const attempt2 = makeTransport();
    const second = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      fromStep: first.failedStep,
      fromDetail: first.failedDetail,
      transport: attempt2.transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(second.ok).toBe(true);
    expect(paths(attempt2.calls)).toEqual([
      "PUT /api/v1/owner/listings/100/price-components",
      "PATCH /api/v1/owner/listings/100",
      "PUT /api/v1/owner/listings/100/price-components",
    ]);
  });

  it("12b. retry from listing skips the already-cleared pricing", async () => {
    const { snapshot, draft } = basisPair();
    const attempt1 = makeTransport({
      "PATCH /api/v1/owner/listings/100": apiError(422, "basis mismatch"),
    });
    const first = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport: attempt1.transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.failedStep).toBe("listing");

    const attempt2 = makeTransport();
    const second = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      fromStep: first.failedStep,
      fromDetail: first.failedDetail,
      transport: attempt2.transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(second.ok).toBe(true);
    // Clear already applied: PATCH then full PUT only.
    expect(paths(attempt2.calls)).toEqual([
      "PATCH /api/v1/owner/listings/100",
      "PUT /api/v1/owner/listings/100/price-components",
    ]);
  });

  it("13. retry after full-PUT failure converges to a single PUT", async () => {
    const { snapshot, draft } = basisPair();
    let puts = 0;
    const firstCalls: { method: string; path: string; body: unknown }[] = [];
    const firstTransport = (async <T>(
      path: string,
      body: unknown,
      method: "POST" | "PUT" | "GET" | "PATCH"
    ): Promise<T> => {
      firstCalls.push({ method, path, body });
      if (method === "PUT") {
        puts += 1;
        if (puts === 2) throw apiError(500, "full failed");
      }
      return {} as T;
    }) as Transport;
    const first = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport: firstTransport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;

    // Server basis already moved: the branch dissolves into a plain PUT.
    const attempt2 = makeTransport();
    const second = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      fromStep: first.failedStep,
      fromDetail: first.failedDetail,
      transport: attempt2.transport,
      fetchContext: ctxStub({
        listingStatus: "PUBLISHED",
        rentBasis: "PER_ROOM",
      }),
      reloadDraft: reloadStub(),
    });
    expect(second.ok).toBe(true);
    expect(paths(attempt2.calls)).toEqual([
      "PUT /api/v1/owner/listings/100/price-components",
    ]);
    const rows = attempt2.calls[0].body as { calculation_basis: string }[];
    expect(rows.every((r) => r.calculation_basis === "PER_ROOM")).toBe(true);
  });
});

describe("retry recomputation", () => {  it("14. retry uses the current draft, never stale bodies", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.listing.title = "First attempt";
    const attempt1 = makeTransport({
      "PATCH /api/v1/owner/listings/100": apiError(500, "down"),
    });
    const first = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport: attempt1.transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;

    draft.listing.title = "Second attempt";
    const attempt2 = makeTransport();
    const second = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      fromStep: first.failedStep,
      transport: attempt2.transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(second.ok).toBe(true);
    expect(attempt2.calls[0].body).toEqual({ title: "Second attempt" });
  });

  it("15. consecutive attempts never share cached plans", async () => {
    const snapshot = validDraft();
    const fetchContext = ctxStub();
    const firstDraft = clone(snapshot);
    firstDraft.listing.title = "One";
    const t1 = makeTransport();
    await runEditSave({
      draft: firstDraft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport: t1.transport,
      fetchContext,
      reloadDraft: reloadStub(),
    });
    const secondDraft = clone(snapshot);
    secondDraft.pricing.rent = "12000";
    const t2 = makeTransport();
    await runEditSave({
      draft: secondDraft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: true,
      confirmed: true,
      transport: t2.transport,
      fetchContext,
      reloadDraft: reloadStub(),
    });
    expect(t1.calls[0].body).toEqual({ title: "One" });
    expect(paths(t2.calls)).toEqual([
      "PUT /api/v1/owner/listings/100/price-components",
    ]);
    expect(fetchContext).toHaveBeenCalledTimes(2);
  });
});

describe("reload and generation safety", () => {
  it("16. reload failure keeps mutations but never adopts", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.listing.title = "Renamed place";
    const { calls, transport } = makeTransport();
    const reloadDraft = vi.fn(async (_id: number): Promise<ListingDraft> => {
      throw new Error("gone");
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("reload-failed");
    expect(outcome.needsReloadOnly).toBe(true);
    expect(outcome.appliedSteps).toEqual(["listing"]);
    expect(outcome.pendingSteps).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("17. reload-only retry confirms without mutating", async () => {
    const { calls, transport } = makeTransport();
    const fresh = validDraft();
    fresh.listing.title = "Renamed place";
    const reloadDraft = reloadStub(fresh);
    const outcome = await confirmEditSaveReload({
      listingId: 100,
      generation: 3,
      transport,
      reloadDraft,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.adopted).toBe(true);
    expect(outcome.freshDraft.listing.title).toBe("Renamed place");
    expect(calls).toEqual([]);

    const failing = await confirmEditSaveReload({
      listingId: 100,
      generation: 3,
      reloadDraft: vi.fn(async () => {
        throw new Error("still gone");
      }),
    });
    expect(failing.ok).toBe(false);
  });

  it("18. generation mismatch prevents adoption", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.listing.title = "Renamed place";
    const { transport } = makeTransport();
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 100,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
      isCurrent: () => false,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.adopted).toBe(false);
    expect(outcome.staleLocalEdits).toBe(true);
  });

  it("19. user edit during save survives via the same guard", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.listing.title = "Saved title";
    let current = true;
    const { transport } = makeTransport();
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 100,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
      // The owner types mid-flight: the wizard flips this to false.
      isCurrent: () => current,
      onProgress: (event: EditSaveProgressEvent) => {
        if (event.type === "step-done") current = false;
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.adopted).toBe(false);
    expect(outcome.staleLocalEdits).toBe(true);
    // The authoritative draft is still returned for inspection.
    expect(outcome.freshDraft).toBeDefined();
  });
});

describe("gates: validation, issues, confirmation, guard", () => {
  it("21. plan issues cause zero mutations", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.pricing.rent = "10.5";
    const { calls, transport } = makeTransport();
    const fetchContext = ctxStub();
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: true,
      confirmed: true,
      transport,
      fetchContext,
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("plan-issues");
    expect(calls).toEqual([]);
  });

  it("blocks invalid drafts before any network", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.listing.title = "";
    const { calls, transport } = makeTransport();
    const fetchContext = ctxStub();
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext,
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("invalid");
    expect(calls).toEqual([]);
    expect(fetchContext).not.toHaveBeenCalled();
  });

  it("22. significant change without confirmation sends nothing mutating", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.pricing.rent = "10000";
    const { calls, transport } = makeTransport();
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: true,
      confirmed: false,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("confirm-required");
    expect(
      calls.filter((c) => c.method !== "GET")
    ).toEqual([]);
  });

  it("23. cancellation performs zero mutations", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.space.kind = "shared";
    draft.space.beds = 2;
    const { calls, transport } = makeTransport();
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: true,
      confirmed: false,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("24. double-save is prevented by the guard", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.listing.title = "Renamed place";
    const { calls, transport } = makeTransport();
    let active = true;
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
      guard: {
        get active() {
          return active;
        },
        tryStart: () => false,
        finish: () => {
          active = false;
        },
      },
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("busy");
    expect(calls).toEqual([]);
  });
});

describe("failure classification", () => {
  it("25. 404 fails closed with a safe next step", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.place.placeName = "Blue View House";
    const { transport } = makeTransport({
      "PATCH /api/v1/owner/properties/1": apiError(404, "Property not found"),
    });
    const reloadDraft = reloadStub();
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failedStep).toBe("property");
    expect(outcome.status).toBe(404);
    expect(outcome.error).toContain("Studio");
    expect(reloadDraft).not.toHaveBeenCalled();
  });

  it("26. 422 carries the step and the backend detail", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.space.furnishing = "Unfurnished";
    const { transport } = makeTransport({
      "PATCH /api/v1/owner/units/10": apiError(
        422,
        "whole-home units use layout instead"
      ),
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failedStep).toBe("unit");
    expect(outcome.status).toBe(422);
    expect(outcome.error).toContain("Space");
    expect(outcome.error).toContain("whole-home units use layout instead");
  });

  it("27. applied steps remain available after failure", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.place.placeName = "Blue View House";
    draft.listing.title = "Renamed place";
    const { transport } = makeTransport({
      "PATCH /api/v1/owner/listings/100": apiError(500, "down"),
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.appliedSteps).toEqual(["property"]);
    expect(outcome.failedStep).toBe("listing");
  });

  it("28. pending steps are never executed after failure", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.place.placeName = "Blue View House";
    draft.pricing.rent = "10000";
    draft.availability = { mode: "from", date: "2099-02-02" };
    const { calls, transport } = makeTransport({
      "PATCH /api/v1/owner/properties/1": apiError(500, "down"),
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: true,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(paths(calls)).toEqual(["PATCH /api/v1/owner/properties/1"]);
    expect(outcome.pendingSteps).toEqual(["price", "availability"]);
  });

  it("emits plan/step progress events in order", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.listing.title = "Renamed place";
    const { transport } = makeTransport();
    const events: EditSaveProgressEvent[] = [];
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
      onProgress: (e) => events.push(e),
    });
    expect(outcome.ok).toBe(true);
    expect(events).toEqual([
      { type: "plan", steps: ["listing"] },
      { type: "step-start", step: "listing" },
      { type: "step-done", step: "listing" },
    ]);
    const labels = Object.values(EDIT_SAVE_STEP_LABELS);
    expect(labels).toContain("Listing");
    expect(labels).toContain("Pricing");
  });
});

describe("step type vocabulary", () => {
  it("reuses SubmitStep without duplicates", () => {
    const steps: EditSaveStep[] = [
      "property",
      "unit",
      "listing",
      "price",
      "availability",
    ];
    expect([...steps].sort()).toEqual(
      ["availability", "listing", "price", "property", "unit"].sort()
    );
  });
});

describe("resume cursor safety (Finding 1)", () => {
  it("R1. retry re-executes a newly edited earlier step instead of skipping it", async () => {
    // Attempt 1: property + unit succeed, listing fails.
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.place.placeName = "Blue View House";
    draft.space.furnishing = "Unfurnished";
    draft.listing.title = "First title";
    const attempt1 = makeTransport({
      "PATCH /api/v1/owner/listings/100": apiError(500, "down"),
    });
    const first = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport: attempt1.transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.failedStep).toBe("listing");
    expect(first.appliedSteps).toEqual(["property", "unit"]);

    // The owner edits the property name before retrying: the fresh plan
    // now needs PROPERTY again. The old code skipped it (cursor at
    // listing) and the edit was silently lost on adopt.
    draft.place.placeName = "Teal View House";
    const attempt2 = makeTransport();
    const second = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      fromStep: first.failedStep,
      fromDetail: first.failedDetail,
      transport: attempt2.transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(second.ok).toBe(true);
    expect(paths(attempt2.calls)).toEqual([
      "PATCH /api/v1/owner/properties/1",
      "PATCH /api/v1/owner/units/10",
      "PATCH /api/v1/owner/listings/100",
    ]);
    // The fresh property name — not the stale first-attempt body — is sent.
    expect(attempt2.calls[0].body).toEqual({ name: "Teal View House" });
  });

  it("R1b. retry still skips earlier steps the fresh plan does not need", async () => {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.listing.title = "First title";
    const attempt1 = makeTransport({
      "PATCH /api/v1/owner/listings/100": apiError(500, "down"),
    });
    const first = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport: attempt1.transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;

    // No new earlier edits: the retry begins at listing, nothing replays.
    const attempt2 = makeTransport();
    const second = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      fromStep: first.failedStep,
      fromDetail: first.failedDetail,
      transport: attempt2.transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(second.ok).toBe(true);
    expect(paths(attempt2.calls)).toEqual([
      "PATCH /api/v1/owner/listings/100",
    ]);
  });
});

describe("pricing partial state (Finding 2)", () => {
  function basisPair() {
    const snapshot = validDraft();
    const draft = clone(snapshot);
    draft.pricing.rentBasis = "room";
    return { snapshot, draft };
  }

  it("R2. clear-then-PATCH-failure records the reset pricing honestly", async () => {
    const { snapshot, draft } = basisPair();
    const { calls, transport } = makeTransport({
      "PATCH /api/v1/owner/listings/100": apiError(422, "basis mismatch"),
    });
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // The listing PATCH is the failure…
    expect(outcome.failedStep).toBe("listing");
    expect(outcome.failedDetail).toBeUndefined();
    // …but pricing is NOT untouched and NOT successful — and NOT ordinary
    // "not attempted" either: it was partially reset on the server.
    expect(outcome.pricingCleared).toBe(true);
    expect(outcome.appliedSteps).not.toContain("price");
    expect(outcome.pendingSteps).not.toContain("price");
    expect(outcome.error).toMatch(/reset.*restor/i);
    expect(paths(calls)).toEqual([
      "PUT /api/v1/owner/listings/100/price-components",
      "PATCH /api/v1/owner/listings/100",
    ]);
  });

  it("R2b. retry after the recorded clear restores pricing and succeeds", async () => {
    const { snapshot, draft } = basisPair();
    const attempt1 = makeTransport({
      "PATCH /api/v1/owner/listings/100": apiError(422, "basis mismatch"),
    });
    const first = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport: attempt1.transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.pricingCleared).toBe(true);

    const attempt2 = makeTransport();
    const second = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      fromStep: first.failedStep,
      fromDetail: first.failedDetail,
      transport: attempt2.transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // Clear already applied: PATCH then full PUT only.
    expect(paths(attempt2.calls)).toEqual([
      "PATCH /api/v1/owner/listings/100",
      "PUT /api/v1/owner/listings/100/price-components",
    ]);
    expect(second.appliedSteps).toEqual(["listing", "price"]);
  });

  it("R2c. full-PUT failure also records the unrestored pricing", async () => {
    const { snapshot, draft } = basisPair();
    let puts = 0;
    const calls: { method: string; path: string; body: unknown }[] = [];
    const transport = (async <T>(
      path: string,
      body: unknown,
      method: "POST" | "PUT" | "GET" | "PATCH"
    ): Promise<T> => {
      calls.push({ method, path, body });
      if (method === "PUT") {
        puts += 1;
        if (puts === 2) throw apiError(500, "full failed");
      }
      return {} as T;
    }) as Transport;
    const outcome = await runEditSave({
      draft,
      snapshot,
      ids: IDS,
      generation: 1,
      significant: false,
      confirmed: true,
      transport,
      fetchContext: ctxStub(),
      reloadDraft: reloadStub(),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failedStep).toBe("price");
    expect(outcome.failedDetail).toBe("price-full");
    expect(outcome.pricingCleared).toBe(true);
    expect(outcome.appliedSteps).toEqual(["listing"]);
    // The unrestored pricing is flagged, not listed as ordinary pending.
    expect(outcome.pendingSteps).not.toContain("price");
  });
});
