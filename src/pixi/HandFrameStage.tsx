import { Application, useApplication } from '@pixi/react'
import { Assets, Graphics, Texture, VideoSource } from 'pixi.js'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import {
  createFaceTracker,
  selectAnimeExpression,
  type AnimeExpressionKey,
  type FacePose,
  type FaceSample,
  type FaceTracker,
} from '../tracking/faceTracker'
import { createFrameGesture } from '../tracking/frameGesture'
import { createHandTracker, type HandTracker } from '../tracking/handTracker'
import type {
  FilterMode,
  FilterSettings,
  GesturePhase,
  GestureResult,
  Point,
  Quad,
} from '../types'
import { AsciiArtFilter } from './AsciiArtFilter'
import { CellShadeFilter } from './CellShadeFilter'
import { registerPixi } from './extendPixi'
import { PromptCelFilter } from './PromptCelFilter'

registerPixi()

export const ANIME_FACE_ASSETS: Record<AnimeExpressionKey, string> = {
  neutral: '/anime-face-overlay.webp?v=1',
  blink: '/anime-face-eyes-closed.webp?v=1',
  mouth: '/anime-face-mouth-open.webp?v=1',
  blinkMouth: '/anime-face-blink-mouth.webp?v=1',
  winkLeft: '/anime-face-wink-left.webp?v=1',
  winkRight: '/anime-face-wink-right.webp?v=1',
  winkLeftMouth: '/anime-face-wink-left-mouth.webp?v=1',
  winkRightMouth: '/anime-face-wink-right-mouth.webp?v=1',
}

type CoverLayout = {
  scale: number
  offsetX: number
  offsetY: number
}

export type HandFrameStageProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  mode: FilterMode
  settings: FilterSettings
  paused: boolean
  /** Bumping this recreates the hand tracker without restarting the camera. */
  trackerKey?: number
  /** Bumping this recreates resources owned by the active filter mode. */
  resourceKey?: number
  onPhaseChange?: (phase: GesturePhase) => void
  onHandTrackerError?: (message: string) => void
  onModeResourceError?: (mode: FilterMode, message: string) => void
}

type StageContentProps = Omit<HandFrameStageProps, 'videoRef'> & {
  video: HTMLVideoElement
}

export type ModeResources =
  | {
      mode: 'png'
      filter: CellShadeFilter
      animeTextures: Record<AnimeExpressionKey, Texture>
      releaseTextures: () => Promise<void>
    }
  | { mode: 'prompt'; filter: PromptCelFilter }
  | { mode: 'ascii'; filter: AsciiArtFilter }

type AnimeTextureLoader = (src: string) => Promise<Texture>
type AnimeTextureUnloader = (src: string) => Promise<void>
type FaceTrackerFactory = () => Promise<FaceTracker>

export type AnimeTextureLease = {
  texture: Texture
  release: () => Promise<void>
}

export type AnimeTexturePool = {
  acquire: (src: string) => Promise<AnimeTextureLease>
}

type AnimeTransform = {
  x: number
  y: number
  scale: number
  rotation: number
}

const IDLE_GESTURE: GestureResult = {
  phase: 'idle',
  quad: null,
  alpha: 0,
}

/** Detection hiccups are common while the GPU delegate warms up, so tolerate a few. */
export const MAX_CONSECUTIVE_DETECT_FAILURES = 5

export function capabilitiesForMode(mode: FilterMode): {
  animeAssets: boolean
  faceTracking: boolean
  promptFilter: boolean
  asciiFilter: boolean
} {
  return {
    animeAssets: mode === 'png',
    faceTracking: mode === 'png',
    promptFilter: mode === 'prompt',
    asciiFilter: mode === 'ascii',
  }
}

async function loadAnimeTexture(src: string): Promise<Texture> {
  return (await Assets.load({
    alias: src,
    src,
    data: { alphaMode: 'premultiply-alpha-on-upload' },
  })) as Texture
}

async function unloadAnimeTexture(src: string): Promise<void> {
  await Assets.unload(src)
}

