import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'
import JSZip from 'jszip'

// Synthetic raster files keep shared browser tests independent of personal data.
const output = new URL('../public/test-fixtures/', import.meta.url)
await mkdir(output, { recursive: true })

function crc32(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) {
    value ^= byte
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
  }
  return (value ^ 0xffffffff) >>> 0
}

function chunk(name, bytes) {
  const type = Buffer.from(name)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(bytes.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([type, bytes])))
  return Buffer.concat([length, type, bytes, checksum])
}

function image(rgb) {
  const size = 64
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 2
  const pixels = Buffer.alloc(size * (size * 3 + 1))
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const offset = row * (size * 3 + 1) + 1 + col * 3
      const stripe = col > 24 && col < 40 && row > 16 && row < 48
      rgb.forEach((value, channel) => { pixels[offset + channel] = stripe ? Math.max(0, value - 65) : value })
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}

const arrival = image([155, 181, 156])
const departure = image([203, 162, 124])
await writeFile(new URL('arrival.png', output), arrival)
await writeFile(new URL('departure.png', output), departure)

const projectId = 'synthetic-fixture-project'
const manifest = {
  version: 1,
  project: { id: projectId, name: 'RoomTrace synthetic fixture', address: 'Fictional test property', createdAt: '2026-10-16T10:00:00.000Z', rooms: ['Kitchen'] },
  observations: [
    { id: 'fixture-arrival', projectId, room: 'Kitchen', phase: 'move-in', title: 'Synthetic arrival photo', notes: 'Fictional image for automated tests.', recordedAt: '2026-10-16T10:05:00.000Z' },
    { id: 'fixture-departure', projectId, room: 'Kitchen', phase: 'move-out', title: 'Synthetic departure photo', notes: 'Fictional image for automated tests.', recordedAt: '2026-10-22T10:05:00.000Z', baselineId: 'fixture-arrival' },
  ],
  media: [
    { id: 'fixture-arrival-media', projectId, observationId: 'fixture-arrival', fileName: 'arrival.png', mimeType: 'image/png', sha256: createHash('sha256').update(arrival).digest('hex'), path: 'media/fixture-arrival.png' },
    { id: 'fixture-departure-media', projectId, observationId: 'fixture-departure', fileName: 'departure.png', mimeType: 'image/png', sha256: createHash('sha256').update(departure).digest('hex'), path: 'media/fixture-departure.png' },
  ],
}

function packet() {
  return new JSZip().file('manifest.json', JSON.stringify(manifest, null, 2)).file(manifest.media[0].path, arrival).file(manifest.media[1].path, departure)
}

await writeFile(new URL('valid-archive.zip', output), await packet().generateAsync({ type: 'nodebuffer' }))
const changedBytes = Buffer.from(arrival)
changedBytes[changedBytes.length - 1] ^= 1
await writeFile(new URL('corrupt-media.zip', output), await packet().file(manifest.media[0].path, changedBytes).generateAsync({ type: 'nodebuffer' }))
await writeFile(new URL('missing-media.zip', output), await packet().remove(manifest.media[1].path).generateAsync({ type: 'nodebuffer' }))
console.log('Created two synthetic PNGs and three archive fixtures.')
