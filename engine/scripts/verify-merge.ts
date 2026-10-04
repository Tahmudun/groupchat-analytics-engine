/**
 * Live verification of the merge transaction on THROWAWAY rows inside a
 * transaction that is always rolled back — nothing persists, no matview
 * refresh runs (so it never touches the free-tier IO burst budget).
 *
 *   pnpm exec tsx scripts/verify-merge.ts
 */
import { sql } from '@/lib/db/client';
import { applyMerge } from '@/lib/admin/merge';
import { legacyMessageId } from '@/lib/ingestion/ids';

const CHAT = 'flix-original';
const CANON = 'ZZTEST_CANON 🪴';
const DRIFT = 'ZZTEST_DRIFT 🦋';

const problems: string[] = [];
/** first row of a query, asserted present (these test queries always return one) */
const first = <T,>(rows: readonly T[]): T => rows[0] as T;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${label}: got ${JSON.stringify(got)}${ok ? '' : ` — want ${JSON.stringify(want)}`}`);
  if (!ok) problems.push(label);
};

const msg = (sender: string, ts: number, content: string) => ({
  id: legacyMessageId(sender, ts, content),
  sender, timestamp_ms: ts, timestamp: new Date(ts).toISOString(),
  content, media_type: null as string | null, message_type: 'message', chat_id: CHAT,
});

async function main() {
  const SENTINEL = '__ROLLBACK_OK__';
  try {
    await sql.begin(async tx => {
      // ---- seed throwaway members + data --------------------------------
      await tx`INSERT INTO members (username, status, chat_id, aliases) VALUES
        (${CANON}, 'recognized', ${CHAT}, '{}'),
        (${DRIFT}, 'recognized', ${CHAT}, '{}')`;

      const c1 = msg(CANON, 1000, 'hello');       // canonical
      const c2 = msg(CANON, 2000, 'world');       // canonical (target of reactions)
      const d1 = msg(DRIFT, 1000, 'hello');       // TRUE DUP of c1 (same ts+content)
      const d2 = msg(DRIFT, 3000, 'drift only');  // unique → reassign
      for (const m of [c1, c2, d1, d2]) {
        await tx`INSERT INTO messages ${tx(m, 'id', 'sender', 'timestamp_ms', 'timestamp', 'content', 'media_type', 'message_type', 'chat_id')}`;
      }

      // reactions: one reassignable, one that collides with a canon reaction
      await tx`INSERT INTO reactions (message_id, reactor, emoji) VALUES
        (${c2.id}, ${DRIFT}, '🔥'),               -- reassign to CANON
        (${c2.id}, ${DRIFT}, '👍'),               -- collides (CANON already 👍) → drop
        (${c2.id}, ${CANON}, '👍')`;
      // a reaction on d1 (the dup message) — cascade-deleted with d1
      await tx`INSERT INTO reactions (message_id, reactor, emoji) VALUES (${d1.id}, 'someone', '❤️')`;

      await tx`INSERT INTO message_mentions (chat_id, message_id, member_username, alias_matched, confidence, offset_in_message)
        VALUES (${CHAT}, ${c2.id}, ${DRIFT}, 'drift', 1.0, 5)`;
      await tx`INSERT INTO mention_sentiments (message_id, member_username, chat_id, sentiment_score, sentiment_label, confidence, model_version)
        VALUES (${c2.id}, ${DRIFT}, ${CHAT}, 0.5, 'positive', 0.9, 'test-v1')`;
      await tx`INSERT INTO member_scores (chat_id, member_username, date, score, activity_component, sentiment_component, reaction_component, engagement_component, longevity_component, scoring_version)
        VALUES (${CHAT}, ${DRIFT}, '2026-07-01', 1, 1, 1, 1, 1, 1, 1)`;

      // ---- run the merge core ------------------------------------------
      const result = await applyMerge(tx, CHAT, CANON, [DRIFT]);
      console.log('\nresult:', JSON.stringify(result), '\n');
      check('duplicatesRemoved', result.duplicatesRemoved, 1);
      check('messagesReassigned', result.messagesReassigned, 1); // only d2
      check('reactionsReassigned', result.reactionsReassigned, 1); // 🔥 only (👍 dropped)
      check('mentionsReassigned', result.mentionsReassigned, 1);
      check('sentimentsReassigned', result.sentimentsReassigned, 1);
      check('scoreRowsDropped', result.scoreRowsDropped, 1);

      // ---- assert final state ------------------------------------------
      const canonMsgs = first(await tx`SELECT count(*)::int n FROM messages WHERE chat_id=${CHAT} AND sender=${CANON}`);
      check('canonical messages (c1,c2,d2)', canonMsgs.n, 3);
      const driftMsgs = first(await tx`SELECT count(*)::int n FROM messages WHERE chat_id=${CHAT} AND sender=${DRIFT}`);
      check('drift messages left', driftMsgs.n, 0);

      const dupGone = first(await tx`SELECT count(*)::int n FROM messages WHERE id=${d1.id}`);
      check('dup message d1 deleted', dupGone.n, 0);
      const d1rxn = first(await tx`SELECT count(*)::int n FROM reactions WHERE message_id=${d1.id}`);
      check('d1 reaction cascade-deleted', d1rxn.n, 0);

      const driftRxn = first(await tx`SELECT count(*)::int n FROM reactions WHERE reactor=${DRIFT}`);
      check('drift reactions left', driftRxn.n, 0);
      const canonEmojis = (await tx`SELECT emoji FROM reactions WHERE message_id=${c2.id} AND reactor=${CANON} ORDER BY emoji`).map(r => r.emoji);
      check('canon emojis on c2 (👍 kept, 🔥 moved)', canonEmojis, ['👍', '🔥']);

      const driftMen = first(await tx`SELECT count(*)::int n FROM message_mentions WHERE chat_id=${CHAT} AND member_username=${DRIFT}`);
      check('drift mentions left', driftMen.n, 0);
      const driftScore = first(await tx`SELECT count(*)::int n FROM member_scores WHERE chat_id=${CHAT} AND member_username=${DRIFT}`);
      check('drift scores dropped', driftScore.n, 0);

      const driftMember = first(await tx`SELECT status FROM members WHERE username=${DRIFT} AND chat_id=${CHAT}`);
      check('drift member status', driftMember.status, 'removed');
      const canonMember = first(await tx`SELECT aliases FROM members WHERE username=${CANON} AND chat_id=${CHAT}`);
      check('canon display-alias recorded', (canonMember.aliases as string[]).includes(DRIFT), true);
      const aliasRow = first(await tx`SELECT alias_type FROM member_aliases WHERE chat_id=${CHAT} AND member_username=${CANON} AND alias=${DRIFT.toLowerCase()}`);
      check('canon mention-alias recorded', aliasRow?.alias_type, 'real_name');

      // Always roll back — this was a dry test on the live DB.
      throw new Error(SENTINEL);
    });
  } catch (err) {
    if (err instanceof Error && err.message === SENTINEL) {
      // expected rollback
    } else {
      throw err;
    }
  } finally {
    await sql.end();
  }

  console.log(problems.length === 0
    ? '\nALL CHECKS PASSED — transaction rolled back, nothing persisted.'
    : `\nFAILED (${problems.length}): ${problems.join(', ')}`);
  process.exit(problems.length === 0 ? 0 : 1);
}

main();
