import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const sharp = require('/Users/seokmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')

const outDir = 'public/vtuber-witch'
const source = 'tmp/imagegen/witch-transparent.png'
const expressionSource = 'tmp/imagegen/witch-expressions-transparent.png'
const transparent = { r: 0, g: 0, b: 0, alpha: 0 }

await mkdir(outDir, { recursive: true })

const base = sharp(source).resize(1024, 1024, { fit: 'fill' })
await base.clone().webp({ quality: 96, alphaQuality: 100 }).toFile(join(outDir, 'witch-composite.webp'))

async function cropToCanvas(name, left, top, width, height) {
  await base
    .clone()
    .extract({ left, top, width, height })
    .extend({
      top,
      bottom: 1024 - top - height,
      left,
      right: 1024 - left - width,
      background: transparent,
    })
    .webp({ quality: 96, alphaQuality: 100 })
    .toFile(join(outDir, `${name}.webp`))
}

await cropToCanvas('witch-hat', 100, 0, 820, 360)
await cropToCanvas('witch-hair-back', 180, 260, 760, 620)
await cropToCanvas('witch-body', 280, 470, 470, 540)
await cropToCanvas('witch-face-base', 300, 300, 430, 300)
await cropToCanvas('witch-ear', 300, 410, 430, 120)
await cropToCanvas('witch-hair-front', 270, 245, 500, 300)
await cropToCanvas('witch-accessory', 600, 160, 190, 190)
await cropToCanvas('witch-eye-left-open', 405, 455, 90, 90)
await cropToCanvas('witch-eye-right-open', 540, 455, 90, 90)
await cropToCanvas('witch-eyebrow-neutral', 390, 410, 260, 90)
await cropToCanvas('witch-mouth-neutral', 480, 535, 90, 70)

const expression = sharp(expressionSource)
const variants = [
  ['neutral', 0, 0],
  ['blink', 512, 0],
  ['wink-left', 1024, 0],
  ['wink-right', 0, 512],
  ['happy', 512, 512],
  ['surprised', 1024, 512],
]

for (const [name, left, top] of variants) {
  const panel = expression.clone().extract({ left, top, width: 512, height: 512 }).resize(1024, 1024)
  await panel.clone().webp({ quality: 96, alphaQuality: 100 }).toFile(join(outDir, `witch-expression-${name}.webp`))
  await panel.clone().extract({ left: 405, top: 455, width: 90, height: 90 }).extend({ top: 455, bottom: 479, left: 405, right: 529, background: transparent }).webp({ quality: 96, alphaQuality: 100 }).toFile(join(outDir, `witch-eye-left-${name}.webp`))
  await panel.clone().extract({ left: 540, top: 455, width: 90, height: 90 }).extend({ top: 455, bottom: 479, left: 540, right: 394, background: transparent }).webp({ quality: 96, alphaQuality: 100 }).toFile(join(outDir, `witch-eye-right-${name}.webp`))
  await panel.clone().extract({ left: 390, top: 410, width: 260, height: 90 }).extend({ top: 410, bottom: 524, left: 390, right: 374, background: transparent }).webp({ quality: 96, alphaQuality: 100 }).toFile(join(outDir, `witch-eyebrow-${name}.webp`))
  await panel.clone().extract({ left: 480, top: 535, width: 90, height: 70 }).extend({ top: 535, bottom: 419, left: 480, right: 454, background: transparent }).webp({ quality: 96, alphaQuality: 100 }).toFile(join(outDir, `witch-mouth-${name}.webp`))
}

console.log('Wrote witch VTuber base and expression assets.')
