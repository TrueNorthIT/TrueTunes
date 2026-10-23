// Run: npm run test:main
import test from 'node:test';
import assert from 'node:assert/strict';
import { sendsSessionCookie } from './sonos-cookie.ts';

test('the Sonos web app host gets the session cookie over https', () => {
  assert.equal(sendsSessionCookie('https://play.sonos.com/api/content/image?id=1'), true);
  assert.equal(sendsSessionCookie('https://PLAY.sonos.com/x'), true);
});

test('plain http never gets it, even on the Sonos host', () => {
  assert.equal(sendsSessionCookie('http://play.sonos.com/api/content/image?id=1'), false);
});

test('lookalike hosts do not get it', () => {
  for (const url of [
    'https://play.sonos.com.evil.com/x',
    'https://evilplay.sonos.com/x',
    'https://play-sonos.com/x',
    'https://evil.com/play.sonos.com',
    'https://play.sonos.com@evil.com/x',
    'https://evil.com/?u=https://play.sonos.com',
  ]) {
    assert.equal(sendsSessionCookie(url), false, url);
  }
});

test('image CDNs do not get it', () => {
  assert.equal(sendsSessionCookie('https://lh3.googleusercontent.com/abc=w544-h544'), false);
  assert.equal(sendsSessionCookie('https://i.ytimg.com/vi/x/hqdefault.jpg'), false);
});

test('garbage does not get it', () => {
  for (const url of ['', 'not a url', 'file:///C:/x', 'javascript:alert(1)']) {
    assert.equal(sendsSessionCookie(url), false, url);
  }
});
