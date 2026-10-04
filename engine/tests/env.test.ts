import { describe, it, expect } from 'vitest';
import { loadEnv } from '@/lib/env';

describe('loadEnv', () => {
  it('falls back to SUPABASE_DB_URL when DATABASE_URL is unset', () => {
    const env = loadEnv({ SUPABASE_DB_URL: 'postgresql://fallback' });
    expect(env.DATABASE_URL).toBe('postgresql://fallback');
  });

  it('prefers DATABASE_URL and applies defaults', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://primary', SUPABASE_DB_URL: 'postgresql://fallback' });
    expect(env.DATABASE_URL).toBe('postgresql://primary');
    expect(env.OLLAMA_URL).toBe('http://localhost:11434');
    expect(env.SENTIMENT_ENGINE).toBe('auto');
  });

  it('throws when no database url is present', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects an invalid SENTIMENT_ENGINE', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgresql://x', SENTIMENT_ENGINE: 'gpt' })).toThrow();
  });

  // Docker Compose's map form always sets the key, empty when the operator
  // left it blank. An empty optional key must read as "unset", not fail
  // `.min(1)` and take the whole container down on boot.
  it('treats an empty optional key as unset rather than failing validation', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://x', GROQ_API_KEY: '', MISTRAL_API_KEY: '   ' });
    expect(env.GROQ_API_KEY).toBeUndefined();
    expect(env.MISTRAL_API_KEY).toBeUndefined();
  });

  it('still applies defaults when an optional key with a default is empty', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://x', SENTIMENT_ENGINE: '', OLLAMA_URL: '' });
    expect(env.SENTIMENT_ENGINE).toBe('auto');
    expect(env.OLLAMA_URL).toBe('http://localhost:11434');
  });

  it('falls back to SUPABASE_DB_URL when DATABASE_URL is present but empty', () => {
    const env = loadEnv({ DATABASE_URL: '', SUPABASE_DB_URL: 'postgresql://fallback' });
    expect(env.DATABASE_URL).toBe('postgresql://fallback');
  });

  // Docker Compose interpolates `$` in deploy/.env, and an argon2id digest is
  // full of them. Unescaped, the container receives a truncated fragment, and
  // the login route's verify().catch(() => false) turns that into "Incorrect
  // password." for every correct password, forever, silently. Fail at boot.
  it('rejects a password hash that Compose truncated, naming the $$ fix', () => {
    expect(() => loadEnv({
      DATABASE_URL: 'postgresql://x',
      SITE_PASSWORD_HASH: '=19=19456,t=2,p=1',
    })).toThrow(/\$\$/);
  });

  it('rejects a truncated ADMIN_PASSWORD_HASH too', () => {
    expect(() => loadEnv({
      DATABASE_URL: 'postgresql://x',
      ADMIN_PASSWORD_HASH: '=19=19456,t=2,p=1',
    })).toThrow(/argon2/);
  });

  it('accepts a complete argon2id hash', () => {
    const digest = '$argon2id$v=19$m=19456,t=2,p=1$jZ5i5jhCxok6utD3C3aJtA$Kl5a88DbPjBtMvHtwL7MJ6CutYPOLwmt0YTCLt4m7vI';
    const env = loadEnv({ DATABASE_URL: 'postgresql://x', SITE_PASSWORD_HASH: digest, ADMIN_PASSWORD_HASH: digest });
    expect(env.SITE_PASSWORD_HASH).toBe(digest);
    expect(env.ADMIN_PASSWORD_HASH).toBe(digest);
  });

  // Unset stays the documented local-dev behaviour: gates dormant, site open.
  it('still allows the gates to be absent entirely', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://x' });
    expect(env.SITE_PASSWORD_HASH).toBeUndefined();
    expect(env.ADMIN_PASSWORD_HASH).toBeUndefined();
  });

  it('keeps a real value that merely has surrounding whitespace', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://x', GROQ_API_KEY: ' gsk_real ' });
    expect(env.GROQ_API_KEY).toBe(' gsk_real ');
  });
});
