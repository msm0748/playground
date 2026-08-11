#!/usr/bin/env node
/**
 * Converts the generated anime face PNGs into the WebP files the app loads.
 *
 * The Swift generator stays the source of truth: it writes reproducible PNGs
 * into public/, and this step re-encodes them. Alpha is kept lossless so the
 * overlay never gains a halo over the video; only RGB is compressed, which on
 * this flat-shaded art costs ~1/255 mean error for roughly a fifth of the bytes.
 *
 * Usage: node scripts/build-anime-face-webp.mjs [--lossless]
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const PUBLIC_DIR = 'public'
const PREFIX = 'anime-face-'
const ENCODE_OPTIONS = process.argv.includes('--lossless')
  ? { lossless: true, effort: 6 }
  : { quality: 95, alphaQuality: 100, effort: 6 }

function kilobytes(bytes) {
  return `${(bytes / 1024).toFixed(0)}KB`
}

const entries = await readdir(PUBLIC_DIR)
const sources = entries
  .filter((name) => name.startsWith(PREFIX) && name.endsWith('.png'))
  .sort()

if (sources.length === 0) {
  console.error(
    `No ${PREFIX}*.png found in ${PUBLIC_DIR}/. Run "pnpm assets:anime" first.`,
  )
  process.exit(1)
}

let sourceBytes = 0
let outputBytes = 0

for (const name of sources) {
  const source = join(PUBLIC_DIR, name)
  const target = source.replace(/\.png$/, '.webp')
  const encoded = await sharp(await readFile(source)).webp(ENCODE_OPTIONS).toBuffer()
  await writeFile(target, encoded)

  const before = (await stat(source)).size
  sourceBytes += before
  outputBytes += encoded.length
  console.log(
    `${name} ${kilobytes(before)} → ${kilobytes(encoded.length)} ` +
      `(-${Math.round((1 - encoded.length / before) * 100)}%)`,
  )
}

console.log(
  `\n${sources.length} files: ${kilobytes(sourceBytes)} → ${kilobytes(outputBytes)} ` +
    `(-${Math.round((1 - outputBytes / sourceBytes) * 100)}%)`,
)
