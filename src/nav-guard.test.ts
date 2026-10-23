// Run: npm run test:main
import test from 'node:test';
import assert from 'node:assert/strict';
import { navDecision, isWebUrl } from './nav-guard.ts';

const DEV = 'http://localhost:5173';
const PKG = 'file:///C:/Program%20Files/True%20Tunes/resources/app.asar/renderer/dist/index.html';

test('dev server: same origin stays in the window, including hash routes and reloads', () => {
  assert.equal(navDecision('http://localhost:5173/', DEV), 'allow');
  assert.equal(navDecision('http://localhost:5173/#/artist/123', DEV), 'allow');
  assert.equal(navDecision('http://localhost:5173/?t=123#/mini', DEV), 'allow');
});

test('dev server: other ports and hosts are not the app', () => {
  assert.equal(navDecision('http://localhost:5174/', DEV), 'external');
  assert.equal(navDecision('http://127.0.0.1:5173/', DEV), 'external');
});

test('packaged: the index file stays in the window, whatever the hash or drive-letter case', () => {
  assert.equal(navDecision(PKG, PKG), 'allow');
  assert.equal(navDecision(`${PKG}#/mini`, PKG), 'allow');
  assert.equal(navDecision(PKG.replace('C:', 'c:').replace(/%20/g, ' '), PKG), 'allow');
});

test('packaged: any other file is refused', () => {
  assert.equal(navDecision('file:///C:/Windows/System32/calc.exe', PKG), 'deny');
  assert.equal(navDecision('file:///C:/Windows/System32/calc.exe', DEV), 'deny');
});

test('web links go to the system browser', () => {
  assert.equal(navDecision('https://genius.com/some-song', DEV), 'external');
  assert.equal(navDecision('https://github.com/x/y/releases', PKG), 'external');
});

test('everything else is refused', () => {
  for (const url of ['javascript:alert(1)', 'mailto:a@b.c', 'ms-settings:', 'data:text/html,hi', 'not a url', '']) {
    assert.equal(navDecision(url, DEV), 'deny', url);
  }
});

test('isWebUrl only accepts http and https', () => {
  assert.equal(isWebUrl('https://x.com'), true);
  assert.equal(isWebUrl('http://x.com'), true);
  assert.equal(isWebUrl('file:///C:/x'), false);
  assert.equal(isWebUrl('ms-msdt:/id'), false);
  assert.equal(isWebUrl('garbage'), false);
});
