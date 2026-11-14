import { z } from "zod";
import { ApiError, clientIp, ok, rateLimit } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import {
  UPLOAD_CHUNK_BYTES,
  classify,
  createMediaRecord,
  initBlob,
  maxImageBytes,
  maxVideoBytes,
  purgeStalePendingUploads,
} from "@/lib/media";

const initSchema = z.object({
  type: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
});

/** Begin a chunked upload: creates a pending media row plus an empty blob and
 *  returns the chunk size the client must use. Lets files larger than the
 *  serverless request-body limit (4.5 MB) reach storage. */
export const POST = withAuth(async (req, user) => {
  rateLimit(`upload-init:${user.id}:${clientIp(req)}`, 30, 60_000);

  const body = initSchema.parse(await req.json());

  const kind = classify(body.type);
  if (!kind)
    throw new ApiError(
      415,
      "unsupported_type",
      "Unsupported file type. Use JPEG, PNG, WEBP, GIF, MP4, WEBM or MOV.",
    );

  const limit = kind === "image" ? maxImageBytes() : maxVideoBytes();
  if (body.size > limit)
    throw new ApiError(
      413,
      "file_too_large",
      `File exceeds the ${Math.round(limit / 1024 / 1024)} MB limit`,
    );

  await purgeStalePendingUploads();

  const row = await createMediaRecord({
    ownerId: user.id,
    kind,
    mimeType: body.type,
    sizeBytes: body.size,
    state: "pending",
  });
  await initBlob(row.id);

  return ok({
    media: {
      id: row.id,
      kind: row.kind,
      url: `/api/media/${row.id}`,
      width: null,
      height: null,
      durationMs: null,
    },
    chunkSize: UPLOAD_CHUNK_BYTES,
  });
});
