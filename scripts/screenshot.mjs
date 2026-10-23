// Screenshot the running dev app over CDP (port 9333), optionally after moving to a route.
//   node scripts/screenshot.mjs <out.png> [route] [waitMs]
//   node scripts/screenshot.mjs shot.png queuedle/stats 6000
// The route is given without "#/": Git Bash rewrites arguments that look like paths ("#/x" becomes "#C:/Program Files/Git/x").
// Navigation only. Never script clicks on add, queue, transport or Queuedle: the app drives the office speakers.
import { writeFileSync } from 'node:fs';

const [out, route, wait = '4000'] = process.argv.slice(2);
if (!out) throw new Error('usage: node scripts/screenshot.mjs <out.png> [route] [waitMs]');

const targets = await (await fetch('http://localhost:9333/json/list')).json();
const page = targets.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:5173'));
if (!page) throw new Error('App not found on CDP port 9333; is `npm run dev` running?');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  pending.get(m.id)?.(m);
  pending.delete(m.id);
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });

if (route !== undefined) {
  await send('Runtime.evaluate', { expression: `location.hash = ${JSON.stringify('#/' + route.replace(/^#?\/?/, ''))}` });
}
await new Promise((r) => setTimeout(r, Number(wait)));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(`saved ${out}`);
ws.close();