export function createAnimeTexturePool(
  loadTexture: AnimeTextureLoader,
  unloadTexture: AnimeTextureUnloader,
): AnimeTexturePool {
  type Entry = {
    references: number
    loadPromise: Promise<Texture>
    unloadPromise: Promise<void> | null
  }

  const entries = new Map<string, Entry>()

  const releaseEntry = (src: string, entry: Entry): Promise<void> => {
    entry.references -= 1
    if (entry.references > 0) return Promise.resolve()

    const unloadPromise = (async () => {
      try {
        await entry.loadPromise
        await unloadTexture(src)
      } finally {
        if (entries.get(src) === entry) entries.delete(src)
      }
    })()
    entry.unloadPromise = unloadPromise
    return unloadPromise
  }

  return {
    async acquire(src: string): Promise<AnimeTextureLease> {
      while (true) {
        let entry = entries.get(src)
        if (entry?.unloadPromise) {
          try {
            await entry.unloadPromise
          } catch {
            // The retired entry is removed in the unload promise's finally block.
            // Its release caller owns reporting; acquisition can start fresh.
          }
          continue
        }

        if (!entry) {
          entry = {
            references: 0,
            loadPromise: loadTexture(src),
            unloadPromise: null,
          }
          entries.set(src, entry)
        }

        entry.references += 1
        let texture: Texture
        try {
          texture = await entry.loadPromise
        } catch (error) {
          entry.references -= 1
          if (entry.references === 0 && entries.get(src) === entry) {
            entries.delete(src)
          }
          throw error
        }

        let released = false
        return {
          texture,
          release: () => {
            if (released) return Promise.resolve()
            released = true
            return releaseEntry(src, entry)
          },
        }
      }
    },
  }
}

const animeTexturePool = createAnimeTexturePool(
  loadAnimeTexture,
  unloadAnimeTexture,
)

export async function createModeResources(
  mode: FilterMode,
  texturePool: AnimeTexturePool = animeTexturePool,
): Promise<ModeResources> {
  if (mode === 'prompt') {
    return { mode, filter: new PromptCelFilter() }
  }

  if (mode === 'ascii') {
    return { mode, filter: new AsciiArtFilter() }
  }

  const keys = Object.keys(ANIME_FACE_ASSETS) as AnimeExpressionKey[]
  const acquired = await Promise.allSettled(
    keys.map((key) => texturePool.acquire(ANIME_FACE_ASSETS[key])),
  )
  const failed = acquired.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  if (failed) {
    const cleanupResults = await Promise.allSettled(
      acquired.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value.release()] : [],
      ),
    )
    cleanupResults.forEach((result) => {
      if (result.status === 'rejected') {
        reportModeResourceCleanupError(result.reason)
      }
    })
    throw failed.reason
  }

  const leases = acquired.map((result) =>
    (result as PromiseFulfilledResult<AnimeTextureLease>).value,
  )
  const entries = keys.map(
    (key, index) => [key, leases[index].texture] as const,
  )
  let released = false

  return {
    mode,
    filter: new CellShadeFilter(),
    animeTextures: Object.fromEntries(entries) as Record<
      AnimeExpressionKey,
      Texture
    >,
    releaseTextures: async () => {
      if (released) return
      released = true
      await Promise.all(leases.map((lease) => lease.release()))
    },
  }
}

export async function destroyModeResources(
  resources: ModeResources,
): Promise<void> {
  resources.filter.destroy()
  if (resources.mode === 'png') await resources.releaseTextures()
}

function reportModeResourceCleanupError(error: unknown): void {
  console.error('필터 리소스를 해제하지 못했습니다', error)
}

function disposeModeResources(resources: ModeResources): void {
  void destroyModeResources(resources).catch(reportModeResourceCleanupError)
}

export async function createFaceTrackerForMode(
  mode: FilterMode,
  factory: FaceTrackerFactory = createFaceTracker,
): Promise<FaceTracker | null> {
  if (mode !== 'png') return null
  return factory()
}

export function capRenderingResolution(devicePixelRatio: number): number {
  return Math.min(devicePixelRatio, 1.5)
}

export function createDetectFailureGuard(
  limit: number = MAX_CONSECUTIVE_DETECT_FAILURES,
) {
  let consecutive = 0

  return {
    /** Returns true once the failures should be surfaced and tracking stopped. */
    recordFailure(): boolean {
      consecutive += 1
      return consecutive >= limit
    },
    recordSuccess(): void {
      consecutive = 0
    },
  }
}

/**
 * The `<video>` element is owned by `useCamera`, so the texture only borrows it:
 * frames are uploaded manually from the tracking loop and the source is never destroyed.
 */
