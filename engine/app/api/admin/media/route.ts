import { requireAdmin } from '@/lib/admin/guard';
import { ok, fail } from '@/lib/api/respond';
import { FLIX_CHAT } from '@/lib/flix/config';
import {
  ensureBucket, putObject, buildMediaPath, extFor, validateMediaUpload, type MediaKind,
} from '@/lib/flix/storage';

export const runtime = 'nodejs';

/** Upload an avatar/banner/poster; returns the storage path to persist. */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, 'bad_request', 'expected multipart form data');
  const file = form.get('file');
  const kind = String(form.get('kind') ?? '');
  const name = String(form.get('name') ?? 'media');
  const chat = String(form.get('chat') ?? FLIX_CHAT);
  if (!(file instanceof File)) return fail(400, 'bad_request', 'file is required');

  const reason = validateMediaUpload(kind, file.type, file.size);
  if (reason) return fail(422, 'invalid_upload', reason);

  let ext: string;
  try {
    ext = extFor(file.name, file.type);
  } catch (err) {
    return fail(422, 'invalid_upload', err instanceof Error ? err.message : 'bad file');
  }

  const path = buildMediaPath(chat, kind as MediaKind, name, ext);
  try {
    await ensureBucket();
    await putObject(path, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (err) {
    return fail(500, 'storage_error', err instanceof Error ? err.message : 'upload failed');
  }
  return ok({ path });
}
