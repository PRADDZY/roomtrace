import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'
import Dexie from 'dexie'
import JSZip from 'jszip'
import { RoomTraceDatabase } from './database'
import { EVIDENCE_ARCHIVE_LIMITS, exportEvidenceArchive, restoreEvidenceArchive, verifyEvidenceArchive, type EvidenceArchiveV1 } from './archive'
import type { Media, Observation, Project } from './models'

const project: Project = { id: 'project-original', name: 'Oak Street', address: '12 Oak St', createdAt: '2026-10-01T09:00:00.000Z', rooms: ['Kitchen'] }
const observations: Observation[] = [
  { id: 'obs-in', projectId: project.id, room: 'Kitchen', phase: 'move-in', title: 'Arrival', notes: 'Existing scratch', recordedAt: '2026-10-01T10:00:00.000Z' },
  { id: 'obs-out', projectId: project.id, room: 'Kitchen', phase: 'move-out', title: 'Departure', notes: 'Scratch remains', recordedAt: '2026-10-19T10:00:00.000Z', baselineId: 'obs-in' },
]
const originalBytes = new Uint8Array([0, 1, 2, 127, 128, 255])
const media: Media = {
  id: 'media-photo', projectId: project.id, observationId: 'obs-out', fileName: 'kitchen.png', mimeType: 'image/png',
  sha256: '0'.repeat(64), blob: new NodeBlob([originalBytes], { type: 'image/png' }) as unknown as Blob,
}

const databases: RoomTraceDatabase[] = []
beforeAll(() => vi.stubGlobal('Blob', NodeBlob))
afterAll(() => vi.unstubAllGlobals())

function makeDatabase(name: string) {
  const database = new RoomTraceDatabase(name)
  databases.push(database)
  return database
}

async function seed(database: RoomTraceDatabase) {
  await database.projects.add(project)
  await database.observations.bulkAdd(observations)
  await database.media.add(media)
}

async function blobBytes(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer())
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

async function makePacket() {
  const database = makeDatabase(`source-${crypto.randomUUID()}`)
  await seed(database)
  return exportEvidenceArchive(project.id, database)
}

async function changeManifest(change: (manifest: EvidenceArchiveV1) => void) {
  const zip = await JSZip.loadAsync(await makePacket())
  const manifest: EvidenceArchiveV1 = JSON.parse(await zip.file('manifest.json')!.async('string'))
  change(manifest)
  zip.file('manifest.json', JSON.stringify(manifest))
  return zip.generateAsync({ type: 'blob' })
}

async function expectRejectedWithoutWrites(packet: Blob, error: string) {
  const target = makeDatabase(`unchanged-${crypto.randomUUID()}`)
  await seed(target)
  const before = {
    projects: await target.projects.toArray(),
    observations: await target.observations.toArray(),
    media: await target.media.toArray(),
  }
  const writes = vi.spyOn(target, 'transaction')
  const verification = await verifyEvidenceArchive(packet)
  expect(verification.valid).toBe(false)
  expect(verification.errors.join(' ')).toContain(error)
  await expect(restoreEvidenceArchive(packet, target)).rejects.toThrow(error)
  expect(writes).not.toHaveBeenCalled()
  writes.mockRestore()
  expect(await target.projects.toArray()).toEqual(before.projects)
  expect(await target.observations.toArray()).toEqual(before.observations)
  const afterMedia = await target.media.toArray()
  expect(afterMedia).toEqual(before.media)
  expect([...await blobBytes(afterMedia[0].blob)]).toEqual([...originalBytes])
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (database) => {
    await database.delete()
  }))
})

