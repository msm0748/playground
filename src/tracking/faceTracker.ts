import {
  FaceLandmarker,
  FilesetResolver,
} from '@mediapipe/tasks-vision'
import type { Point } from '../types'

const WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

/** MediaPipe Face Mesh indices used for pose. */
const NOSE_TIP = 1
const CHIN = 152
const FOREHEAD = 10
const LEFT_EYE_OUTER = 33
const RIGHT_EYE_OUTER = 263

export type FacePose = {
  /** Face center in video pixel space. */
  center: Point
  /** Approximate face width / height in video pixels. */
  width: number
  height: number
  /** Radians; positive tilts the face clockwise in video space. */
  rotation: number
}

export type FaceExpression = {
  /** 0..1, higher means eyes more closed. */
  blinkLeft: number
  /** 0..1, higher means eyes more closed. */
  blinkRight: number
  /** 0..1, higher means mouth more open. */
  jawOpen: number
}

export type FaceSample = {
  pose: FacePose
  expression: FaceExpression
}

export type FaceTracker = {
  detect: (video: HTMLVideoElement, timestampMs: number) => FaceSample | null
  close: () => void
}

/** Detection drops for a frame or two on fast head turns; bridge those gaps. */
export const FACE_HOLD_MS = 300

export type FaceSampleHold = {
  update: (sample: FaceSample | null, nowMs: number) => FaceSample | null
  reset: () => void
}

/**
 * Keeps the last detected face for a short window so a missed frame does not
 * make anything anchored to the face blink out and back.
 */
export function createFaceSampleHold(holdMs: number = FACE_HOLD_MS): FaceSampleHold {
  let last: { sample: FaceSample; atMs: number } | null = null

  return {
    update(sample, nowMs) {
      if (sample) {
        last = { sample, atMs: nowMs }
        return sample
      }
      if (last && nowMs - last.atMs <= holdMs) return last.sample
      last = null
      return null
    },
    reset() {
      last = null
    },
  }
}

export type AnimeExpressionKey =
  | 'neutral'
  | 'winkLeft'
  | 'winkRight'
  | 'blink'
  | 'mouth'
  | 'winkLeftMouth'
  | 'winkRightMouth'
  | 'blinkMouth'

const LEFT_CLOSED = new Set<AnimeExpressionKey>([
  'winkLeft', 'blink', 'winkLeftMouth', 'blinkMouth',
])
const RIGHT_CLOSED = new Set<AnimeExpressionKey>([
  'winkRight', 'blink', 'winkRightMouth', 'blinkMouth',
])
const MOUTH_OPEN = new Set<AnimeExpressionKey>([
  'mouth', 'winkLeftMouth', 'winkRightMouth', 'blinkMouth',
])

function landmarkPoint(
  landmarks: Array<{ x: number; y: number }>,
  index: number,
  width: number,
  height: number,
): Point {
  const p = landmarks[index]
  return { x: p.x * width, y: p.y * height }
}

export function poseFromLandmarks(
  landmarks: Array<{ x: number; y: number }>,
  videoWidth: number,
  videoHeight: number,
): FacePose | null {
  if (landmarks.length < 300) return null

  const leftEye = landmarkPoint(landmarks, LEFT_EYE_OUTER, videoWidth, videoHeight)
  const rightEye = landmarkPoint(landmarks, RIGHT_EYE_OUTER, videoWidth, videoHeight)
  const nose = landmarkPoint(landmarks, NOSE_TIP, videoWidth, videoHeight)
  const chin = landmarkPoint(landmarks, CHIN, videoWidth, videoHeight)
  const forehead = landmarkPoint(landmarks, FOREHEAD, videoWidth, videoHeight)

  const eyeSpan = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y)
  if (eyeSpan < 1) return null

  const eyeMidX = (leftEye.x + rightEye.x) * 0.5
  const eyeMidY = (leftEye.y + rightEye.y) * 0.5
  const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y)
  const width = eyeSpan * 2.35
  const height = Math.max(faceHeight * 1.15, width * 1.15)
  const rotation = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x)

  return {
    center: {
      x: eyeMidX * 0.35 + nose.x * 0.65,
      y: eyeMidY * 0.25 + (forehead.y + chin.y) * 0.375,
    },
    width,
    height,
    rotation,
  }
}

function scoreByName(
  categories: Array<{ categoryName?: string; score?: number }> | undefined,
  name: string,
): number {
  if (!categories) return 0
  const hit = categories.find((c) => c.categoryName === name)
  return typeof hit?.score === 'number' ? hit.score : 0
}

export function expressionFromBlendshapes(
  categories: Array<{ categoryName?: string; score?: number }> | undefined,
): FaceExpression {
  return {
    blinkLeft: scoreByName(categories, 'eyeBlinkLeft'),
    blinkRight: scoreByName(categories, 'eyeBlinkRight'),
    jawOpen: scoreByName(categories, 'jawOpen'),
  }
}

function held(score: number, wasOn: boolean, on: number, off: number): boolean {
  if (score >= on) return true
  if (score <= off) return false
  return wasOn
}

/** Hysteresis keeps each expression channel from flickering around its threshold. */
export function selectAnimeExpression(
  expression: FaceExpression,
  previous: AnimeExpressionKey = 'neutral',
): AnimeExpressionKey {
  const leftClosed = held(expression.blinkLeft, LEFT_CLOSED.has(previous), 0.5, 0.22)
  const rightClosed = held(expression.blinkRight, RIGHT_CLOSED.has(previous), 0.5, 0.22)
  const mouthOpen = held(expression.jawOpen, MOUTH_OPEN.has(previous), 0.35, 0.15)

  if (leftClosed && rightClosed) return mouthOpen ? 'blinkMouth' : 'blink'
  if (leftClosed) return mouthOpen ? 'winkLeftMouth' : 'winkLeft'
  if (rightClosed) return mouthOpen ? 'winkRightMouth' : 'winkRight'
  if (mouthOpen) return 'mouth'
  return 'neutral'
}

export async function createFaceTracker(): Promise<FaceTracker> {
  const vision = await FilesetResolver.forVisionTasks(WASM)
  const landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
  })

  return {
    detect(video, timestampMs) {
      if (video.readyState < 2) return null
      const result = landmarker.detectForVideo(video, timestampMs)
      const landmarks = result.faceLandmarks[0]
      if (!landmarks) return null
      const pose = poseFromLandmarks(
        landmarks,
        video.videoWidth,
        video.videoHeight,
      )
      if (!pose) return null
      const categories = result.faceBlendshapes[0]?.categories
      return {
        pose,
        expression: expressionFromBlendshapes(categories),
      }
    },
    close() {
      landmarker.close()
    },
  }
}