function createVideoTexture(video: HTMLVideoElement): Texture {
  const source = new VideoSource({ resource: video, autoPlay: false })
  source.autoUpdate = false
  return new Texture({ source })
}

function releaseVideoTexture(texture: Texture): void {
  const source = texture.source
  if (source instanceof VideoSource) {
    source.autoUpdate = false
  }
  texture.destroy(false)
}

export function getCoverLayout(
  videoWidth: number,
  videoHeight: number,
  stageWidth: number,
  stageHeight: number,
): CoverLayout {
  if (
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    stageWidth <= 0 ||
    stageHeight <= 0
  ) {
    return { scale: 1, offsetX: 0, offsetY: 0 }
  }

  const scale = Math.max(stageWidth / videoWidth, stageHeight / videoHeight)
  return {
    scale,
    offsetX: (stageWidth - videoWidth * scale) / 2,
    offsetY: (stageHeight - videoHeight * scale) / 2,
  }
}

function mapPointToStage(
  point: Point,
  videoWidth: number,
  layout: CoverLayout,
  mirror: boolean,
): Point {
  const sourceX = mirror ? videoWidth - point.x : point.x
  return {
    x: layout.offsetX + sourceX * layout.scale,
    y: layout.offsetY + point.y * layout.scale,
  }
}

export function mapQuadToStage(
  quad: Quad,
  videoWidth: number,
  layout: CoverLayout,
  mirror: boolean,
): Quad {
  return {
    points: [
      mapPointToStage(quad.points[0], videoWidth, layout, mirror),
      mapPointToStage(quad.points[1], videoWidth, layout, mirror),
      mapPointToStage(quad.points[2], videoWidth, layout, mirror),
      mapPointToStage(quad.points[3], videoWidth, layout, mirror),
    ],
  }
}

export function animeTransformFromFace(
  face: FacePose,
  animeTexture: Texture,
  videoWidth: number,
  layout: CoverLayout,
  mirror: boolean,
): AnimeTransform {
  const center = mapPointToStage(face.center, videoWidth, layout, mirror)
  const targetWidth = face.width * layout.scale * 1.35
  const scale = targetWidth / Math.max(animeTexture.width, 1)
  return {
    x: center.x,
    y: center.y,
    scale,
    rotation: mirror ? -face.rotation : face.rotation,
  }
}

/** Pads the tracked face box so the shading still covers hair and jawline edges. */
export const FACE_MASK_PADDING = 1.1
const FACE_MASK_SEGMENTS = 48

function edgeIntersection(
  from: Point,
  to: Point,
  fromSide: number,
  toSide: number,
): Point {
  const t = fromSide / (fromSide - toSide)
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  }
}

/**
 * Sutherland–Hodgman clipping. The frame quad is convex, so clipping the polygon
 * against each of its edges in turn yields the intersection of the two shapes.
 */
export function clipPolygonToQuad(polygon: Point[], quad: Quad): Point[] {
  const corners = quad.points
  const signedArea =
    corners.reduce((sum, point, index) => {
      const next = corners[(index + 1) % corners.length]
      return sum + (point.x * next.y - next.x * point.y)
    }, 0) / 2
  if (signedArea === 0) return []
  // Walk the quad in a fixed winding so its interior is always left of every edge.
  const ordered = signedArea > 0 ? [...corners] : [...corners].reverse()

  let output = polygon
  for (let index = 0; index < ordered.length && output.length > 0; index++) {
    const edgeStart = ordered[index]
    const edgeEnd = ordered[(index + 1) % ordered.length]
    const sideOf = (point: Point) =>
      (edgeEnd.x - edgeStart.x) * (point.y - edgeStart.y) -
      (edgeEnd.y - edgeStart.y) * (point.x - edgeStart.x)

    const input = output
    output = []
    for (let i = 0; i < input.length; i++) {
      const current = input[i]
      const previous = input[(i + input.length - 1) % input.length]
      const currentSide = sideOf(current)
      const previousSide = sideOf(previous)

      if (currentSide >= 0) {
        if (previousSide < 0) {
          output.push(
            edgeIntersection(previous, current, previousSide, currentSide),
          )
        }
        output.push(current)
      } else if (previousSide >= 0) {
        output.push(
          edgeIntersection(previous, current, previousSide, currentSide),
        )
      }
    }
  }

  return output
}

