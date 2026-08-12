import { createRequire } from 'node:module'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const sharp = require('/Users/seokmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')

const dir = 'public/vtuber-witch'
const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
const generatedExpressionVariants = manifest.variants.eyes.filter((variant) => variant !== 'open')
const facialVariants = ['neutral', ...generatedExpressionVariants]
const files = [
  'witch-composite.webp',
  'witch-hair-back.webp',
  'witch-body.webp',
  'witch-face-base.webp',
  'witch-ear.webp',
  'witch-hair-front.webp',
  'witch-hat.webp',
  'witch-accessory.webp',
  ...generatedExpressionVariants.map((variant) => `witch-expression-${variant}.webp`),
  ...manifest.variants.eyes.flatMap((variant) => [
    `witch-eye-left-${variant}.webp`,
    `witch-eye-right-${variant}.webp`,
  ]),
  ...facialVariants.flatMap((variant) => [
    `witch-eyebrow-${variant}.webp`,
    `witch-mouth-${variant}.webp`,
  ]),
  'witch-eyebrow-raised.webp',
  'witch-eyebrow-angry.webp',
  'witch-eyebrow-sad.webp',
  'witch-mouth-open.webp',
  'witch-mouth-small-o.webp',
]

const uniqueFiles = [...new Set(files)]
for (const name of uniqueFiles) {
  const path = join(dir, name)
  await access(path)
  const metadata = await sharp(path).metadata()
  if (metadata.format !== 'webp') throw new Error(`${name}: expected webp, got ${metadata.format}`)
  if (metadata.width !== manifest.canvas.width || metadata.height !== manifest.canvas.height) {
    throw new Error(`${name}: expected ${manifest.canvas.width}x${manifest.canvas.height}, got ${metadata.width}x${metadata.height}`)
  }
  if (!metadata.hasAlpha) throw new Error(`${name}: missing alpha channel`)
}

await sharp(join(dir, 'witch-composite.webp')).webp({ quality: 96, alphaQuality: 100 }).toFile(join(dir, 'witch-preview.webp'))
console.log(`Verified ${uniqueFiles.length} WebP files and wrote witch-preview.webp.`)
