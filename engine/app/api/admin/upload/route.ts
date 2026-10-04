import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { requireAdmin } from '@/lib/admin/guard';
import { currentJob, startJob } from '@/lib/admin/jobs';
import { estimateTotalMessages } from '@/lib/admin/progress';
import { validateExportFile, datedExportDir, expandZip, uploadBaseDir, InvalidUploadError, duplicateNames } from '@/lib/admin/upload';
import { ok, fail } from '@/lib/api/respond';
import { ingestArchive } from '@/lib/ingestion/pipeline';
import { sql } from '@/lib/db/client';

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  // Reject up front: writing files and then failing to start the ingest job
  // would leave an orphaned export dir on disk.
  const busy = currentJob();
  if (busy?.state === 'running') {
    return fail(409, 'job_running', `a '${busy.step}' job is already running (started ${busy.startedAt})`);
  }

  const form = await req.formData();
  const chat = form.get('chat');
  if (typeof chat !== 'string' || !chat) return fail(400, 'bad_request', "'chat' field required");
  const [exists] = await sql`SELECT id FROM chats WHERE id = ${chat}`;
  if (!exists) return fail(404, 'chat_not_found', `no chat '${chat}'`);

  const uploads: Array<{ name: string; content: Buffer }> = [];
  for (const part of form.getAll('files')) {
    if (!(part instanceof File)) return fail(400, 'bad_request', "'files' parts must be files");
    const buf = Buffer.from(await part.arrayBuffer());
    if (part.name.toLowerCase().endsWith('.zip')) {
      try {
        uploads.push(...expandZip(buf));
      } catch (err) {
        if (err instanceof InvalidUploadError) return fail(422, 'invalid_files', `${part.name}: ${err.message}`);
        throw err;
      }
    } else uploads.push({ name: part.name, content: buf });
  }
  if (uploads.length === 0) return fail(400, 'bad_request', 'no message_*.json files found in upload');

  // Two exports both naming a part message_1.json would silently overwrite
  // each other on write — catch that before any filesystem write.
  const dups = duplicateNames(uploads.map(u => u.name));
  if (dups.length) {
    return fail(422, 'invalid_files', dups.map(d => `duplicate filename ${d} — upload each export separately`).join('; '));
  }

  // Validate everything before writing anything — no partial batches.
  const issues = uploads
    .map(u => ({ file: u.name, reason: validateExportFile(u.name, u.content) }))
    .filter((i): i is { file: string; reason: string } => i.reason !== null);
  if (issues.length > 0) {
    return fail(422, 'invalid_files', issues.map(i => `${i.file}: ${i.reason}`).join('; '));
  }

  const totalBytes = uploads.reduce((n, u) => n + u.content.length, 0);
  const dir = await datedExportDir(uploadBaseDir(chat));
  await Promise.all(uploads.map(u => writeFile(path.join(dir, u.name), u.content)));
  const repoRoot = path.join(process.cwd(), '..');
  const relDir = path.relative(repoRoot, dir);

  const estimatedTotal = estimateTotalMessages(totalBytes);
  const started = startJob('ingest', async setProgress => {
    const t0 = Date.now();
    const report = await ingestArchive(chat, dir, {
      onProgress: p => setProgress({ ...p, estimatedTotal }),
    });
    return { dir: relDir, report, took_ms: Date.now() - t0 };
  });
  if (!started.ok) {
    return fail(409, 'job_running', `a '${started.busy.step}' job is already running (started ${started.busy.startedAt})`);
  }
  return ok({ dir: relDir, estimatedTotal, started: true });
}
