import { STOPWORDS } from '@/lib/mentions/stopwords';
import type { ChatConfig } from '@/lib/config/schema';

/**
 * The mention resolver silently ignores stopwords and blocklisted aliases —
 * storing one would be a dead row. Return a warning so the admin UI can say so.
 */
export function aliasWarning(alias: string, config: ChatConfig): string | null {
  const lower = alias.trim().toLowerCase();
  if (STOPWORDS.has(lower)) return `'${lower}' is a resolver stopword — it will never match as a mention`;
  if (config.aliasBlocklist?.some(b => b.toLowerCase() === lower)) return `'${lower}' is in this chat's blocklist — it will never match as a mention`;
  return null;
}
