/**
 * Real photo upload orchestration: init -> browser PUT -> confirm.
 *
 * Image bytes NEVER travel through FastAPI: the backend issues a
 * short-lived presigned PUT URL and the browser uploads straight to the
 * private bucket. Only backend-confirmed READY photos count toward
 * publication; anything else is local-only state.
 */
import {
  confirmListingPhoto,
  initListingPhoto,
  type OwnerPhotoItem,
} from "./api";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 15;
export const MIN_READY_PHOTOS = 3;

const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedMime = (typeof ACCEPTED_MIME)[number];

export function acceptedMime(type: string): type is AcceptedMime {
  return (ACCEPTED_MIME as readonly string[]).includes(type);
}

/** Extension fallback when File.type is empty (some mobile browsers). */
function mimeFromName(name: string): AcceptedMime | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

export function resolveMime(file: { type: string; name: string }): AcceptedMime | null {
  if (acceptedMime(file.type)) return file.type;
  if (!file.type) return mimeFromName(file.name);
  return null;
}

export function validatePhotoFile(file: {
  type: string;
  name: string;
  size: number;
}): string | null {
  const mime = resolveMime(file);
  if (!mime) return "Those files aren't photos — try JPG, PNG or WebP images.";
  if (file.size <= 0) return "That file looks empty — try another photo.";
  if (file.size > MAX_PHOTO_BYTES)
    return "Photos must be 5 MB or smaller — try a smaller image.";
  return null;
}

export interface UploadDeps {
  init: typeof initListingPhoto;
  confirm: typeof confirmListingPhoto;
  putBytes?: (url: string, file: Blob, contentType: string) => Promise<void>;
}

async function defaultPutBytes(
  url: string,
  file: Blob,
  contentType: string
): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}

/**
 * Full lifecycle for one file. Throws on any failure with a human-readable
 * message; the caller maps that onto retryable UI state.
 */
export async function uploadPhoto(
  listingId: number,
  file: File,
  mime: AcceptedMime,
  opts: {
    displayOrder: number;
    isCover: boolean;
    width?: number | null;
    height?: number | null;
  },
  deps: UploadDeps = { init: initListingPhoto, confirm: confirmListingPhoto }
): Promise<OwnerPhotoItem> {
  const putBytes = deps.putBytes ?? defaultPutBytes;
  let init;
  try {
    init = await deps.init(listingId, {
      content_type: mime,
      size_bytes: file.size,
      width: opts.width ?? null,
      height: opts.height ?? null,
      display_order: opts.displayOrder,
      is_cover: opts.isCover,
    });
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Couldn't start the upload."
    );
  }
  try {
    await putBytes(init.upload_url, file, mime);
  } catch (err) {
    throw new Error(
      err instanceof Error && err.message
        ? err.message
        : "Upload failed — check your connection and retry."
    );
  }
  try {
    return await deps.confirm(listingId, init.id, {
      width: opts.width ?? null,
      height: opts.height ?? null,
      display_order: opts.displayOrder,
      is_cover: opts.isCover,
    });
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Couldn't confirm the upload."
    );
  }
}
