import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
const sharp = require('/Users/seokmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')
const transparent = { r: 0, g: 0, b: 0, alpha: 0 }
const source = sharp('tmp/imagegen/witch-extra-transparent.png')
const panels = [
  ['raised', 0, 0],
  ['angry', 512, 0],
  ['sad', 0, 512],
  ['small-o', 512, 512],
]
for (const [name, left, top] of panels) {
  const panel = source.clone().extract({ left, top, width: 512, height: 512 }).resize(1024, 1024)
  await panel.clone().extract({ left: 390, top: 410, width: 260, height: 90 }).extend({ top: 410, bottom: 524, left: 390, right: 374, background: transparent }).webp({ quality: 96, alphaQuality: 100 }).toFile(join('public/vtuber-witch', `witch-eyebrow-${name}.webp`))
  await panel.clone().extract({ left: 480, top: 535, width: 90, height: 70 }).extend({ top: 535, bottom: 419, left: 480, right: 454, background: transparent }).webp({ quality: 96, alphaQuality: 100 }).toFile(join('public/vtuber-witch', `witch-mouth-${name}.webp`))
  if (name === 'angry') {
    await panel.clone().extract({ left: 480, top: 535, width: 90, height: 70 }).extend({ top: 535, bottom: 419, left: 480, right: 454, background: transparent }).webp({ quality: 96, alphaQuality: 100 }).toFile(join('public/vtuber-witch', 'witch-mouth-open.webp'))
  }
}
console.log('Wrote raised, angry, sad, and small-o facial variants.')
