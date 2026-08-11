import {
  FilesetResolver,
  HandLandmarker,
} from '@mediapipe/tasks-vision'
import type { HandSample } from './frameGesture'

const WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export type HandTracker = {
  detect: (video: HTMLVideoElement, timestampMs: number) => HandSample[]
  close: () => void
}

export async function createHandTracker(): Promise<HandTracker> {
  const vision = await FilesetResolver.forVisionTasks(WASM)
  const landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
  })

  return {
    detect(video, timestampMs) {
      if (video.readyState < 2) return []
      const result = landmarker.detectForVideo(video, timestampMs)
      const samples: HandSample[] = []
      for (let i = 0; i < result.landmarks.length; i++) {
        // Keep Unknown/mislabeled hands — pairing uses image X, not this label.
        const label = result.handedness[i]?.[0]?.categoryName
        const handedness = label === 'Right' ? 'Right' : 'Left'
        samples.push({
          handedness,
          landmarks: result.landmarks[i].map((point) => ({
            x: point.x,
            y: point.y,
            z: point.z,
          })),
        })
      }
      return samples
    },
    close() {
      landmarker.close()
    },
  }
}
