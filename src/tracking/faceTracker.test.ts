import { describe, expect, it } from 'vitest'
import { poseFromLandmarks } from './faceTracker'

function blankMesh() {
  return Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
}

describe('poseFromLandmarks', () => {
  it('returns null for incomplete meshes', () => {
    expect(poseFromLandmarks([{ x: 0.1, y: 0.1 }], 1000, 1000)).toBeNull()
  })

  it('estimates face center size and rotation from key landmarks', () => {
    const mesh = blankMesh()
    mesh[33] = { x: 0.4, y: 0.42 } // left eye outer
    mesh[263] = { x: 0.6, y: 0.42 } // right eye outer
    mesh[1] = { x: 0.5, y: 0.5 } // nose
    mesh[10] = { x: 0.5, y: 0.3 } // forehead
    mesh[152] = { x: 0.5, y: 0.7 } // chin

    const pose = poseFromLandmarks(mesh, 1000, 1000)
    expect(pose).not.toBeNull()
    expect(pose!.width).toBeCloseTo(200 * 2.35, 0)
    expect(pose!.height).toBeGreaterThan(pose!.width)
    expect(pose!.rotation).toBeCloseTo(0, 2)
    expect(pose!.center.x).toBeGreaterThan(450)
    expect(pose!.center.x).toBeLessThan(550)
  })
})
