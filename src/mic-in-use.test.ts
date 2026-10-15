// Run: npm run test:main
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMicUsage } from './mic-in-use.ts';

const ROOT = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';

const SAMPLE = [
  ROOT,
  '    Value    REG_SZ    Allow',
  '',
  `${ROOT}\\Microsoft.Copilot_8wekyb3d8bbwe`,
  '    Value    REG_SZ    Prompt',
  '    LastSetTime    REG_QWORD    0x1db9a44d9072d01',
  '',
  `${ROOT}\\MSTeams_8wekyb3d8bbwe`,
  '    Value    REG_SZ    Allow',
  '    LastUsedTimeStart    REG_QWORD    0x1dd3ac0038f1caf',
  '    LastUsedTimeStop    REG_QWORD    0x0',
  '',
  `${ROOT}\\NonPackaged`,
  '',
  `${ROOT}\\NonPackaged\\C:#Program Files#Discord#Discord.exe`,
  '    LastUsedTimeStart    REG_QWORD    0x1dd3ac0038f1caf',
  '    LastUsedTimeStop    REG_QWORD    0x1dd3ac0038f2000',
  '',
].join('\r\n');

test('reports apps with an open mic (start set, stop zero)', () => {
  assert.deepEqual(parseMicUsage(SAMPLE), [`${ROOT}\\MSTeams_8wekyb3d8bbwe`]);
});

test('finished sessions and never-used apps are not in use', () => {
  const idle = SAMPLE.replace('LastUsedTimeStop    REG_QWORD    0x0', 'LastUsedTimeStop    REG_QWORD    0x1dd3ac0038f2000');
  assert.deepEqual(parseMicUsage(idle), []);
});

test('in-use entry as the last key in the output is still reported', () => {
  const out = `${ROOT}\\NonPackaged\\C:#zoom.exe\r\n    LastUsedTimeStart    REG_QWORD    0x1\r\n    LastUsedTimeStop    REG_QWORD    0x0`;
  assert.deepEqual(parseMicUsage(out), [`${ROOT}\\NonPackaged\\C:#zoom.exe`]);
});

test('empty output', () => {
  assert.deepEqual(parseMicUsage(''), []);
});
