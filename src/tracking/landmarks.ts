export const WRIST = 0
export const THUMB_IP = 3
export const THUMB_TIP = 4
export const INDEX_TIP = 8
export const INDEX_PIP = 6
export const MIDDLE_TIP = 12
export const MIDDLE_PIP = 10
export const RING_TIP = 16
export const RING_PIP = 14
export const PINKY_TIP = 20
export const PINKY_PIP = 18

export function dist2(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}
