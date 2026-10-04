import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/guard';
import { startJob } from '@/lib/admin/jobs';
import { ok, fail } from '@/lib/api/respond';
import { sql } from '@/lib/db/client';
import { findMergeSuggestions } from '@/lib/admin/mergeSuggestions';
import { validateMergeInput, previewMerge, executeMerge } from '@/lib/admin/merge';

/** GET — likely-duplicate suggestions for the picker. */
export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const chat = new URL(req.url).searchParams.get('chat');
  if (!chat) return fail(400, 'bad_request', 'chat query param required');
  const suggestions = await findMergeSuggestions(chat);
  return ok(suggestions, { count: suggestions.length });
}

const BodySchema = z.object({
  chat: z.string().min(1),
  canonical: z.string().min(1),
  sources: z.array(z.string().min(1)).min(1),
  dryRun: z.boolean().default(false),
});

/** POST — dryRun:true returns a read-only impact preview; dryRun:false starts
 *  the merge as a background job (progress polled via /api/admin/status). */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'bad_request', parsed.error.issues.map(i => i.message).join('; '));
  const { chat, canonical, sources, dryRun } = parsed.data;

  const invalid = validateMergeInput(canonical, sources);
  if (invalid) return fail(400, 'bad_request', invalid);

  const [chatRow] = await sql`SELECT id FROM chats WHERE id = ${chat}`;
  if (!chatRow) return fail(404, 'chat_not_found', `no chat '${chat}'`);

  if (dryRun) {
    return ok(await previewMerge(chat, canonical, sources));
  }

  const started = startJob('merge', setProgress =>
    executeMerge(chat, canonical, sources, p =>
      setProgress({ kind: 'pipeline', done: p.done, total: p.total, label: p.label })),
  );
  if (!started.ok) {
    return fail(409, 'job_running', `a '${started.busy.step}' job is already running (started ${started.busy.startedAt})`);
  }
  return ok({ started: 'merge', canonical, sources });
}
