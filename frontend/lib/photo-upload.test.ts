/**
 * Real upload orchestration: init -> PUT -> confirm.
 * Network and API are fully mocked; no backend, no B2.
 */
import { describe, expect, it, vi } from "vitest";
import {
  resolveMime,
  uploadPhoto,
  validatePhotoFile,
  type UploadDeps,
} from "./photo-upload";

function file(overrides: Partial<{ type: string; name: string; size: number }> = {}) {
  return {
    type: "image/jpeg",
    name: "room.jpg",
    size: 1024,
    ...overrides,
  };
}

describe("validatePhotoFile", () => {
  it("accepts jpeg/png/webp within 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validatePhotoFile(file({ type }))).toBeNull();
    }
  });

  it("rejects non-image types", () => {
    expect(validatePhotoFile(file({ type: "image/gif" }))).toMatch(/JPG, PNG or WebP/);
    expect(validatePhotoFile(file({ type: "video/mp4", name: "v.mp4" }))).toMatch(
      /JPG, PNG or WebP/
    );
  });

  it("falls back to extension when type is empty", () => {
    expect(validatePhotoFile(file({ type: "", name: "room.PNG" }))).toBeNull();
    expect(validatePhotoFile(file({ type: "", name: "notes.txt" }))).toMatch(
      /JPG, PNG or WebP/
    );
  });

  it("rejects empty and oversize files", () => {
    expect(validatePhotoFile(file({ size: 0 }))).toMatch(/empty/);
    expect(validatePhotoFile(file({ size: 5 * 1024 * 1024 + 1 }))).toMatch(
      /5 MB/
    );
    expect(validatePhotoFile(file({ size: 5 * 1024 * 1024 }))).toBeNull();
  });
});

describe("resolveMime", () => {
  it("prefers the declared type, then extension", () => {
    expect(resolveMime({ type: "image/webp", name: "a.jpg" })).toBe("image/webp");
    expect(resolveMime({ type: "", name: "a.webp" })).toBe("image/webp");
    expect(resolveMime({ type: "image/gif", name: "a.gif" })).toBeNull();
  });
});

function deps(overrides: {
  init?: UploadDeps["init"];
  confirm?: UploadDeps["confirm"];
  putBytes?: NonNullable<UploadDeps["putBytes"]>;
} = {}) {
  const init = vi.fn(async () => ({
    id: 7,
    upload_url: "https://b2.test/put",
    view_url: null,
  }));
  const confirm = vi.fn(async () => ({ id: 7, upload_status: "READY" }));
  const putBytes = vi.fn(async () => {});
  return {
    init: (overrides.init ?? init) as UploadDeps["init"],
    confirm: (overrides.confirm ?? confirm) as UploadDeps["confirm"],
    putBytes: (overrides.putBytes ?? putBytes) as NonNullable<
      UploadDeps["putBytes"]
    >,
    _mocks: { init, confirm, putBytes },
  };
}

const blob = { size: 1024 } as Blob;

describe("uploadPhoto", () => {
  it("runs init -> PUT -> confirm in order", async () => {
    const d = deps();
    const row = await uploadPhoto(
      42,
      blob as File,
      "image/jpeg",
      { displayOrder: 2, isCover: true, width: 800, height: 600 },
      d
    );
    expect(d._mocks.init).toHaveBeenCalledWith(42, {
      content_type: "image/jpeg",
      size_bytes: 1024,
      width: 800,
      height: 600,
      display_order: 2,
      is_cover: true,
    });
    expect(d._mocks.putBytes).toHaveBeenCalledWith(
      "https://b2.test/put",
      blob,
      "image/jpeg"
    );
    expect(d._mocks.confirm).toHaveBeenCalledWith(42, 7, {
      width: 800,
      height: 600,
      display_order: 2,
      is_cover: true,
    });
    expect(row).toMatchObject({ id: 7, upload_status: "READY" });
  });

  it("surfaces PUT failures for retry", async () => {
    const d = deps({ putBytes: vi.fn(async () => { throw new Error("boom 503"); }) });
    await expect(
      uploadPhoto(42, blob as File, "image/jpeg", { displayOrder: 0, isCover: false }, d)
    ).rejects.toThrow("boom 503");
    expect(d._mocks.confirm).not.toHaveBeenCalled();
  });

  it("surfaces init failures without uploading", async () => {
    const d = deps({ init: vi.fn(async () => { throw new Error("denied"); }) });
    await expect(
      uploadPhoto(42, blob as File, "image/jpeg", { displayOrder: 0, isCover: false }, d)
    ).rejects.toThrow("denied");
    expect(d._mocks.putBytes).not.toHaveBeenCalled();
  });

  it("surfaces confirm failures after bytes landed", async () => {
    const d = deps({
      confirm: vi.fn(async () => { throw new Error("object too big"); }),
    });
    await expect(
      uploadPhoto(42, blob as File, "image/jpeg", { displayOrder: 0, isCover: false }, d)
    ).rejects.toThrow("object too big");
    expect(d._mocks.putBytes).toHaveBeenCalled();
  });
});
