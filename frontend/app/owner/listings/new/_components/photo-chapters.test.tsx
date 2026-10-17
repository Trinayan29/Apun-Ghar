// @vitest-environment jsdom
/**
 * Real photo upload UI: select -> upload -> READY tiles, retry, delete,
 * backend merge, and Step-14 publish wiring (publish only when 3 READY).
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import {
  PhotosChapter,
  PublishChapter,
  mergeBackendPhotos,
  type PhotoBackendOps,
} from "./chapters";
import { emptyDraft, loadDrafts, type PhotoDraft } from "@/lib/listing-draft";

afterEach(() => cleanup());

beforeEach(() => {
  window.URL.createObjectURL = vi.fn(() => "blob:mock");
  window.URL.revokeObjectURL = vi.fn();
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 800;
    height = 600;
    set src(_v: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", MockImage);
});

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

function readyTile(i: number): PhotoDraft {
  return tile({
    id: `ready-${i}`,
    status: "ready",
    cover: i === 0,
    order: i,
    backendId: 100 + i,
    viewUrl: `https://view/${100 + i}`,
  });
}

function ops(overrides: Partial<PhotoBackendOps> = {}): PhotoBackendOps {
  return {
    upload: vi.fn(async (_lid: number) => ({
      id: 7,
      listing_id: 42,
      storage_key: "listings/42/photos/7.jpg",
      mime: "image/jpeg",
      size_bytes: 1024,
      width: 800,
      height: 600,
      display_order: 0,
      is_cover: true,
      upload_status: "READY",
      media_type: "PHOTO",
      view_url: "https://view/7",
    })),
    remove: vi.fn(async () => {}),
    patch: vi.fn(async (_lid: number, _pid: number, p) => ({
      id: _pid,
      listing_id: 42,
      storage_key: "k",
      mime: "image/jpeg",
      size_bytes: 1,
      width: null,
      height: null,
      display_order: p.display_order ?? 0,
      is_cover: p.is_cover ?? false,
      upload_status: "READY",
      media_type: "PHOTO",
      view_url: null,
    })),
    refresh: vi.fn(async () => []),
    ...overrides,
  };
}

function PhotoHarness({
  initial,
  backendOps,
  listingId,
}: {
  initial: PhotoDraft[];
  backendOps: PhotoBackendOps;
  listingId: number | null;
}) {
  const [photos, setPhotos] = useState(initial);
  const [store] = useState(() => new Map<string, File>());
  return (
    <PhotosChapter
      photos={photos}
      onPhotos={setPhotos}
      error={null}
      listingId={listingId}
      onEnsureListing={async () =>
        listingId == null
          ? { ok: false as const, message: "No listing." }
          : { ok: true as const, listingId }
      }
      photoOps={backendOps}
      fileStore={store}
    />
  );
}

function photoFile(name = "room.jpg", type = "image/jpeg") {
  return new File(["bytes"], name, { type });
}

function fileInput(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input missing");
  return input as HTMLInputElement;
}

describe("PhotosChapter uploads", () => {
  it("uploads a selected file and marks the tile ready", async () => {
    const backendOps = ops();
    const { container } = render(
      <PhotoHarness initial={[]} backendOps={backendOps} listingId={42} />
    );
    fireEvent.change(fileInput(container), {
      target: { files: [photoFile()] },
    });
    await screen.findByText("Ready ✓");
    expect(backendOps.upload).toHaveBeenCalledTimes(1);
    const [lid, f, mime, opts] = vi.mocked(backendOps.upload).mock.calls[0];
    expect(lid).toBe(42);
    expect((f as File).name).toBe("room.jpg");
    expect(mime).toBe("image/jpeg");
    expect(opts).toMatchObject({ displayOrder: 0, isCover: true });
    expect(await screen.findByText("1 of 3 required photos ready")).toBeDefined();
  });

  it("creates the backend listing first when missing", async () => {
    const backendOps = ops();
    const ensure = vi.fn(async () => ({ ok: true as const, listingId: 99 }));
    const seen: PhotoDraft[][] = [];
    const { container } = render(
      <PhotosChapter
        photos={[]}
        onPhotos={(p) => seen.push(p)}
        error={null}
        listingId={null}
        onEnsureListing={ensure}
        photoOps={backendOps}
        fileStore={new Map<string, File>()}
      />
    );
    fireEvent.change(fileInput(container), {
      target: { files: [photoFile()] },
    });
    await vi.waitFor(() => expect(ensure).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(backendOps.upload).toHaveBeenCalledWith(
        99,
        expect.anything(),
        "image/jpeg",
        expect.objectContaining({ displayOrder: 0, isCover: true })
      )
    );
    expect(seen.length).toBeGreaterThan(0);
  });

  it("marks failed tiles with retry and recovers", async () => {
    const backendOps = ops({
      upload: vi
        .fn()
        .mockRejectedValueOnce(new Error("connection lost"))
        .mockImplementation(async () => ({
          id: 9,
          listing_id: 42,
          storage_key: "k",
          mime: "image/jpeg",
          size_bytes: 1,
          width: null,
          height: null,
          display_order: 0,
          is_cover: true,
          upload_status: "READY",
          media_type: "PHOTO",
          view_url: "https://view/9",
        })),
    });
    const { container } = render(
      <PhotoHarness initial={[]} backendOps={backendOps} listingId={42} />
    );
    fireEvent.change(fileInput(container), {
      target: { files: [photoFile()] },
    });
    const retry = await screen.findByRole("button", { name: "Failed — retry" });
    fireEvent.click(retry);
    await screen.findByText("Ready ✓");
    expect(backendOps.upload).toHaveBeenCalledTimes(2);
  });

  it("deletes backend tiles through the API", async () => {
    const backendOps = ops();
    const { container } = render(
      <PhotoHarness
        initial={[readyTile(0)]}
        backendOps={backendOps}
        listingId={42}
      />
    );
    expect(backendOps.refresh).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo 1" }));
    await vi.waitFor(() =>
      expect(backendOps.remove).toHaveBeenCalledWith(42, 100)
    );
    await vi.waitFor(() =>
      expect(screen.queryByText("Ready ✓")).toBeNull()
    );
    expect(container.textContent).toContain("0 of 3 required photos ready");
  });
});

describe("PhotosChapter ensure-failure honesty", () => {
  type EnsureResult =
    | { ok: true; listingId: number }
    | { ok: false; message: string };

  /** Harness with no backend listing yet, so onEnsureListing is exercised. */
  function EnsureHarness({
    backendOps,
    ensure,
    storeRef,
  }: {
    backendOps: PhotoBackendOps;
    ensure: () => Promise<EnsureResult>;
    storeRef: { current: Map<string, File> | null };
  }) {
    const [photos, setPhotos] = useState<PhotoDraft[]>([]);
    const [store] = useState(() => new Map<string, File>());
    storeRef.current = store;
    return (
      <PhotosChapter
        photos={photos}
        onPhotos={setPhotos}
        error={null}
        listingId={null}
        onEnsureListing={ensure}
        photoOps={backendOps}
        fileStore={store}
      />
    );
  }

  it("surfaces the real blocker and never leaves a silent local tile", async () => {
    const backendOps = ops();
    const ensure = vi.fn(async () => ({
      ok: false as const,
      message: "Already saving — try again in a moment.",
    }));
    const storeRef = { current: null as Map<string, File> | null };
    const { container } = render(
      <EnsureHarness
        backendOps={backendOps}
        ensure={ensure}
        storeRef={storeRef}
      />
    );
    fireEvent.change(fileInput(container), {
      target: { files: [photoFile()] },
    });

    // The actual blocker is surfaced, not a generic upload failure.
    await screen.findByText("Already saving — try again in a moment.");
    // There was no listing to upload to, so nothing was sent.
    expect(backendOps.upload).not.toHaveBeenCalled();
    // The pick is visibly failed (retry offered), never an apparently
    // accepted photo.
    expect(screen.getByRole("button", { name: "Failed — retry" })).toBeDefined();
    expect(screen.queryByText("Not uploaded yet")).toBeNull();
    expect(screen.queryByText("Ready ✓")).toBeNull();
    expect(container.textContent).toContain("0 of 3 required photos ready");
  });

  it("keeps the original bytes so retry can upload after the failure", async () => {
    const backendOps = ops();
    let attempt = 0;
    const ensure = vi.fn(async (): Promise<EnsureResult> => {
      attempt += 1;
      return attempt === 1
        ? { ok: false, message: "Couldn't save the draft — try again." }
        : { ok: true, listingId: 77 };
    });
    const storeRef = { current: null as Map<string, File> | null };
    const { container } = render(
      <EnsureHarness
        backendOps={backendOps}
        ensure={ensure}
        storeRef={storeRef}
      />
    );
    fireEvent.change(fileInput(container), {
      target: { files: [photoFile("room.jpg")] },
    });

    await screen.findByRole("button", { name: "Failed — retry" });
    // The owner's pick is retained rather than discarded with the failure.
    expect(storeRef.current?.size).toBe(1);
    expect([...(storeRef.current?.values() ?? [])][0].name).toBe("room.jpg");

    fireEvent.click(screen.getByRole("button", { name: "Failed — retry" }));
    await screen.findByText("Ready ✓");
    expect(ensure).toHaveBeenCalledTimes(2);
    expect(backendOps.upload).toHaveBeenCalledWith(
      77,
      expect.anything(),
      "image/jpeg",
      expect.objectContaining({ displayOrder: 0, isCover: true })
    );
  });

  it("labels a not-yet-uploaded tile instead of showing a bare thumbnail", () => {
    render(
      <PhotosChapter
        photos={[
          tile({
            id: "l1",
            status: "local",
            src: "data:image/jpeg;base64,AAA",
            order: 0,
            cover: true,
          }),
        ]}
        onPhotos={() => {}}
        error={null}
        listingId={42}
        onEnsureListing={async () => ({ ok: true, listingId: 42 })}
        photoOps={ops()}
        fileStore={new Map<string, File>()}
      />
    );
    expect(screen.getByText("Not uploaded yet")).toBeDefined();
    // Never mistaken for an uploaded photo.
    expect(screen.queryByText("Ready ✓")).toBeNull();
    expect(screen.queryByRole("button", { name: "Failed — retry" })).toBeNull();
  });

  it("shows the same honest label in readOnly edit mode", () => {
    render(
      <PhotosChapter
        photos={[tile({ id: "l1", status: "local", order: 0, cover: true })]}
        onPhotos={() => {}}
        error={null}
        listingId={42}
        onEnsureListing={async () => ({ ok: true, listingId: 42 })}
        photoOps={ops()}
        fileStore={new Map<string, File>()}
        readOnly
      />
    );
    // Display only: still no upload control in edit mode.
    expect(screen.getByText("Not uploaded yet")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Failed — retry" })).toBeNull();
  });

  it("says how many picked photos did not fit instead of dropping them silently", async () => {
    const backendOps = ops();
    const { container } = render(
      <PhotoHarness
        initial={[
          tile({ id: "f0", status: "ready", order: 0, cover: true, backendId: 100 }),
        ]}
        backendOps={backendOps}
        listingId={42}
      />
    );
    // 14 free slots, 16 files picked: two selections cannot be kept.
    fireEvent.change(fileInput(container), {
      target: {
        files: Array.from({ length: 16 }, (_, i) =>
          photoFile(`pick-${i}.jpg`)
        ),
      },
    });
    await screen.findByText(
      /Only 14 photos could be added — 2 more didn't fit/
    );
    // Nothing was discarded silently: exactly the fitting tiles were added.
    expect(backendOps.upload).toHaveBeenCalledTimes(14);
    expect(container.textContent).toContain("15/15");
  });

  it("counts failed and stranded tiles toward the cap without deleting any", () => {
    const backendOps = ops();
    const onPhotos = vi.fn();
    const stranded = Array.from({ length: 15 }, (_, i) =>
      tile({
        id: `s-${i}`,
        status: i < 10 ? "local" : "failed",
        error: i < 10 ? null : "boom",
        order: i,
        cover: i === 0,
      })
    );
    const { container } = render(
      <PhotosChapter
        photos={stranded}
        onPhotos={onPhotos}
        error={null}
        listingId={42}
        onEnsureListing={async () => ({ ok: true, listingId: 42 })}
        photoOps={backendOps}
        fileStore={new Map<string, File>()}
      />
    );
    expect(container.textContent).toContain("15/15");
    // At the cap the picker is replaced by an explicit reason.
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(
      screen.getByText("15 photos is the maximum — remove one to add another.")
    ).toBeDefined();
    // All 15 owner picks survive: none was dropped to make room.
    expect(screen.getAllByText(/^Photo \d+$/)).toHaveLength(15);
    expect(screen.getAllByText("Not uploaded yet")).toHaveLength(10);
    // Create mode offers the retry action on each failed tile.
    expect(screen.getAllByRole("button", { name: "Failed — retry" })).toHaveLength(
      5
    );
    expect(onPhotos).not.toHaveBeenCalled();
    expect(backendOps.remove).not.toHaveBeenCalled();
  });
});

