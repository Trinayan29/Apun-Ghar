/**
 * Integration tests for the Publish send wiring (4E-3).
 * Exercises validation gating, the single-flight guard, submission, and
 * ids/progress persistence through runSubmitAction with injected fakes.
 * React rendering (loading/error/retry affordances) is thin glue over
 * these outcomes and is covered by typecheck + build, not jsdom.
 */
import { describe, expect, it } from "vitest";
import { emptyDraft, type ListingDraft } from "./listing-draft";
import {
  createSubmitGuard,
  runSubmitAction,
  submitErrorMessage,
  submitSuccessMessage,
  validateForSubmit,
} from "./listing-submit-action";
import type { Transport } from "./listing-submit-flow";

function submittableDraft(): ListingDraft {
  const d = emptyDraft("draft-1");
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

function okTransport() {
  const calls: string[] = [];
  const transport: Transport = async <T,>(path: string): Promise<T> => {
    calls.push(path);
    if (path === "/api/v1/owner/properties") return { id: 10 } as T;
    if (path.endsWith("/units")) return { id: 20 } as T;
    if (path.endsWith("/price-components")) return [] as T;
    if (path.endsWith("/availability")) return {} as T;
    return { id: 30 } as T;
  };
  return { calls, transport };
}

function apiError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

describe("validateForSubmit", () => {
  it("passes a fully-filled draft", () => {
    expect(validateForSubmit(submittableDraft())).toBeNull();
  });

  it("reports the failing chapter in wizard order", () => {
    const cases: [string, (d: ListingDraft) => void][] = [
      ["what", (d) => { d.space.kind = ""; }],
      ["kind", (d) => { d.place.buildingType = ""; }],
      ["where", (d) => { d.place.area = null; }],
      ["placename", (d) => { d.place.placeName = "  "; }],
      ["space", (d) => { d.space.furnishing = ""; }],
      ["who", (d) => { d.space.audience = ""; }],
      ["price", (d) => { d.pricing.rent = ""; }],
      ["movein", (d) => { d.availability.mode = ""; }],
      ["name", (d) => { d.listing.title = "x"; }],
    ];
    for (const [step, breakIt] of cases) {
      const d = submittableDraft();
      breakIt(d);
      expect(validateForSubmit(d)).toMatchObject({ step });
    }
  });

  it("flags too many photos at the photos step", () => {
    const d = submittableDraft();
    d.photos = Array.from({ length: 16 }, (_, i) => ({
      id: `p${i}`,
      name: `p${i}.jpg`,
      src: null,
      status: "local" as const,
      cover: i === 0,
      order: i,
    }));
    expect(validateForSubmit(d)).toMatchObject({ step: "photos" });
  });

  it("returns the first failure when several chapters are invalid", () => {
    const d = submittableDraft();
    d.space.kind = "";
    d.pricing.rent = "";
    d.listing.title = "";
    expect(validateForSubmit(d)).toMatchObject({ step: "what" });
  });
});

describe("submit guard", () => {
  it("allows one holder and releases afterwards", () => {
    const guard = createSubmitGuard();
    expect(guard.active).toBe(false);
    expect(guard.tryStart()).toBe(true);
    expect(guard.active).toBe(true);
    expect(guard.tryStart()).toBe(false);
    guard.finish();
    expect(guard.active).toBe(false);
    expect(guard.tryStart()).toBe(true);
  });
});

describe("runSubmitAction", () => {
  it("submits a valid draft exactly once and persists ids + progress", async () => {
    const { calls, transport } = okTransport();
    const persisted: { ids: unknown; progress: unknown }[] = [];
    const outcome = await runSubmitAction({
      draft: submittableDraft(),
      guard: createSubmitGuard(),
      transport,
      persist: (ids, progress) => persisted.push({ ids, progress }),
    });
    expect(outcome.type).toBe("done");
    if (outcome.type !== "done" || !outcome.result.ok) return;
    expect(calls).toEqual([
      "/api/v1/owner/properties",
      "/api/v1/owner/properties/10/units",
      "/api/v1/owner/listings",
      "/api/v1/owner/listings/30/price-components",
      "/api/v1/owner/listings/30/availability",
    ]);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].ids).toEqual({ propertyId: 10, unitId: 20, listingId: 30 });
    expect(persisted[0].progress).toEqual({ price: true, availability: true });
  });

  it("never invokes submission for an invalid draft", async () => {
    const { calls, transport } = okTransport();
    let persisted = 0;
    const d = submittableDraft();
    d.pricing.rent = "";
    const outcome = await runSubmitAction({
      draft: d,
      guard: createSubmitGuard(),
      transport,
      persist: () => { persisted += 1; },
    });
    expect(outcome).toMatchObject({ type: "invalid", blocker: { step: "price" } });
    expect(calls).toHaveLength(0);
    expect(persisted).toBe(0);
  });

  it("a concurrent second send gets busy without new network calls", async () => {
    const { calls, transport } = okTransport();
    const guard = createSubmitGuard();
    const persist = () => {};
    const first = runSubmitAction({
      draft: submittableDraft(),
      guard,
      transport,
      persist,
    });
    const second = await runSubmitAction({
      draft: submittableDraft(),
      guard,
      transport,
      persist,
    });
    expect(second).toEqual({ type: "busy" });
    const firstOutcome = await first;
    expect(firstOutcome.type).toBe("done");
    // One full 5-call submission only — the double invocation added zero.
    expect(calls).toHaveLength(5);
  });

  it("persists partial ids + progress when listing creation fails", async () => {
    const transport: Transport = async <T,>(path: string): Promise<T> => {
      if (path === "/api/v1/owner/properties") return { id: 10 } as T;
      if (path.endsWith("/units")) return { id: 20 } as T;
      throw apiError(422, "title cannot be blank");
    };
    const persisted: { ids: unknown; progress: unknown }[] = [];
    const outcome = await runSubmitAction({
      draft: submittableDraft(),
      guard: createSubmitGuard(),
      transport,
      persist: (ids, progress) => persisted.push({ ids, progress }),
    });
    expect(outcome.type).toBe("done");
    if (outcome.type !== "done" || outcome.result.ok) return;
    expect(outcome.result.failedStep).toBe("listing");
    expect(persisted).toHaveLength(1);
    expect(persisted[0].ids).toEqual({ propertyId: 10, unitId: 20, listingId: null });
    expect(persisted[0].progress).toEqual({ price: false, availability: false });
  });

  it("retry with persisted progress skips completed resources", async () => {
    const calls: string[] = [];
    const transport: Transport = async <T,>(path: string): Promise<T> => {
      calls.push(path);
      if (path.endsWith("/price-components")) return [] as T;
      return {} as T;
    };
    const d = submittableDraft();
    d.backendIds = { propertyId: 10, unitId: 20, listingId: 30 };
    d.submitProgress = { price: true, availability: false };
    const outcome = await runSubmitAction({
      draft: d,
      guard: createSubmitGuard(),
      transport,
      persist: () => {},
    });
    expect(outcome.type).toBe("done");
    if (outcome.type !== "done" || !outcome.result.ok) return;
    expect(calls).toEqual(["/api/v1/owner/listings/30/availability"]);
  });
});

