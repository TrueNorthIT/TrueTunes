import type { FaceDetector } from '@mediapipe/tasks-vision';
// Bundled, never fetched from a CDN: Vite serves these from node_modules in dev and emits them with the build.
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
// BlazeFace full-range: finds every face in a band photo, where short-range misses the smaller ones.
import modelAssetPath from '../assets/models/blaze_face_full_range.tflite?url';
import type { DetectedFace } from './focalPoint';

let detector: Promise<FaceDetector> | null = null;

/** MediaPipe's face detector, loaded on first use (the library is a dynamic import) and shared after that. */
function getDetector(): Promise<FaceDetector> {
  detector ??= import('@mediapipe/tasks-vision').then(({ FaceDetector }) =>
    FaceDetector.createFromOptions(
      { wasmLoaderPath, wasmBinaryPath },
      { baseOptions: { modelAssetPath, delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.5 }
    )
  );
  return detector;
}

/** Load the detector ahead of the first artist page, so its crop doesn't visibly ease in. */
export function warmFaceDetector(): void {
  getDetector().catch(() => {
    detector = null;
  });
}

/** The faces in `image`, normalised to its size (0–1). Rejects when MediaPipe cannot load. */
export async function detectFaces(image: HTMLCanvasElement): Promise<DetectedFace[]> {
  const { detections } = (await getDetector()).detect(image);
  const { width: w, height: h } = image;
  return detections.flatMap((d) => {
    const b = d.boundingBox;
    if (!b) return [];
    // keypoints 0 and 1 are the eyes, already normalised
    const eyes = d.keypoints.slice(0, 2);
    return [
      {
        top: b.originY / h,
        height: b.height / h,
        width: b.width / w,
        eyeY: eyes.length === 2 ? (eyes[0].y + eyes[1].y) / 2 : undefined,
      },
    ];
  });
}
