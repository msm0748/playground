export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export type GesturePhase = 'idle' | 'active' | 'fading'

export type GestureResult = {
  phase: GesturePhase
  rect: Rect | null
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
