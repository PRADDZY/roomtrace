import { afterEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { RoomTraceDatabase } from './database'
import { exportEvidenceArchive, restoreEvidenceArchive, verifyEvidenceArchive } from './archive'
import type { Media, Observation, Project } from './models'

const project: Project = { id: 'project-original', name: 'Oak Street', address: '12 Oak St', createdAt: '2026-10-01T09:00:00.000Z', rooms: ['Kitchen'] }
const observations: Observation[] = [
  { id: 'obs-in', projectId: project.id, room: 'Kitchen', phase: 'move-in', title: 'Arrival', notes: 'Existing scratch', recordedAt: '2026-10-01T10:00:00.000Z' },
  { id: 'obs-out', projectId: project.id, room: 'Kitchen', phase: 'move-out', title: 'Departure', notes: 'Scratch remains', recordedAt: '2026-10-19T10:00:00.000Z', baselineId: 'obs-in' },
]
const originalBytes = new Uint8Array([0, 1, 2, 127, 128, 255])
const media: Media = {
  id: 'media-photo', projectId: project.id, observationId: 'obs-out', fileName: 'kitchen.png', mimeType: 'image/png',
  sha256: '0'.repeat(64), blob: new Blob([originalBytes], { type: 'image/png' }),
}

const databases: RoomTraceDatabase[] = []
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

async function makePacket() {
  const database = makeDatabase(`source-${crypto.randomUUID()}`)
  await seed(database)
  return exportEvidenceArchive(project.id, database)
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (database) => {
    await database.delete()
  }))
})

describe('EvidenceArchiveV1', () => {
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
    expect([...new Uint8Array(await restoredMedia!.blob.arrayBuffer())]).toEqual([...originalBytes])
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
})
