import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyEvidenceArchive } from '../data/archive'

async function fixture(name: string) {
  return new Uint8Array(await readFile(resolve(process.cwd(), 'public/test-fixtures', name)))
}

describe('shared browser fixtures', () => {
  it('provides a verified synthetic packet with an exact comparison pair', async () => {
    const result = await verifyEvidenceArchive(await fixture('valid-archive.zip'))
    expect(result.valid).toBe(true)
    expect(result.observationCount).toBe(2)
    expect(result.mediaCount).toBe(2)
  })

  it.each(['corrupt-media.zip', 'missing-media.zip'])('rejects the intentionally damaged %s fixture', async (name) => {
    const result = await verifyEvidenceArchive(await fixture(name))
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
