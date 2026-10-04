import { describe, expect, it } from 'vitest';
import { profileSetupParts, validateProfileLinkInput } from '@/lib/admin/profileLinks';
import { profilePickFromRow } from '@/lib/flix/data';

describe('validateProfileLinkInput', () => {
  it('accepts linking one source to several distinct targets', () => {
    expect(validateProfileLinkInput('old account', ['new alt', 'newer alt'])).toBeNull();
  });

  it('accepts a null source for unlinking', () => {
    expect(validateProfileLinkInput(null, ['new alt'])).toBeNull();
  });

  it('requires targets and rejects blank or duplicate names', () => {
    expect(validateProfileLinkInput('source', [])).toMatch(/at least one target/i);
    expect(validateProfileLinkInput('source', [''])).toMatch(/non-empty/i);
    expect(validateProfileLinkInput('source', ['alt', 'alt'])).toMatch(/distinct/i);
  });

  it('does not allow the source to be one of its own targets', () => {
    expect(validateProfileLinkInput('source', ['alt', 'source'])).toMatch(/cannot also be a target/i);
  });
});

describe('profileSetupParts', () => {
  it('summarizes the configured surfaces without exposing image data', () => {
    expect(profileSetupParts({
      avatar_url: 'data:image/jpeg;base64,huge',
      tile_url: 'tile',
      banner_url: 'banner',
      card_url: 'card',
      tagline: 'A tagline',
    })).toEqual(['pfp', 'profile tile', 'show artwork', 'show copy']);
  });

  it('reports a preset-only setup and ignores empty profiles', () => {
    expect(profileSetupParts({ banner_preset: 'ember' })).toEqual(['fallback gradient']);
    expect(profileSetupParts({})).toEqual([]);
  });
});

describe('profilePickFromRow', () => {
  it('maps resolved tile and pfp fields for login and the selected-viewer nav', () => {
    expect(profilePickFromRow({
      username: 'kenji', display_name: 'Kenji', tile_url: 'square', avatar_url: 'pfp',
    })).toEqual({
      username: 'kenji', displayName: 'Kenji', tileUrl: 'square', avatarUrl: 'pfp',
    });
  });

  it('normalizes missing artwork to null', () => {
    expect(profilePickFromRow({ username: 'x', display_name: 'X' })).toMatchObject({ tileUrl: null, avatarUrl: null });
  });
});
