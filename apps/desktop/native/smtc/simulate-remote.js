// Dev-only helper: from a separate process, drive our own running SMTC
// session's Play/Pause/Next/Previous commands (as Windows would when the
// user interacts with the volume flyout or hardware media keys) to verify
// MediaPlaybackCommandManager events fire end-to-end.
const smtc = require('./build/Release/smtc.node');
const action = process.argv[2] || 'pause';
const ok = smtc.simulateRemoteCommand(action);
console.log(`simulateRemoteCommand(${action}) ->`, ok);
