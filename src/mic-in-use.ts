// Windows-only "is another app using the microphone right now?" check, used to
// tell a call app's automatic SMTC pause (Teams pauses every media session
// when you join a call) apart from a deliberate media-key / flyout pause.
//
// Windows records per-app microphone usage under the CapabilityAccessManager
// consent store (the same data behind the taskbar's "app is using your
// microphone" indicator). An app is currently using the mic when its key has
// a non-zero LastUsedTimeStart and LastUsedTimeStop == 0. Packaged apps (e.g.
// new Teams, MSTeams_8wekyb3d8bbwe) are direct subkeys; Win32 apps live under
// NonPackaged. Complete no-op (always false) off Windows or if `reg` fails.

import { execFile } from 'child_process';

const MIC_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';

/** Parse `reg query <MIC_KEY> /s` output into the list of keys currently using the mic. */
export function parseMicUsage(output: string): string[] {
  const active: string[] = [];
  let key: string | null = null;
  let start = 0n;
  let stop: bigint | null = null;
  const flush = () => {
    if (key && start !== 0n && stop === 0n) active.push(key);
  };
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('HKEY_')) {
      flush();
      key = line;
      start = 0n;
      stop = null;
      continue;
    }
    const m = /^(LastUsedTimeStart|LastUsedTimeStop)\s+REG_QWORD\s+(0x[0-9a-fA-F]+)$/.exec(line);
    if (!m) continue;
    if (m[1] === 'LastUsedTimeStart') start = BigInt(m[2]);
    else stop = BigInt(m[2]);
  }
  flush();
  return active;
}

/** Resolves true if any app currently has the microphone open. Never rejects. */
export function isMicInUse(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile('reg', ['query', MIC_KEY, '/s'], { windowsHide: true, timeout: 2000 }, (err, stdout) => {
      if (err) return resolve(false);
      resolve(parseMicUsage(stdout).length > 0);
    });
  });
}
