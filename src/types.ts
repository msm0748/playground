export type Point = {
  x: number
  y: number
}

/** Four corners in order: left-index, right-index, right-thumb, left-thumb. */
export type Quad = {
  points: [Point, Point, Point, Point]
}

export type GesturePhase = 'idle' | 'active' | 'fading'

export type GestureResult = {
  phase: GesturePhase
  quad: Quad | null
  alpha: number
}

export type FilterSettings = {
  levels: number
  edgeStrength: number
  tint: number
  mirror: boolean
}

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  levels: 5,
  edgeStrength: 0.65,
  tint: 0.1,
  mirror: true,
}
