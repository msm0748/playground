import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const sharp = require('/Users/seokmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp')

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Usage: node scripts/remove-magenta-background.mjs <input.png> <output.png>')

const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true })
const channels = info.channels
const out = Buffer.alloc(info.width * info.height * 4)
const key = [245, 0, 225]

for (let i = 0; i < info.width * info.height; i += 1) {
  const source = i * channels
  const target = i * 4
  const r = data[source]
  const g = data[source + 1]
  const b = data[source + 2]
  const distance = Math.hypot(r - key[0], g - key[1], b - key[2])
  const alpha = distance < 85 ? 0 : distance < 135 ? Math.round(((distance - 85) / 50) * 255) : 255
  out[target] = r
  out[target + 1] = g
  out[target + 2] = b
  out[target + 3] = alpha
}

await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(output)
console.log(`Wrote ${output}`)
