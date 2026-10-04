import { z } from 'zod';

export const ChatConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  scoring: z.record(z.string(), z.number()).optional(),
  extraAliases: z.record(z.string(), z.array(z.string())).optional(),
  /** Aliases that must never be treated as mentions in this chat (lowercase).
   *  For nicknames that collide with everyday words ("bread", "stupid"). */
  aliasBlocklist: z.array(z.string()).optional(),
});

export type ChatConfig = z.infer<typeof ChatConfigSchema>;

export function parseChatConfig(raw: unknown): ChatConfig {
  return ChatConfigSchema.parse(raw);
}
