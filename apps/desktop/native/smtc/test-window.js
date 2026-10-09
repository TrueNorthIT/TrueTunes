// Test harness: verify SMTC registration works when the addon runs inside a
// real Electron process with an actual BrowserWindow (unlike the bare
// ELECTRON_RUN_AS_NODE smoke test, which has no window at all). Mirrors the
// production ordering in src/main.ts: smtc.init() runs before app.whenReady()
// creates any window.
const { app, BrowserWindow } = require('electron');
const smtc = require('./build/Release/smtc.node');

smtc.init((action) => {
  console.log('button pressed:', action);
});
smtc.setMetadata({
  title: 'Window Test Track',
  artist: 'Window Test Artist',
  album: 'Window Test Album',
  thumbnailUrl: 'https://yt3.googleusercontent.com/SPHeXqlEhzw-pPbAx3AQU4HSD-XuSMlPtLsptfvHOjOTd6F_1ZbELaOYn1d8-jGZ5HW8O1R0pLqausuVZw=w544-h544-l90-rj',
});
smtc.setPlaybackStatus('playing');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 400, height: 300, show: true });
  win.loadURL('data:text/html,<h1>SMTC window test</h1>');

  console.log('SMTC published, BrowserWindow created afterward.');

  let elapsed = 0;
  const poll = setInterval(() => {
    elapsed += 5000;
    console.log(`[t+${elapsed}ms] debug:`, JSON.stringify(smtc.getDebugState()));
    console.log(`[t+${elapsed}ms] sessions:`, JSON.stringify(smtc.listSessions()));
    if (elapsed >= 40000) {
      clearInterval(poll);
      smtc.shutdown();
      app.quit();
    }
  }, 5000);
});

