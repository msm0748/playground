import { extend } from '@pixi/react'
import { Container, Graphics, Sprite } from 'pixi.js'

let registered = false

export function registerPixi(): void {
  if (registered) {
    return
  }

  extend({ Container, Graphics, Sprite })
  registered = true
}
