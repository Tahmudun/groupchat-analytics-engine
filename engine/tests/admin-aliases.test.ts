import { describe, it, expect } from 'vitest';
import { aliasWarning } from '@/lib/admin/aliases';

const config = { slug: 'flix-original', aliasBlocklist: ['bread', 'stupid'] };

describe('aliasWarning', () => {
  it('passes a normal nickname', () => {
    expect(aliasWarning('zibble', config)).toBeNull();
  });

  it('warns on resolver stopwords', () => {
    expect(aliasWarning('him', config)).toMatch(/stopword/);
  });

  it('warns on chat-config blocklist entries, case-insensitively', () => {
    expect(aliasWarning('Bread', config)).toMatch(/blocklist/);
  });

  it('handles a config without a blocklist', () => {
    expect(aliasWarning('bread', { slug: 'x' })).toBeNull();
  });

  it('warns when the blocklist entry itself is mixed-case', () => {
    expect(aliasWarning('bread', { slug: 'x', aliasBlocklist: ['Bread'] })).toMatch(/blocklist/);
  });
});
