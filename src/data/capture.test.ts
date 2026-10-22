import { describe, expect, it, vi } from 'vitest'
import { MAX_IMAGE_BYTES, validateCapture, validateImages, validatedRoom, validateMediaBudget } from './capture'
import { EVIDENCE_ARCHIVE_LIMITS } from './archive'

// A complete 1 × 1 PNG, including IHDR, IDAT and IEND chunks.
export const PNG_BYTES = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='), (char) => char.charCodeAt(0))

describe('capture validation', () => {
  it('keeps aggregate project media within the shared archive byte and record budgets', () => {
    const limits = EVIDENCE_ARCHIVE_LIMITS
    expect(() => validateMediaBudget([{ blob: { size: limits.maxTotalMediaBytes - 1 } }], [{ size: 1 }], limits)).not.toThrow()
    expect(() => validateMediaBudget([{ blob: { size: limits.maxTotalMediaBytes } }], [{ size: 1 }], limits)).toThrow('archive limit')
    expect(() => validateMediaBudget(Array.from({ length: limits.maxMediaRecords }, () => ({ blob: { size: 1 } })), [{ size: 1 }], limits)).toThrow('archive limit')
  })
  it('trims rooms and rejects empty or duplicate names ignoring case', () => {
    expect(validatedRoom('  Study  ', ['Kitchen'])).toBe('Study')
    expect(() => validatedRoom(' ', [])).toThrow('Enter a room')
    expect(() => validatedRoom(' kitchen ', ['Kitchen'])).toThrow('already listed')
  })
  it('rejects a baseline from a different room', () => {
    const observation = { id: 'a', projectId: 'p', room: 'Kitchen', phase: 'move-in' as const, title: 'A', notes: '', recordedAt: '2026-01-01T00:00:00Z' }
    expect(() => validateCapture('Bath', 'move-out', 'a', ['Bath', 'Kitchen'], [observation])).toThrow('matching move-in')
    expect(() => validateCapture('Kitchen', 'move-out', 'a', ['Kitchen'], [observation])).not.toThrow()
  })
  it('requires a decoder to accept each supported raster original', async () => {
    const decode = vi.fn(async () => {})
    const file = new File([PNG_BYTES], 'small.png', { type: 'image/png' })
    await validateImages([file], decode)
    expect(decode).toHaveBeenCalledWith(file)
    await expect(validateImages([file], async () => { throw new Error('decode failed') })).rejects.toThrow('cannot decode')
  })
  it('rejects SVG, oversized and excess files before decoding', async () => {
    const decode = vi.fn(async () => {})
    await expect(validateImages([new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' })], decode)).rejects.toThrow('SVG uploads')
    await expect(validateImages([new File(['<svg/>'], 'disguised.png', { type: 'image/png' })], decode)).rejects.toThrow('not a supported raster')
    await expect(validateImages([new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'big.png', { type: 'image/png' })], decode)).rejects.toThrow('25 MB')
    await expect(validateImages(Array.from({ length: 11 }, () => new File([PNG_BYTES], 'small.png', { type: 'image/png' })), decode)).rejects.toThrow('up to 10')
    expect(decode).not.toHaveBeenCalled()
  })
})