describe('EvidenceArchiveV1', () => {
  it.each(['', 'not-a-date', 'Infinity', '2026-99-99', '+999999-01-01T00:00:00Z'])('rejects an unsafe project date %j before restoring any records', async (createdAt) => {
    const packet = await changeManifest((manifest) => { manifest.project.createdAt = createdAt })
    await expectRejectedWithoutWrites(packet, 'project createdAt date')
  })

  it.each(['', 'not-a-date', 'Infinity', '2026-99-99', '+999999-01-01T00:00:00Z'])('rejects an unsafe observation date %j before restoring any records', async (recordedAt) => {
    const packet = await changeManifest((manifest) => { manifest.observations[0].recordedAt = recordedAt })
    await expectRejectedWithoutWrites(packet, 'recordedAt date')
  })

  it.each(['Unlisted room', '', '   '])('rejects observation room %j outside the project room list', async (room) => {
    const packet = await changeManifest((manifest) => {
      manifest.observations.forEach((observation) => { observation.room = room })
    })
    await expectRejectedWithoutWrites(packet, 'room not listed')
  })

  it.each([[''], ['   '], ['Kitchen', 'Kitchen']])('rejects ambiguous listed rooms %j', async (...rooms) => {
    const packet = await changeManifest((manifest) => { manifest.project.rooms = rooms })
    await expectRejectedWithoutWrites(packet, 'room names must be nonblank and unique')
  })

  it.each([
    ['missing record', (manifest: EvidenceArchiveV1) => { manifest.observations[1].baselineId = 'missing' }],
    ['self reference', (manifest: EvidenceArchiveV1) => { manifest.observations[1].baselineId = 'obs-out' }],
    ['different room', (manifest: EvidenceArchiveV1) => {
      manifest.project.rooms.push('Bedroom')
      manifest.observations[0].room = 'Bedroom'
    }],
    ['different project', (manifest: EvidenceArchiveV1) => { manifest.observations[0].projectId = 'other' }],
    ['move-out baseline', (manifest: EvidenceArchiveV1) => { manifest.observations[0].phase = 'move-out' }],
    ['baseline on move-in', (manifest: EvidenceArchiveV1) => { manifest.observations[0].baselineId = 'obs-out' }],
  ])('rejects invalid baseline pairing: %s', async (_label, change) => {
    await expectRejectedWithoutWrites(await changeManifest(change), 'invalid move-in baseline pairing')
  })

  it('restores a historical move-out without a baseline and preserves a date-only timestamp', async () => {
    const packet = await changeManifest((manifest) => {
      delete manifest.observations[1].baselineId
      manifest.project.createdAt = '2026-10-01'
    })
    expect((await verifyEvidenceArchive(packet)).valid).toBe(true)
    const target = makeDatabase(`legacy-${crypto.randomUUID()}`)
    const restored = await restoreEvidenceArchive(packet, target)
    expect(restored.project.createdAt).toBe('2026-10-01')
    const rows = await target.observations.toArray()
    expect(rows.find((row) => row.phase === 'move-out')).not.toHaveProperty('baselineId')
    expect((await verifyEvidenceArchive(await exportEvidenceArchive(restored.project.id, target))).valid).toBe(true)
  })

  it('exports and restores an empty historical journal without rooms', async () => {
    const source = makeDatabase(`empty-${crypto.randomUUID()}`)
    await source.projects.add({ ...project, rooms: [] })
    const packet = await exportEvidenceArchive(project.id, source)
    expect((await verifyEvidenceArchive(packet)).valid).toBe(true)
    const target = makeDatabase(`empty-restored-${crypto.randomUUID()}`)
    const restored = await restoreEvidenceArchive(packet, target)
    expect(restored.project.rooms).toEqual([])
    expect(restored.observationCount).toBe(0)
    expect(restored.mediaCount).toBe(0)
  })

  it.each([
    ['project date', (database: RoomTraceDatabase) => database.projects.update(project.id, { createdAt: 'invalid' }), 'project createdAt date'],
    ['observation date', (database: RoomTraceDatabase) => database.observations.update('obs-in', { recordedAt: 'invalid' }), 'recordedAt date'],
    ['room', (database: RoomTraceDatabase) => database.observations.update('obs-in', { room: 'Unlisted' }), 'room not listed'],
    ['baseline', (database: RoomTraceDatabase) => database.observations.update('obs-out', { baselineId: 'missing' }), 'invalid move-in baseline pairing'],
    ['media reference', (database: RoomTraceDatabase) => database.media.put({ ...media, observationId: 'missing' }), 'invalid project or observation reference'],
    ['schema', (database: RoomTraceDatabase) => database.projects.update(project.id, { unexpected: true } as Partial<Project>), 'EvidenceArchiveV1'],
  ])('refuses to export invalid source %s without changing it', async (_label, change, error) => {
    const source = makeDatabase(`invalid-export-${crypto.randomUUID()}`)
    await seed(source)
    await change(source)
    const before = [await source.projects.toArray(), await source.observations.toArray(), await source.media.toArray()]
    await expect(exportEvidenceArchive(project.id, source)).rejects.toThrow(error)
    expect([await source.projects.toArray(), await source.observations.toArray(), await source.media.toArray()]).toEqual(before)
  })

  it('exports and independently verifies the ZIP and all original records and bytes', async () => {
    const packet = await makePacket()
    const zip = await JSZip.loadAsync(packet)
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    const archivedBytes = await zip.file(manifest.media[0].path)!.async('uint8array')
    expect(manifest.version).toBe(1)
    expect(manifest.project).toEqual(project)
    expect(manifest.observations).toEqual(observations)
    expect(manifest.media).toHaveLength(1)
    expect([...archivedBytes]).toEqual([...originalBytes])
    expect(manifest.media[0].sha256).toMatch(/^[a-f0-9]{64}$/)

    const result = await verifyEvidenceArchive(packet)
    expect(result.valid).toBe(true)
    expect(result.checks).toEqual([
      'ZIP readability: passed',
      'Manifest schema and version: passed',
      'Expected archive entries: passed',
      'Project and record references: passed',
      'Media SHA-256 checksums: passed',
    ])
    expect(result.observationCount).toBe(2)
    expect(result.mediaCount).toBe(1)
  })

  it('restores into a new project with observation, media, and baseline links remapped', async () => {
    const packet = await makePacket()
    const target = makeDatabase(`target-${crypto.randomUUID()}`)
    const restored = await restoreEvidenceArchive(packet, target)
    expect(restored.project.id).not.toBe(project.id)
    expect(restored.project.name).toBe(project.name)
    const rows = await target.observations.where('projectId').equals(restored.project.id).toArray()
    const baseline = rows.find((row) => row.phase === 'move-in')!
    const moveOut = rows.find((row) => row.phase === 'move-out')!
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.id !== 'obs-in' && row.id !== 'obs-out')).toBe(true)
    expect(moveOut.baselineId).toBe(baseline.id)
    expect(rows.every((row) => row.projectId === restored.project.id)).toBe(true)
    const restoredMedia = await target.media.where('projectId').equals(restored.project.id).first()
    expect(restoredMedia?.id).not.toBe('media-photo')
    expect(restoredMedia?.observationId).toBe(moveOut.id)
    expect([...await blobBytes(restoredMedia!.blob)]).toEqual([...originalBytes])
    expect(restoredMedia?.fileName).toBe('kitchen.png')
  })

  it('rejects checksum-corrupt media bytes', async () => {
    const zip = await JSZip.loadAsync(await makePacket())
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    zip.file(manifest.media[0].path, new Uint8Array([9, 9, 9]))
    const result = await verifyEvidenceArchive(await zip.generateAsync({ type: 'blob' }))
    expect(result.valid).toBe(false)
    expect(result.checks[4]).toBe('Media SHA-256 checksums: failed')
    expect(result.errors.join(' ')).toContain('SHA-256 checksum mismatch')
  })

  it('rejects a missing media file', async () => {
    const zip = await JSZip.loadAsync(await makePacket())
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    zip.remove(manifest.media[0].path)
    const result = await verifyEvidenceArchive(await zip.generateAsync({ type: 'blob' }))
    expect(result.valid).toBe(false)
    expect(result.checks[2]).toBe('Expected archive entries: failed')
    expect(result.errors.join(' ')).toContain('missing one or more expected entries')
  })

  it('leaves existing data unchanged when restore rejects a bad packet', async () => {
    const packet = await makePacket()
    const zip = await JSZip.loadAsync(packet)
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    zip.file(manifest.media[0].path, new Uint8Array([3, 3, 3]))
    const corrupted = await zip.generateAsync({ type: 'blob' })
    const target = makeDatabase(`unchanged-${crypto.randomUUID()}`)
    const existing: Project = { id: 'keep-me', name: 'Existing', address: '', createdAt: '2026-10-01', rooms: [] }
    await target.projects.add(existing)
    await expect(restoreEvidenceArchive(corrupted, target)).rejects.toThrow('verification failed')
    expect(await target.projects.toArray()).toEqual([existing])
    expect(await target.observations.count()).toBe(0)
    expect(await target.media.count()).toBe(0)
  })

  it('rejects a manifest with invalid observation references', async () => {
    const zip = await JSZip.loadAsync(await makePacket())
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    manifest.observations[0].projectId = 'another-project'
    zip.file('manifest.json', JSON.stringify(manifest))
    const result = await verifyEvidenceArchive(await zip.generateAsync({ type: 'blob' }))
    expect(result.valid).toBe(false)
    expect(result.checks[3]).toBe('Project and record references: failed')
    expect(result.errors.join(' ')).toContain('references a different project')
  })

  it('rejects a traversal path in the manifest', async () => {
    const zip = await JSZip.loadAsync(await makePacket())
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    manifest.media[0].path = 'media/../outside.bin'
    zip.file('manifest.json', JSON.stringify(manifest))
    const result = await verifyEvidenceArchive(await zip.generateAsync({ type: 'blob' }))
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('absolute, traverses directories')
  })

  it('rejects traversal in an actual ZIP entry path', async () => {
    const zip = await JSZip.loadAsync(await makePacket())
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    const originalPath = manifest.media[0].path
    const traversalPath = '../xx/media-photo.bin'
    expect(traversalPath).toHaveLength(originalPath.length)
    manifest.media[0].path = traversalPath
    zip.file('manifest.json', JSON.stringify(manifest))
    let bytes = await zip.generateAsync({ type: 'uint8array' })
    const originalName = new TextEncoder().encode(originalPath)
    const unsafeName = new TextEncoder().encode(traversalPath)
    let replacements = 0
    for (let offset = 0; offset <= bytes.length - originalName.length; offset += 1) {
      if (originalName.every((byte, index) => bytes[offset + index] === byte)) {
        bytes.set(unsafeName, offset)
        offset += originalName.length - 1
        replacements += 1
      }
    }
    expect(replacements).toBeGreaterThanOrEqual(2)
    const result = await verifyEvidenceArchive(bytes)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('absolute, traverses directories')
  })

  it('rejects input that exceeds the packet byte limit before ZIP parsing', async () => {
    const packet = new NodeBlob(['not a real large ZIP']) as unknown as Blob
    Object.defineProperty(packet, 'size', { value: EVIDENCE_ARCHIVE_LIMITS.maxInputBytes + 1 })
    const result = await verifyEvidenceArchive(packet)
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('256 MiB input size limit')
  })

  it('rejects a manifest that exceeds the documented uncompressed size limit', async () => {
    const zip = new JSZip()
    zip.file('manifest.json', 'x'.repeat(EVIDENCE_ARCHIVE_LIMITS.maxManifestBytes + 1))
    const result = await verifyEvidenceArchive(await zip.generateAsync({ type: 'blob' }))
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('manifest.json exceeds the 8 MiB manifest size limit')
  })

  it('rejects oversized media before reading its uncompressed bytes', async () => {
    const zip = new JSZip()
    const tooLarge = new Uint8Array(EVIDENCE_ARCHIVE_LIMITS.maxMediaItemBytes + 1)
    zip.file('media/big.bin', tooLarge)
    const manifest = {
      version: 1,
      project,
      observations: observations.slice(0, 1),
      media: [{
        id: 'big-media', projectId: project.id, observationId: 'obs-in', fileName: 'big.bin',
        mimeType: 'application/octet-stream', sha256: '0'.repeat(64), path: 'media/big.bin',
      }],
    }
    zip.file('manifest.json', JSON.stringify(manifest))
    const result = await verifyEvidenceArchive(await zip.generateAsync({ type: 'blob' }))
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('exceeds the 32 MiB per-item limit')
  })

  it('rejects an archive with too many ZIP entries before reading its manifest', async () => {
    const zip = new JSZip()
    zip.file('manifest.json', '{}')
    for (let index = 0; index < EVIDENCE_ARCHIVE_LIMITS.maxZipEntries; index += 1) {
      zip.file(`extra-${index}.bin`, '')
    }
    const result = await verifyEvidenceArchive(await zip.generateAsync({ type: 'blob' }))
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toContain('ZIP entry limit')
  }, 15_000)

  it('refuses to export media that the verifier would reject by size', async () => {
    const database = makeDatabase(`oversized-export-${crypto.randomUUID()}`)
    await database.projects.add(project)
    await database.observations.bulkAdd(observations)
    await database.media.add({
      ...media,
      blob: new NodeBlob([new Uint8Array(EVIDENCE_ARCHIVE_LIMITS.maxMediaItemBytes + 1)], { type: media.mimeType }) as unknown as Blob,
    })
    await expect(exportEvidenceArchive(project.id, database)).rejects.toThrow('per-item export limit')
  })

  it('exports records from one consistent Dexie transaction snapshot', async () => {
    const database = makeDatabase(`snapshot-${crypto.randomUUID()}`)
    await seed(database)
    const originalGet = database.projects.get.bind(database.projects)
    let notifyProjectRead!: () => void
    const projectReadStarted = new Promise<void>((resolve) => { notifyProjectRead = resolve })
    let releaseProjectRead!: () => void
    const projectReadGate = new Promise<void>((resolve) => { releaseProjectRead = resolve })
    database.projects.get = (async (id: string) => {
      const value = await originalGet(id)
      notifyProjectRead()
      await Dexie.waitFor(projectReadGate)
      return value
    }) as typeof database.projects.get

    const packetPromise = exportEvidenceArchive(project.id, database)
    await projectReadStarted
    const updatePromise = Dexie.ignoreTransaction(() => database.transaction('rw', database.projects, database.observations, async () => {
      await database.projects.update(project.id, { name: 'Concurrent update' })
      await database.observations.update('obs-in', { title: 'Concurrent update' })
    }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    releaseProjectRead()
    const [packet] = await Promise.all([packetPromise, updatePromise])
    database.projects.get = originalGet

    const zip = await JSZip.loadAsync(packet)
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    expect(manifest.project.name).toBe(project.name)
    expect(manifest.observations.find((item: Observation) => item.id === 'obs-in').title).toBe('Arrival')
  })
})
