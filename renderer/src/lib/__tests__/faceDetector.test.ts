import { describe, it, expect, vi } from 'vitest';

const detect = vi.fn();
const createFromOptions = vi.fn(async () => ({ detect }));
vi.mock('@mediapipe/tasks-vision', () => ({ FaceDetector: { createFromOptions } }));

import { detectFaces } from '../faceDetector';

const canvas = () => Object.assign(document.createElement('canvas'), { width: 512, height: 512 });

describe('detectFaces', () => {
  it('normalises boxes and takes the eye line from the eye keypoints', async () => {
    detect.mockReturnValue({
      detections: [
        {
          boundingBox: { originX: 128, originY: 256, width: 64, height: 128 },
          keypoints: [
            { x: 0.3, y: 0.55 },
            { x: 0.36, y: 0.57 },
            { x: 0.33, y: 0.62 },
          ],
          categories: [],
        },
      ],
    });
    expect(await detectFaces(canvas())).toEqual([{ top: 0.5, height: 0.25, width: 0.125, eyeY: 0.56 }]);
  });

  it('loads MediaPipe once, from the bundled wasm and model', async () => {
    detect.mockReturnValue({ detections: [] });
    // A fresh module, so the detector the first test cached doesn't hide the load (Vitest clears call counts per test).
    vi.resetModules();
    const fresh = await import('../faceDetector');
    await fresh.detectFaces(canvas());
    await fresh.detectFaces(canvas());
    expect(createFromOptions).toHaveBeenCalledTimes(1);
    const [fileset, options] = createFromOptions.mock.calls[0] as unknown as [
      Record<string, string>,
      { baseOptions: { modelAssetPath: string } },
    ];
    expect(fileset.wasmBinaryPath).toMatch(/vision_wasm_internal\.wasm/);
    expect(options.baseOptions.modelAssetPath).toMatch(/blaze_face_full_range\.tflite/);
  });
});
