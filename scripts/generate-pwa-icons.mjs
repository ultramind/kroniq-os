import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const output = new URL('../public/icons/', import.meta.url)
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

function crc32(data) {
  let crc = 0xffffffff
  for (const value of data) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const scale = size / 256
  const fill = (x, y, width, height, color) => {
    const left = Math.round(x * scale)
    const top = Math.round(y * scale)
    const right = Math.round((x + width) * scale)
    const bottom = Math.round((y + height) * scale)
    for (let row = top; row < bottom; row += 1)
      for (let column = left; column < right; column += 1) {
        const index = (row * size + column) * 4
        pixels[index] = color[0]
        pixels[index + 1] = color[1]
        pixels[index + 2] = color[2]
        pixels[index + 3] = 255
      }
  }
  fill(0, 0, 256, 256, [11, 17, 33])
  fill(61, 61, 134, 134, [255, 255, 255])
  fill(87, 86, 82, 20, [11, 17, 33])
  fill(87, 120, 82, 15, [11, 17, 33])
  fill(87, 149, 46, 15, [11, 17, 33])
  const centerX = 155 * scale
  const centerY = 156 * scale
  const radius = 13 * scale
  for (let row = Math.floor(centerY - radius); row <= Math.ceil(centerY + radius); row += 1)
    for (let column = Math.floor(centerX - radius); column <= Math.ceil(centerX + radius); column += 1)
      if ((column - centerX) ** 2 + (row - centerY) ** 2 <= radius ** 2) {
        const index = (row * size + column) * 4
        pixels[index] = 203
        pixels[index + 1] = 213
        pixels[index + 2] = 225
        pixels[index + 3] = 255
      }

  const rows = Buffer.alloc((size * 4 + 1) * size)
  for (let row = 0; row < size; row += 1) {
    const offset = row * (size * 4 + 1)
    rows[offset] = 0
    pixels.copy(rows, offset + 1, row * size * 4, (row + 1) * size * 4)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(output, { recursive: true })
for (const [name, size] of [
  ['kroniqos-192.png', 192],
  ['kroniqos-512.png', 512],
  ['apple-touch-icon.png', 180],
])
  writeFileSync(new URL(name, output), drawIcon(size))