describe("submit messages", () => {
  it("explains session expiry, network loss, and backend errors", () => {
    expect(
      submitErrorMessage({ ok: false, ids: { propertyId: null, unitId: null, listingId: null }, progress: { price: false, availability: false }, failedStep: "property", error: "Invalid Firebase ID token", status: 401 })
    ).toMatch(/session expired/i);
    expect(
      submitErrorMessage({ ok: false, ids: { propertyId: 10, unitId: 20, listingId: 30 }, progress: { price: false, availability: false }, failedStep: "price", error: "fetch failed" })
    ).toMatch(/completed steps won't repeat/i);
    expect(
      submitErrorMessage({ ok: false, ids: { propertyId: 10, unitId: 20, listingId: null }, progress: { price: false, availability: false }, failedStep: "listing", error: "title cannot be blank", status: 422 })
    ).toMatch(/listing details.*title cannot be blank/);
    expect(
      submitErrorMessage({ ok: false, ids: { propertyId: 10, unitId: 20, listingId: null }, progress: { price: false, availability: false }, failedStep: "listing", error: "Rental unit already has an active listing", status: 409 })
    ).toMatch(/already has a listing.*instead of retrying/);
  });

  it("confirms backend-draft success without claiming publish or amenities", () => {
    const base = {
      ok: true as const,
      ids: { propertyId: 10, unitId: 20, listingId: 30 },
      progress: { price: true, availability: true },
    };
    expect(
      submitSuccessMessage({ ...base, pendingAmenitySlugs: [], unknownAmenityLabels: [] })
    ).toMatch(/saved as a draft.*can't see it yet/);
    expect(
      submitSuccessMessage({ ...base, pendingAmenitySlugs: ["wifi", "parking"], unknownAmenityLabels: [] })
    ).toMatch(/2 selected amenities couldn't be attached yet/);
  });
});
