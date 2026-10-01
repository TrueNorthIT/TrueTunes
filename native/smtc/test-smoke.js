// Standalone smoke test for the SMTC native addon.
// Run with: $env:ELECTRON_RUN_AS_NODE=1; node_modules\.bin\electron.cmd native\smtc\test-smoke.js
const smtc = require('./build/Release/smtc.node');

smtc.init((action) => {
  console.log('button pressed:', action);
});

smtc.setMetadata({
  title: 'Test Track',
  artist: 'Test Artist',
  album: 'Test Album',
  thumbnailUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/320px-Example.jpg',
});
smtc.setPlaybackStatus('playing');
smtc.setPositionState({ duration: 180, position: 10 });

console.log('SMTC session published. Press buttons from a hardware/media key or system media overlay.');
console.log('Keeping process alive for 60s so GlobalSystemMediaTransportControlsSessionManager can be checked...');
setTimeout(() => {
  console.log('debug state:', smtc.getDebugState());
  console.log('sessions:', JSON.stringify(smtc.listSessions(), null, 2));
}, 2000);
setTimeout(() => {
  smtc.shutdown();
  console.log('shutdown complete');
  process.exit(0);
}, 60000);
