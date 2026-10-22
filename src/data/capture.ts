import type { Observation } from './models'

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024

export function validateMediaBudget(existing: { blob: { size: number } }[], incoming: { size: number }[], limits: { maxMediaRecords: number; maxTotalMediaBytes: number }) {
  const totalBytes = existing.reduce((sum, item) => sum + item.blob.size, 0) + incoming.reduce((sum, item) => sum + item.size, 0)
  if (existing.length + incoming.length > limits.maxMediaRecords || totalBytes > limits.maxTotalMediaBytes) {
    throw new Error('This journal would exceed the archive limit of 240 MiB or 5,000 original files. Start another journal to keep every export portable.')
  }
}

export function validatedRoom(name: string, existing: string[]): string {
  const room = name.trim()
  if (!room) throw new Error('Enter a room name.')
  if (existing.some((item) => item.trim().toLocaleLowerCase() === room.toLocaleLowerCase())) throw new Error('That room is already listed.')
  return room
}

export function validateCapture(room: string, phase: string, baselineId: string | undefined, rooms: string[], observations: Observation[]) {
  if (!rooms.includes(room)) throw new Error('Add and choose a room before saving a record.')
  if (phase === 'move-out' && !observations.some((item) => item.id === baselineId && item.room === room && item.phase === 'move-in')) {
    throw new Error('Choose a matching move-in record for this room.')
  }
}

export async function validateImages(files: File[], decode = decodeImage): Promise<void> {
  if (!files.length) throw new Error('Add at least one original photo.')
  if (files.length > 10) throw new Error('Choose up to 10 images per record.')
  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type)) throw new Error(`${file.name}: choose PNG, JPEG, WebP, GIF or AVIF images. SVG uploads are not supported.`)
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name}: each photo must be 25 MB or smaller.`)
    const header = new Uint8Array(await file.slice(0, 64).arrayBuffer())
    if (!hasRasterSignature(header, file.type)) throw new Error(`${file.name}: this file is not a supported raster image. Choose an undamaged PNG, JPEG, WebP, GIF or AVIF photo.`)
    try { await decode(file) } catch { throw new Error(`${file.name}: this browser cannot decode the image. Choose a supported, undamaged photo.`) }
  }
}

function hasRasterSignature(bytes: Uint8Array, type: string): boolean {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  if (type === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(text(0, 6))
  if (type === 'image/webp') return text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP'
  if (type === 'image/avif') return text(4, 8) === 'ftyp' && Array.from({ length: Math.floor((bytes.length - 8) / 4) }, (_, index) => text(8 + index * 4, 12 + index * 4)).some((brand) => brand === 'avif' || brand === 'avis')
  return false
}

export async function decodeImage(file: Blob): Promise<void> {
  const url = URL.createObjectURL(file)
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image()
      image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0 ? resolve() : reject(new Error('Empty image'))
      image.onerror = () => reject(new Error('Invalid image'))
      image.src = url
    })
  } finally { URL.revokeObjectURL(url) }
}
