import { Application, useApplication } from '@pixi/react'
import {
  Graphics,
  Texture,
} from 'pixi.js'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createHandTracker, type HandTracker } from '../tracking/handTracker'
import { createFrameGesture } from '../tracking/frameGesture'
import type {
  FilterSettings,
  GesturePhase,
  GestureResult,
  Rect,
} from '../types'
import { CellShadeFilter } from './CellShadeFilter'
import { registerPixi } from './extendPixi'

registerPixi()

type CoverLayout = {
  scale: number
  offsetX: number
  offsetY: number
}

type HandFrameStageProps = {
  videoRef: RefObject<HTMLVideoElement | null>
  settings: FilterSettings
  paused: boolean
  onPhaseChange?: (phase: GesturePhase) => void
  onTrackerError?: (message: string) => void
}

type StageContentProps = Omit<HandFrameStageProps, 'videoRef'> & {
  video: HTMLVideoElement
}

const IDLE_GESTURE: GestureResult = {
  phase: 'idle',
  rect: null,
  alpha: 0,
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

export function mapRectToStage(
  rect: Rect,
  videoWidth: number,
  layout: CoverLayout,
  mirror: boolean,
): Rect {
  const sourceX = mirror
    ? videoWidth - rect.x - rect.width
    : rect.x

  return {
    x: layout.offsetX + sourceX * layout.scale,
    y: layout.offsetY + rect.y * layout.scale,
    width: rect.width * layout.scale,
    height: rect.height * layout.scale,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '손 추적 모델을 불러올 수 없습니다'
}

function StageContent({
  video,
  settings,
  paused,
  onPhaseChange,
  onTrackerError,
}: StageContentProps) {
  const { app } = useApplication()
  const [gesture, setGesture] = useState<GestureResult>(IDLE_GESTURE)
  const [mask, setMask] = useState<Graphics | null>(null)
  const settingsRef = useRef(settings)
  const pausedRef = useRef(paused)
  const phaseCallbackRef = useRef(onPhaseChange)
  const errorCallbackRef = useRef(onTrackerError)
  const texture = useMemo(() => Texture.from(video, true), [video])
  const filter = useMemo(() => new CellShadeFilter(), [])
  const filters = useMemo(() => [filter], [filter])

  settingsRef.current = settings
  pausedRef.current = paused
  phaseCallbackRef.current = onPhaseChange
  errorCallbackRef.current = onTrackerError

  useEffect(() => {
    return () => {
      texture.destroy(true)
      filter.destroy()
    }
  }, [filter, texture])

  useEffect(() => {
    let cancelled = false
    let animationFrameId: number | null = null
    let tracker: HandTracker | null = null
    let lastPhase: GesturePhase = 'idle'
    const frameGesture = createFrameGesture()

    const runFrame = (nowMs: number) => {
      if (cancelled || !tracker) return

      if (
        !pausedRef.current &&
        document.visibilityState === 'visible' &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      ) {
        try {
          texture.source.update()
          const hands = tracker.detect(video, nowMs)
          const nextGesture = frameGesture.update(
            hands,
            { width: video.videoWidth, height: video.videoHeight },
            nowMs,
          )
          const currentSettings = settingsRef.current
          filter.levels = currentSettings.levels
          filter.edgeStrength = currentSettings.edgeStrength
          filter.tint = currentSettings.tint
          filter.setTexel(video.videoWidth, video.videoHeight)
          setGesture(nextGesture)

          if (nextGesture.phase !== lastPhase) {
            lastPhase = nextGesture.phase
            phaseCallbackRef.current?.(nextGesture.phase)
          }
        } catch (error) {
          errorCallbackRef.current?.(errorMessage(error))
          frameGesture.reset()
          setGesture(IDLE_GESTURE)
          tracker.close()
          tracker = null
          return
        }
      }

      animationFrameId = requestAnimationFrame(runFrame)
    }

    void createHandTracker()
      .then((createdTracker) => {
        if (cancelled) {
          createdTracker.close()
          return
        }

        tracker = createdTracker
        phaseCallbackRef.current?.('idle')
        animationFrameId = requestAnimationFrame(runFrame)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          errorCallbackRef.current?.(errorMessage(error))
        }
      })

    return () => {
      cancelled = true
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
      tracker?.close()
      frameGesture.reset()
    }
  }, [filter, texture, video])

  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight
  const stageWidth = app.screen.width
  const stageHeight = app.screen.height
  const layout = getCoverLayout(
    videoWidth,
    videoHeight,
    stageWidth,
    stageHeight,
  )
  const displayRect =
    gesture.rect && videoWidth > 0
      ? mapRectToStage(gesture.rect, videoWidth, layout, settings.mirror)
      : null
  const spriteScale = {
    x: layout.scale * (settings.mirror ? -1 : 1),
    y: layout.scale,
  }

  const drawMask = useCallback(
    (graphics: Graphics) => {
      graphics.clear()
      if (!displayRect) return
      graphics
        .rect(
          displayRect.x,
          displayRect.y,
          displayRect.width,
          displayRect.height,
        )
        .fill({ color: 0xffffff })
    },
    [displayRect],
  )

  const drawBorder = useCallback(
    (graphics: Graphics) => {
      graphics.clear()
      if (!displayRect) return
      graphics
        .rect(
          displayRect.x,
          displayRect.y,
          displayRect.width,
          displayRect.height,
        )
        .stroke({ color: 0xffffff, width: 3 })
    },
    [displayRect],
  )

  return (
    <>
      <pixiSprite
        texture={texture}
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
      <pixiSprite
        texture={texture}
        anchor={0.5}
        x={stageWidth / 2}
        y={stageHeight / 2}
        scale={spriteScale}
        filters={filters}
        mask={mask}
        alpha={gesture.alpha}
        visible={gesture.phase !== 'idle'}
      />
      <pixiGraphics
        draw={drawBorder}
        alpha={gesture.alpha}
        visible={gesture.phase !== 'idle'}
      />
    </>
  )
}

export function HandFrameStage({
  videoRef,
  settings,
  paused,
  onPhaseChange,
  onTrackerError,
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
        resolution={window.devicePixelRatio}
      >
        {video && (
          <StageContent
            video={video}
            settings={settings}
            paused={paused}
            onPhaseChange={onPhaseChange}
            onTrackerError={onTrackerError}
          />
        )}
      </Application>
    </div>
  )
}