/**
 * Stage-space outline of the tracked face, clipped to the hand frame. PNG mode
 * shades only this region so the rest of the framed scene stays untouched.
 */
export function faceMaskPolygon(
  face: FacePose,
  quad: Quad,
  videoWidth: number,
  layout: CoverLayout,
  mirror: boolean,
  segments: number = FACE_MASK_SEGMENTS,
): Point[] {
  const center = mapPointToStage(face.center, videoWidth, layout, mirror)
  const radiusX = face.width * 0.5 * FACE_MASK_PADDING * layout.scale
  const radiusY = face.height * 0.5 * FACE_MASK_PADDING * layout.scale
  const rotation = mirror ? -face.rotation : face.rotation
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  const ellipse: Point[] = []
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2
    const localX = Math.cos(angle) * radiusX
    const localY = Math.sin(angle) * radiusY
    ellipse.push({
      x: center.x + localX * cos - localY * sin,
      y: center.y + localX * sin + localY * cos,
    })
  }

  return clipPolygonToQuad(
    ellipse,
    mapQuadToStage(quad, videoWidth, layout, mirror),
  )
}

export function animeTransformFromQuad(
  quad: Quad,
  animeTexture: Texture,
  videoWidth: number,
  layout: CoverLayout,
  mirror: boolean,
): AnimeTransform {
  const display = mapQuadToStage(quad, videoWidth, layout, mirror)
  const xs = display.points.map((p) => p.x)
  const ys = display.points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const scale = Math.min(
    (width * 1.05) / Math.max(animeTexture.width, 1),
    (height * 1.2) / Math.max(animeTexture.height, 1),
  )
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    scale,
    rotation: 0,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '손 추적 모델을 불러올 수 없습니다'
}

