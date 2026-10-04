import { demoRefusal } from '@/lib/demo';
import { FLIX_CHAT } from '@/lib/flix/config';
import { sql } from '@/lib/db/client';

/**
 * Demo-mode startup check (called from instrumentation.ts, Node runtime only):
 * throw unless the chat this deployment renders is flagged synthetic, so a
 * stray DEMO_MODE=true on the real deployment — or a demo project pointed at
 * the real database — fails closed instead of publishing a real chat.
 */
export async function verifyDemoChat(): Promise<void> {
  let row: { is_synthetic: boolean } | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      [row] = (await sql`SELECT is_synthetic FROM chats WHERE id = ${FLIX_CHAT}`) as unknown as Array<{ is_synthetic: boolean }>;
      break;
    } catch (err) {
      // Unverified must mean "don't serve": a skipped check on an instance
      // that later reaches a real database would publish it. Retry cold-start
      // blips briefly, then fail closed — the next request gets a new instance.
      if (attempt >= 3) throw new Error(`DEMO_MODE refused: could not verify chat '${FLIX_CHAT}' is synthetic (${err instanceof Error ? err.message : err})`);
      await new Promise(res => setTimeout(res, 500 * attempt));
    }
  }
  const refusal = demoRefusal(FLIX_CHAT, row);
  if (refusal) throw new Error(refusal);
}
