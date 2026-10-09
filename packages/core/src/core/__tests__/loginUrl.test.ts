import { describe, expect, it } from 'vitest';
import { looksSignedIn } from '../loginUrl';

describe('looksSignedIn', () => {
  it.each([
    ['https://play.sonos.com/', true],
    ['https://play.sonos.com/en-us/web-app', true],
    ['https://play.sonos.com/en-us/login?callbackUrl=https%3A%2F%2Fplay.sonos.com', false],
    ['https://play.sonos.com/api/auth/callback/okta?code=abc&state=xyz', false],
    ['https://login.sonos.com/oauth2/aus91/v1/authorize?client_id=1', false],
    ['https://login.sonos.com/signin/refresh-auth-state/abc', false],
    ['https://example.com/play.sonos.com', false],
    ['', false],
  ])('%s -> %s', (url, expected) => {
    expect(looksSignedIn(url)).toBe(expected);
  });
});