export function StageContent({
  video,
  mode,
  settings,
  paused,
  trackerKey = 0,
  resourceKey = 0,
  onPhaseChange,
  onHandTrackerError,
  onModeResourceError,
}: StageContentProps) {
  const { app } = useApplication()
  const [gesture, setGesture] = useState<GestureResult>(IDLE_GESTURE)
  const [faceSample, setFaceSample] = useState<FaceSample | null>(null)
  const [expressionKey, setExpressionKey] =
    useState<AnimeExpressionKey>('neutral')
  const [mask, setMask] = useState<Graphics | null>(null)
  const [faceMask, setFaceMask] = useState<Graphics | null>(null)
  const [videoTexture, setVideoTexture] = useState<Texture | null>(null)
  const [modeResources, setModeResources] = useState<ModeResources | null>(null)
  const settingsRef = useRef(settings)
  const pausedRef = useRef(paused)
  const modeRef = useRef(mode)
  const modeResourcesRef = useRef(modeResources)
  const faceTrackerRef = useRef<FaceTracker | null>(null)
  const phaseCallbackRef = useRef(onPhaseChange)
  const handErrorCallbackRef = useRef(onHandTrackerError)
  const modeErrorCallbackRef = useRef(onModeResourceError)
  const expressionKeyRef = useRef<AnimeExpressionKey>('neutral')
  const activeModeResources =
    modeResources?.mode === mode ? modeResources : null
  const filters = useMemo(
    () => (activeModeResources ? [activeModeResources.filter] : []),
    [activeModeResources],
  )

  settingsRef.current = settings
  pausedRef.current = paused
  modeRef.current = mode
  modeResourcesRef.current = activeModeResources
  phaseCallbackRef.current = onPhaseChange
  handErrorCallbackRef.current = onHandTrackerError
  modeErrorCallbackRef.current = onModeResourceError

  useEffect(() => {
    const texture = createVideoTexture(video)
    setVideoTexture(texture)

    return () => {
      releaseVideoTexture(texture)
    }
  }, [video])

  useEffect(() => {
    let cancelled = false
    let created: ModeResources | null = null
    setModeResources(null)

    void createModeResources(mode)
      .then((nextResources) => {
        created = nextResources
        if (cancelled) {
          disposeModeResources(nextResources)
          return
        }
        setModeResources(nextResources)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          modeErrorCallbackRef.current?.(mode, errorMessage(error))
        }
      })

    return () => {
      cancelled = true
      if (created) {
        disposeModeResources(created)
      }
    }
  }, [mode, resourceKey])

  useEffect(() => {
    if (mode !== 'png') {
      faceTrackerRef.current?.close()
      faceTrackerRef.current = null
      setFaceSample(null)
      setExpressionKey('neutral')
      expressionKeyRef.current = 'neutral'
      return
    }

    let cancelled = false
    void createFaceTrackerForMode(mode)
      .then((tracker) => {
        if (!tracker) return
        if (cancelled) {
          tracker.close()
          return
        }
        faceTrackerRef.current = tracker
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          modeErrorCallbackRef.current?.(mode, errorMessage(error))
        }
      })

    return () => {
      cancelled = true
      faceTrackerRef.current?.close()
      faceTrackerRef.current = null
    }
  }, [mode, resourceKey, trackerKey])

  useEffect(() => {
    if (!videoTexture) return

    let cancelled = false
    let animationFrameId: number | null = null
    let handTracker: HandTracker | null = null
    let lastPhase: GesturePhase = 'idle'
    const frameGesture = createFrameGesture()
    const failureGuard = createDetectFailureGuard()

    const runFrame = (nowMs: number) => {
      if (cancelled || !handTracker) return

      if (
        !pausedRef.current &&
        document.visibilityState === 'visible' &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        try {
          videoTexture.source.update()
          const hands = handTracker.detect(video, nowMs)
          const nextGesture = frameGesture.update(
            hands,
            { width: video.videoWidth, height: video.videoHeight },
            nowMs,
          )
          const nextFace =
            modeRef.current !== 'png' || nextGesture.phase === 'idle'
              ? null
              : (faceTrackerRef.current?.detect(video, nowMs) ?? null)
          const nextExpression = nextFace
            ? selectAnimeExpression(
                nextFace.expression,
                expressionKeyRef.current,
              )
            : 'neutral'
          expressionKeyRef.current = nextExpression

          const currentResources = modeResourcesRef.current
          if (currentResources?.mode === 'png') {
            const currentSettings = settingsRef.current
            currentResources.filter.levels = currentSettings.levels
            currentResources.filter.edgeStrength = currentSettings.edgeStrength
            currentResources.filter.tint = currentSettings.tint
          }

          setGesture(nextGesture)
          setFaceSample(nextFace)
          setExpressionKey(nextExpression)
          failureGuard.recordSuccess()

          if (nextGesture.phase !== lastPhase) {
            lastPhase = nextGesture.phase
            phaseCallbackRef.current?.(nextGesture.phase)
          }
        } catch (error) {
          if (failureGuard.recordFailure()) {
            handErrorCallbackRef.current?.(errorMessage(error))
            frameGesture.reset()
            setGesture(IDLE_GESTURE)
            setFaceSample(null)
            setExpressionKey('neutral')
            expressionKeyRef.current = 'neutral'
            handTracker.close()
            handTracker = null
            faceTrackerRef.current?.close()
            faceTrackerRef.current = null
            return
          }
        }
      }

      animationFrameId = requestAnimationFrame(runFrame)
    }

    void createHandTracker()
      .then((createdHandTracker) => {
        if (cancelled) {
          createdHandTracker.close()
          return
        }

        handTracker = createdHandTracker
        phaseCallbackRef.current?.('idle')
        animationFrameId = requestAnimationFrame(runFrame)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          handErrorCallbackRef.current?.(errorMessage(error))
        }
      })

    return () => {
      cancelled = true
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
      handTracker?.close()
      frameGesture.reset()
    }
  }, [trackerKey, video, videoTexture])

  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight
  const screen = app.renderer ? app.screen : null
  const stageWidth = screen?.width ?? 0
  const stageHeight = screen?.height ?? 0
  const layout = getCoverLayout(
    videoWidth,
    videoHeight,
    stageWidth,
    stageHeight,
  )
  const displayQuad =
    gesture.quad && videoWidth > 0
      ? mapQuadToStage(gesture.quad, videoWidth, layout, settings.mirror)
      : null
  const spriteScale = {
    x: layout.scale * (settings.mirror ? -1 : 1),
    y: layout.scale,
  }
  const pngResources =
    activeModeResources?.mode === 'png' ? activeModeResources : null
  /** Prompt and ASCII both repaint the whole framed area rather than the face. */
  const fullFrameResources =
    activeModeResources && activeModeResources.mode !== 'png'
      ? activeModeResources
      : null
  const animeTexture =
    pngResources?.animeTextures[expressionKey] ??
    pngResources?.animeTextures.neutral ??
    null
  const facePose = faceSample?.pose ?? null
  const animeTransform =
    pngResources && animeTexture && gesture.quad && videoWidth > 0
      ? facePose
        ? animeTransformFromFace(
            facePose,
            animeTexture,
            videoWidth,
            layout,
            settings.mirror,
          )
        : animeTransformFromQuad(
            gesture.quad,
            animeTexture,
            videoWidth,
            layout,
            settings.mirror,
          )
      : null

  const facePolygon =
    pngResources && facePose && gesture.quad && videoWidth > 0
      ? faceMaskPolygon(
          facePose,
          gesture.quad,
          videoWidth,
          layout,
          settings.mirror,
        )
      : []
  /** PNG mode only shades the face, so without one there is nothing to shade. */
  const faceShadingVisible = gesture.phase !== 'idle' && facePolygon.length >= 3

  const drawMask = useCallback(
    (graphics: Graphics) => {
      graphics.clear()
      if (!displayQuad) return
      const [a, b, c, d] = displayQuad.points
      graphics
        .poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y])
        .fill({ color: 0xffffff })
    },
    [displayQuad],
  )

  const drawFaceMask = useCallback(
    (graphics: Graphics) => {
      graphics.clear()
      if (facePolygon.length < 3) return
      graphics
        .poly(facePolygon.flatMap((point) => [point.x, point.y]))
        .fill({ color: 0xffffff })
    },
    [facePolygon],
  )

  if (!screen || !videoTexture) return null

  return (
    <>
      <pixiSprite
        texture={videoTexture}
        anchor={0.5}
        x={stageWidth / 2}
        y={stageHeight / 2}
        scale={spriteScale}
      />
      <pixiGraphics
        ref={setMask}
        draw={drawMask}
        visible={gesture.phase !== 'idle'}
      />
      {pngResources && (
        <pixiGraphics
          ref={setFaceMask}
          draw={drawFaceMask}
          visible={faceShadingVisible}
        />
      )}
      {pngResources && (
        <pixiSprite
          texture={videoTexture}
          anchor={0.5}
          x={stageWidth / 2}
          y={stageHeight / 2}
          scale={spriteScale}
          filters={filters}
          mask={faceMask}
          alpha={gesture.alpha * 0.35}
          visible={faceShadingVisible && faceMask !== null}
        />
      )}
      {fullFrameResources && (
        <pixiSprite
          texture={videoTexture}
          anchor={0.5}
          x={stageWidth / 2}
          y={stageHeight / 2}
          scale={spriteScale}
          filters={filters}
          mask={mask}
          alpha={gesture.alpha}
          visible={gesture.phase !== 'idle'}
        />
      )}
      {pngResources && animeTexture && animeTransform && (
        <pixiSprite
          texture={animeTexture}
          anchor={0.5}
          x={animeTransform.x}
          y={animeTransform.y}
          scale={{
            x: animeTransform.scale * (settings.mirror ? -1 : 1),
            y: animeTransform.scale,
          }}
          rotation={animeTransform.rotation}
          mask={mask}
          alpha={gesture.alpha}
          visible={gesture.phase !== 'idle'}
        />
      )}
    </>
  )
}

export function HandFrameStage({
  videoRef,
  mode,
  settings,
  paused,
  trackerKey,
  resourceKey,
  onPhaseChange,
  onHandTrackerError,
  onModeResourceError,
}: HandFrameStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const video = videoRef.current

  return (
    <div className="hand-frame-stage" ref={containerRef}>
      <Application
        resizeTo={containerRef}
        backgroundColor={0x111111}
        antialias
        autoDensity
        resolution={capRenderingResolution(window.devicePixelRatio)}
      >
        {video && (
          <StageContent
            video={video}
            mode={mode}
            settings={settings}
            paused={paused}
            trackerKey={trackerKey}
            resourceKey={resourceKey}
            onPhaseChange={onPhaseChange}
            onHandTrackerError={onHandTrackerError}
            onModeResourceError={onModeResourceError}
          />
        )}
      </Application>
    </div>
  )
}