describe("PhotosChapter readOnly (edit mode)", () => {
  function renderReadOnly(initial: PhotoDraft[]) {
    const store = new Map<string, File>();
    return render(
      <PhotosChapter
        photos={initial}
        onPhotos={() => {}}
        error={null}
        listingId={42}
        onEnsureListing={async () => ({ ok: true as const, listingId: 42 })}
        photoOps={ops()}
        fileStore={store}
        readOnly
      />
    );
  }

  it("shows existing photos with no mutation controls", () => {
    const { container } = renderReadOnly([
      readyTile(0),
      { ...readyTile(1), status: "failed", error: "boom", backendId: null, viewUrl: null },
    ]);
    // Display survives: images, Cover + Ready badges render.
    expect(screen.getByText("Cover")).toBeDefined();
    expect(screen.getByText("Ready ✓")).toBeDefined();
    // Failed tiles show a static badge instead of a retry button.
    expect(screen.getByText("Failed")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Failed — retry" })
    ).toBeNull();
    // No add tile, no reorder/cover/remove buttons anywhere.
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});

describe("mergeBackendPhotos", () => {
  it("refreshes view URLs for matching ready tiles", () => {
    const prev = [tile({ backendId: 5, status: "ready", viewUrl: null })];
    const merged = mergeBackendPhotos(prev, [
      {
        id: 5,
        listing_id: 1,
        storage_key: "k",
        mime: "image/jpeg",
        size_bytes: 1,
        width: null,
        height: null,
        display_order: 0,
        is_cover: true,
        upload_status: "READY",
        media_type: "PHOTO",
        view_url: "https://view/fresh",
      },
    ]);
    expect(merged?.[0].viewUrl).toBe("https://view/fresh");
  });

  it("returns null when nothing changed", () => {
    const prev = [tile({ backendId: 5, status: "ready", viewUrl: "https://v" })];
    expect(
      mergeBackendPhotos(prev, [
        {
          id: 5,
          listing_id: 1,
          storage_key: "k",
          mime: null,
          size_bytes: null,
          width: null,
          height: null,
          display_order: 0,
          is_cover: false,
          upload_status: "READY",
          media_type: "PHOTO",
          view_url: "https://v",
        },
      ])
    ).toBeNull();
  });

  it("adopted rows end up with exactly one cover", () => {
    const row = (id: number) => ({
      id,
      listing_id: 1,
      storage_key: "k",
      mime: null,
      size_bytes: null,
      width: null,
      height: null,
      display_order: 0,
      is_cover: false,
      upload_status: "READY",
      media_type: "PHOTO",
      view_url: null,
    });
    const merged = mergeBackendPhotos([], [row(5), row(6)]);
    expect(merged?.filter((p) => p.cover)).toHaveLength(1);
    expect(merged?.[0].cover).toBe(true);
  });

  it("adopts backend rows missing locally", () => {
    const merged = mergeBackendPhotos([], [
      {
        id: 9,
        listing_id: 1,
        storage_key: "k",
        mime: null,
        size_bytes: null,
        width: null,
        height: null,
        display_order: 0,
        is_cover: true,
        upload_status: "READY",
        media_type: "PHOTO",
        view_url: "https://v/9",
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged?.[0]).toMatchObject({
      backendId: 9,
      status: "ready",
      cover: true,
    });
  });
});

describe("photo draft hydration", () => {
  it("demotes in-flight uploads to local while preserving READY", () => {
    const d = emptyDraft("hydration-1");
    d.photos = [
      { ...tile({ id: "up" }), status: "uploading" },
      {
        ...tile({ id: "ok" }),
        status: "ready",
        backendId: 77,
        viewUrl: "https://view/stale",
      },
      { ...tile({ id: "bad" }), src: "blob:dead" },
    ];
    window.localStorage.setItem(
      "owner-listing-drafts:test-uid",
      JSON.stringify({ "hydration-1": d })
    );
    const loaded = loadDrafts("test-uid")["hydration-1"];
    const byId = Object.fromEntries(loaded.photos.map((p) => [p.id, p]));
    // Interrupted upload becomes a retryable local pick, id dropped.
    expect(byId["up"].status).toBe("local");
    expect(byId["up"].backendId).toBeNull();
    // READY survives with its backend link (view URL refreshes later).
    expect(byId["ok"].status).toBe("ready");
    expect(byId["ok"].backendId).toBe(77);
    expect(byId["ok"].viewUrl).toBe("https://view/stale");
    // Dead blob previews never hydrate.
    expect(loaded.photos.some((p) => p.id === "bad")).toBe(false);
    window.localStorage.removeItem("owner-listing-drafts:test-uid");
  });
});

function publishableDraft() {
  const d = emptyDraft("t");
  d.place = {
    ...d.place,
    address: "12 Test Road",
    city: "Guwahati",
    area: { id: 7, type: "area", name: "Beltola", city: "Guwahati" },
  };
  d.pricing = { ...d.pricing, rent: "4500" };
  d.availability = { ...d.availability, mode: "now" };
  d.listing = { ...d.listing, title: "Nice PG" };
  d.photos = [readyTile(0), readyTile(1), readyTile(2)];
  return d;
}

function renderPublish(overrides: Record<string, unknown> = {}) {
  const onPublish = vi.fn();
  const view = render(
    <PublishChapter
      draft={publishableDraft()}
      go={() => {}}
      onPublishState={() => {}}
      onSend={() => {}}
      sending={false}
      sendError={null}
      sendResult={null}
      listingId={42}
      onPublish={onPublish}
      publishing={false}
      publishError={null}
      published={false}
      {...overrides}
    />
  );
  return { onPublish, ...view };
}

describe("PublishChapter publish wiring", () => {
  it("publishes through the confirm dialog when 3 photos are ready", async () => {
    const { onPublish } = renderPublish();
    fireEvent.click(screen.getByRole("button", { name: "Publish listing" }));
    await screen.findByText("Publish this listing?");
    fireEvent.click(screen.getByRole("button", { name: "Yes, publish" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("offers send (not publish) while photos are not ready", () => {
    const d = publishableDraft();
    d.photos = [readyTile(0)];
    renderPublish({ draft: d });
    expect(screen.getByRole("button", { name: "Send to Apun-Ghar" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Yes, publish" })).toBeNull();
  });

  it("shows the live panel after publish", () => {
    renderPublish({ published: true });
    expect(screen.getByText("Published on Apun-Ghar ✓")).toBeDefined();
    expect(screen.getByText("Live on Apun-Ghar ✓")).toBeDefined();
  });

  it("closes the sheet on publish failure and keeps the error visible", async () => {
    const base = {
      draft: publishableDraft(),
      go: () => {},
      onPublishState: () => {},
      onSend: () => {},
      sending: false,
      sendError: null,
      sendResult: null,
      listingId: 42,
      onPublish: () => {},
      publishing: false,
      publishError: null,
      published: false,
    };
    const view = render(<PublishChapter {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish listing" }));
    await screen.findByText("Publish this listing?");
    view.rerender(
      <PublishChapter
        {...base}
        publishError="at least 3 READY photos are required for publication"
      />
    );
    await waitFor(() =>
      expect(screen.queryByText("Publish this listing?")).toBeNull()
    );
    expect(screen.getByText("Couldn't publish")).toBeDefined();
    expect(
      screen.getByText("at least 3 READY photos are required for publication")
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });

  it("closes the sheet on success and keeps the published state", async () => {
    const base = {
      draft: publishableDraft(),
      go: () => {},
      onPublishState: () => {},
      onSend: () => {},
      sending: false,
      sendError: null,
      sendResult: null,
      listingId: 42,
      onPublish: () => {},
      publishing: false,
      publishError: null,
      published: false,
    };
    const view = render(<PublishChapter {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Publish listing" }));
    await screen.findByText("Publish this listing?");
    view.rerender(<PublishChapter {...base} published />);
    await waitFor(() =>
      expect(screen.queryByText("Publish this listing?")).toBeNull()
    );
    expect(screen.getByText("Published on Apun-Ghar ✓")).toBeDefined();
    expect(screen.getByText("Live on Apun-Ghar ✓")).toBeDefined();
  });

  it("shows backend publish errors with retry", () => {
    const { onPublish } = renderPublish({
      publishError: "at least 3 READY photos are required for publication",
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });
});
