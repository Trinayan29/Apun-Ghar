/**
 * Tests for the draft-delete orchestrator (Phase 2).
 * Pure logic — no UI, no network, no Firebase. The backend call is
 * injected; one test stubs global fetch to prove the real default hits
 * the exact DELETE endpoint.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDeleteDraftGuard,
  deleteDraftErrorMessage,
  runDeleteDraft,
  type DeleteDraftGuard,
} from "./draft-delete";
import type { StudioDraft } from "./studio-data";

function draft(overrides: Partial<StudioDraft> = {}): StudioDraft {
  return {
    draftId: "d1",
    title: "Draft d1",
    updatedAt: 1700000000000,
    currentChapter: "what",
    furthestChapter: "what",
    kind: "local",
    backendIds: { propertyId: null, unitId: null, listingId: null },
    linkedLifecycle: null,
    progress: { price: false, availability: false },
    remainingSteps: [],
    ...overrides,
  };
}

function linkedDraft(
  listingId: number,
  linkedLifecycle: string | null,
  overrides: Partial<StudioDraft> = {}
): StudioDraft {
  return draft({
    kind: "pending",
    backendIds: { propertyId: 1, unitId: 10, listingId },
    linkedLifecycle,
    ...overrides,
  });
}

function deps(over: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const guard = createDeleteDraftGuard();
  return {
    calls,
    guard,
    deleteListing: vi.fn(async (_id: number) => {
      calls.push("api");
      return null;
    }),
    removeLocal: vi.fn(() => {
      calls.push("local");
    }),
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createDeleteDraftGuard", () => {
  it("starts once and releases on finish", () => {
    const guard = createDeleteDraftGuard();
    expect(guard.active).toBe(false);
    expect(guard.tryStart()).toBe(true);
    expect(guard.active).toBe(true);
    expect(guard.tryStart()).toBe(false);
    guard.finish();
    expect(guard.active).toBe(false);
    expect(guard.tryStart()).toBe(true);
  });
});

describe("runDeleteDraft", () => {
  it("deletes a local-only draft without any API call", async () => {
    const d = deps();
    const outcome = await runDeleteDraft({
      draft: draft(),
      guard: d.guard,
      deleteListing: d.deleteListing,
      removeLocal: d.removeLocal,
    });
    expect(outcome).toEqual({
      type: "done",
      result: { ok: true, localOnly: true },
    });
    expect(d.deleteListing).not.toHaveBeenCalled();
    expect(d.removeLocal).toHaveBeenCalledTimes(1);
  });

  it("calls the backend once with the linked listing id, then removes local", async () => {
    const d = deps();
    const outcome = await runDeleteDraft({
      draft: linkedDraft(30, "DRAFT"),
      guard: d.guard,
      deleteListing: d.deleteListing,
      removeLocal: d.removeLocal,
    });
    expect(d.deleteListing).toHaveBeenCalledTimes(1);
    expect(d.deleteListing).toHaveBeenCalledWith(30);
    expect(outcome).toEqual({
      type: "done",
      result: { ok: true, localOnly: false },
    });
    expect(d.calls).toEqual(["api", "local"]);
  });

  it("hits the exact backend endpoint through the real default", async () => {
    const seen: { url: string; method: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string }) => {
        seen.push({ url: String(url), method: init?.method ?? "GET" });
        return new Response(null, { status: 204 });
      })
    );
    const removeLocal = vi.fn();
    const outcome = await runDeleteDraft({
      draft: linkedDraft(30, "DRAFT"),
      guard: createDeleteDraftGuard(),
      removeLocal,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toMatch(/\/api\/v1\/owner\/listings\/30\/draft$/);
    expect(seen[0].method).toBe("DELETE");
    expect(outcome).toEqual({
      type: "done",
      result: { ok: true, localOnly: false },
    });
    expect(removeLocal).toHaveBeenCalledTimes(1);
  });

  it("keeps the local draft when the backend fails", async () => {
    const err = Object.assign(new Error("gone"), { status: 404 });
    const d = deps({ deleteListing: vi.fn(async () => {
      throw err;
    }) });
    const outcome = await runDeleteDraft({
      draft: linkedDraft(30, "DRAFT"),
      guard: d.guard,
      deleteListing: d.deleteListing,
      removeLocal: d.removeLocal,
    });
    expect(outcome).toEqual({
      type: "done",
      result: { ok: false, status: 404, error: "gone" },
    });
    expect(d.removeLocal).not.toHaveBeenCalled();
  });

  it("fails closed for a linked non-DRAFT lifecycle", async () => {
    for (const lifecycle of ["PUBLISHED", "PAUSED", "RENTED", "ARCHIVED"]) {
      const d = deps();
      const outcome = await runDeleteDraft({
        draft: linkedDraft(30, lifecycle),
        guard: d.guard,
        deleteListing: d.deleteListing,
        removeLocal: d.removeLocal,
      });
      expect(outcome).toEqual({ type: "not-deletable" });
      expect(d.deleteListing).not.toHaveBeenCalled();
      expect(d.removeLocal).not.toHaveBeenCalled();
    }
  });

  it("fails closed when the linked lifecycle is unknown", async () => {
    const d = deps();
    const outcome = await runDeleteDraft({
      draft: linkedDraft(30, null),
      guard: d.guard,
      deleteListing: d.deleteListing,
      removeLocal: d.removeLocal,
    });
    expect(outcome).toEqual({ type: "not-deletable" });
    expect(d.deleteListing).not.toHaveBeenCalled();
    expect(d.removeLocal).not.toHaveBeenCalled();
  });

  it("blocks a same-tick second submission", async () => {
    const guard: DeleteDraftGuard = createDeleteDraftGuard();
    let resolveApi!: (v: null) => void;
    const gate = new Promise<null>((resolve) => {
      resolveApi = resolve;
    });
    const deleteListing = vi.fn(() => gate);
    const removeLocal = vi.fn();
    const first = runDeleteDraft({
      draft: linkedDraft(30, "DRAFT"),
      guard,
      deleteListing,
      removeLocal,
    });
    const second = await runDeleteDraft({
      draft: linkedDraft(30, "DRAFT"),
      guard,
      deleteListing,
      removeLocal,
    });
    expect(second).toEqual({ type: "busy" });
    resolveApi(null);
    expect(await first).toEqual({
      type: "done",
      result: { ok: true, localOnly: false },
    });
    expect(deleteListing).toHaveBeenCalledTimes(1);
    expect(guard.active).toBe(false);
  });
});

describe("deleteDraftErrorMessage", () => {
  it("maps not-deletable, 401, 404, 422, 503, network and generic failures", () => {
    expect(deleteDraftErrorMessage({ type: "not-deletable" })).toMatch(
      /no longer a draft/i
    );
    const cases: [number | undefined, RegExp][] = [
      [401, /session expired/i],
      [404, /already be gone/i],
      [422, /no longer a draft/i],
      [503, /photo storage/i],
      [undefined, /connection/i],
    ];
    for (const [status, pattern] of cases) {
      expect(
        deleteDraftErrorMessage({ ok: false, status, error: "detail" })
      ).toMatch(pattern);
    }
    expect(
      deleteDraftErrorMessage({ ok: false, status: 500, error: "boom" })
    ).toMatch(/boom/);
  });

  it("states in every branch that nothing was deleted", () => {
    const outcomes = [
      { type: "not-deletable" } as const,
      { ok: false, status: 401, error: "x" } as const,
      { ok: false, status: 404, error: "x" } as const,
      { ok: false, status: 422, error: "x" } as const,
      { ok: false, status: 503, error: "x" } as const,
      { ok: false, status: undefined, error: "x" } as const,
      { ok: false, status: 500, error: "x" } as const,
    ];
    for (const outcome of outcomes) {
      expect(deleteDraftErrorMessage(outcome)).toMatch(/nothing was deleted/i);
    }
  });
});
