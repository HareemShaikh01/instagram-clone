import { ApiError, clientIp, ok, rateLimit } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import {
  classify,
  createMediaRecord,
  maxImageBytes,
  maxVideoBytes,
  putBlob,
} from "@/lib/media";

export const POST = withAuth(async (req, user) => {
  rateLimit(`upload:${user.id}:${clientIp(req)}`, 60, 60_000);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "bad_form", "Expected multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "missing_file", "No file provided");

  const kind = classify(file.type);
  if (!kind)
    throw new ApiError(
      415,
      "unsupported_type",
      "Unsupported file type. Use JPEG, PNG, WEBP, GIF, MP4, WEBM or MOV.",
    );

  const limit = kind === "image" ? maxImageBytes() : maxVideoBytes();
  if (file.size > limit)
    throw new ApiError(
      413,
      "file_too_large",
      `File exceeds the ${Math.round(limit / 1024 / 1024)} MB limit`,
    );
  if (file.size === 0) throw new ApiError(400, "empty_file", "File is empty");

  const buf = Buffer.from(await file.arrayBuffer());
  const row = await createMediaRecord({
    ownerId: user.id,
    kind,
    mimeType: file.type,
    sizeBytes: buf.byteLength,
  });
  await putBlob(row.id, buf);

  return ok({
    media: {
      id: row.id,
      kind: row.kind,
      url: `/api/media/${row.id}`,
      width: row.width,
      height: row.height,
      durationMs: row.durationMs,
    },
  });
});
