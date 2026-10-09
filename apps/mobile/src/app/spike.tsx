import { SpikeScreen } from '../spike/SpikeScreen';

// Debug route: the Phase 0 connectivity spike. Open with: adb shell am start -a android.intent.action.VIEW -d truetunes://spike
export default function Spike() {
  return <SpikeScreen />;
}
