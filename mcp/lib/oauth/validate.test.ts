import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedRedirectUri, redirectMatches, s256, verifyPkce } from './validate.ts';

test('redirect URIs: https, loopback http and app schemes only', () => {
  assert.ok(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback'));
  assert.ok(isAllowedRedirectUri('http://localhost:33418/callback'));
  assert.ok(isAllowedRedirectUri('http://127.0.0.1:5000/cb'));
  assert.ok(isAllowedRedirectUri('cursor://anysphere.cursor-retrieval/oauth/callback'));
  assert.ok(!isAllowedRedirectUri('http://evil.example.com/cb'));
  assert.ok(!isAllowedRedirectUri('javascript:alert(1)'));
  assert.ok(!isAllowedRedirectUri('https://claude.ai/cb#frag'));
  assert.ok(!isAllowedRedirectUri('not a url'));
});

test('redirect matching is exact except for loopback ports', () => {
  const registered = ['https://claude.ai/api/mcp/auth_callback', 'http://127.0.0.1:1234/callback'];
  assert.ok(redirectMatches(registered, 'https://claude.ai/api/mcp/auth_callback'));
  assert.ok(redirectMatches(registered, 'http://127.0.0.1:9999/callback'));
  assert.ok(!redirectMatches(registered, 'http://127.0.0.1:9999/other'));
  assert.ok(!redirectMatches(registered, 'https://claude.ai/api/mcp/auth_callback?x=1'));
  assert.ok(!redirectMatches(registered, 'http://localhost:1234/callback'));
});

test('PKCE S256 (RFC 7636 appendix B vector)', async () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(await s256(verifier), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.equal(await verifyPkce(verifier, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'), true);
  assert.equal(await verifyPkce('short', 'x'), false);
  assert.equal(await verifyPkce(null, 'x'), false);
});
