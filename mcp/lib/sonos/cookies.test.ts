import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absorb, cookieHeader, isSessionCookie, parseSetCookie, sessionOnly, SESSION_COOKIE } from './cookies.ts';

test('parseSetCookie reads name, value and expiry', () => {
  assert.deepEqual(parseSetCookie('a=b=c; Path=/; Secure'), { name: 'a', value: 'b=c', expired: false });
  assert.equal(parseSetCookie('a=1; Max-Age=0')?.expired, true);
  assert.equal(parseSetCookie('a=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT')?.expired, true);
  assert.equal(parseSetCookie('a=; Path=/')?.expired, true);
  assert.equal(parseSetCookie('garbage'), null);
});

test('absorb rolls the session cookie and drops chunks NextAuth expires', () => {
  const jar = { [`${SESSION_COOKIE}.0`]: 'old0', [`${SESSION_COOKIE}.1`]: 'old1' };
  const changed = absorb(
    jar,
    [
      `${SESSION_COOKIE}=new; Path=/; Secure; HttpOnly`,
      `${SESSION_COOKIE}.0=; Max-Age=0`,
      `${SESSION_COOKIE}.1=; Max-Age=0`,
      'other=x',
    ],
    isSessionCookie
  );
  assert.equal(changed, true);
  assert.deepEqual(jar, { [SESSION_COOKIE]: 'new' });
  assert.equal(absorb(jar, [`${SESSION_COOKIE}=new`], isSessionCookie), false);
});

test('cookieHeader and sessionOnly', () => {
  const jar = { [SESSION_COOKIE]: 's', '__Host-next-auth.csrf-token': 'c' };
  assert.equal(cookieHeader(jar), `${SESSION_COOKIE}=s; __Host-next-auth.csrf-token=c`);
  assert.deepEqual(sessionOnly(jar), { [SESSION_COOKIE]: 's' });
});
