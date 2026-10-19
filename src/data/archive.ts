import JSZip from 'jszip'
import { db as defaultDatabase, type RoomTraceDatabase } from './database'
import type { Media, Observation, Project } from './models'

export interface EvidenceArchiveMediaV1 {
  id: string
  projectId: string
  observationId: string
  fileName: string
  mimeType: string
  sha256: string
  path: string
}

export interface EvidenceArchiveV1 {
  version: 1
  project: Project
  observations: Observation[]
  media: EvidenceArchiveMediaV1[]
}

export interface VerificationChecks {
  zipReadable: boolean
  manifestValid: boolean
  entriesExpected: boolean
  referencesValid: boolean
  checksumsValid: boolean
}

export interface VerificationResult {
  valid: boolean
  checks: string[]
  errors: string[]
  projectName?: string
  observationCount: number
  mediaCount: number
}

export interface RestoreResult {
  project: Project
  observationCount: number
  mediaCount: number
}

interface ValidatedArchive {
  manifest: EvidenceArchiveV1
  mediaBytes: Map<string, Uint8Array>
  checks: VerificationChecks
  errors: string[]
}

const blankChecks = (): VerificationChecks => ({
  zipReadable: false,
  manifestValid: false,
  entriesExpected: false,
  referencesValid: false,
  checksumsValid: false,
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value)

const isString = (value: unknown): value is string => typeof value === 'string'

const isProject = (value: unknown): value is Project => {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'name', 'address', 'createdAt', 'rooms'])) return false
  return isString(value.id) && value.id.length > 0 && isString(value.name) &&
    isString(value.address) && isString(value.createdAt) && Array.isArray(value.rooms) &&
    value.rooms.every(isString)
}

const isObservation = (value: unknown): value is Observation => {
  if (!isRecord(value)) return false
  const allowed = ['id', 'projectId', 'room', 'phase', 'title', 'notes', 'recordedAt', 'baselineId']
  if (!Object.keys(value).every((key) => allowed.includes(key)) ||
      !['id', 'projectId', 'room', 'phase', 'title', 'notes', 'recordedAt'].every((key) => key in value)) return false
  return isString(value.id) && value.id.length > 0 && isString(value.projectId) &&
    isString(value.room) && (value.phase === 'move-in' || value.phase === 'move-out') &&
    isString(value.title) && isString(value.notes) && isString(value.recordedAt) &&
    (value.baselineId === undefined || (isString(value.baselineId) && value.baselineId.length > 0))
}

const isMediaEntry = (value: unknown): value is EvidenceArchiveMediaV1 => {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'projectId', 'observationId', 'fileName', 'mimeType', 'sha256', 'path'])) return false
  return isString(value.id) && value.id.length > 0 && isString(value.projectId) &&
    isString(value.observationId) && isString(value.fileName) && isString(value.mimeType) &&
    /^[a-f0-9]{64}$/.test(String(value.sha256)) && isString(value.path)
}

const safePath = (path: string) =>
  path.startsWith('media/') && !path.startsWith('/') && !path.includes('\\') &&
  !path.split('/').some((part) => part === '' || part === '.' || part === '..') &&
  !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Computes the SHA-256 digest of a media blob's original bytes. */
export async function hashBlob(blob: Blob): Promise<string> {
  return sha256(new Uint8Array(await blob.arrayBuffer()))
}

function unique(items: string[]) {
  return new Set(items).size === items.length
}

function validateManifest(value: unknown): value is EvidenceArchiveV1 {
  return isRecord(value) && hasExactKeys(value, ['version', 'project', 'observations', 'media']) &&
    value.version === 1 && isProject(value.project) && Array.isArray(value.observations) &&
    value.observations.every(isObservation) && Array.isArray(value.media) && value.media.every(isMediaEntry)
}

async function validateArchive(input: Blob | ArrayBuffer | Uint8Array): Promise<ValidatedArchive> {
  const checks = blankChecks()
  const errors: string[] = []
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(input, { checkCRC32: true })
    checks.zipReadable = true
  } catch {
    errors.push('The ZIP file is unreadable or corrupt.')
    return { manifest: undefined as never, mediaBytes: new Map(), checks, errors }
  }

  const entries = Object.values(zip.files)
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) {
    errors.push('The archive is missing manifest.json.')
    return { manifest: undefined as never, mediaBytes: new Map(), checks, errors }
  }

  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(await manifestFile.async('string')) as unknown
  } catch {
    errors.push('manifest.json is not valid JSON.')
    return { manifest: undefined as never, mediaBytes: new Map(), checks, errors }
  }
  if (!validateManifest(rawManifest)) {
    errors.push('manifest.json does not match EvidenceArchiveV1 (version must be exactly 1).')
    return { manifest: undefined as never, mediaBytes: new Map(), checks, errors }
  }
  checks.manifestValid = true
  const manifest = rawManifest

  const expectedPaths = ['manifest.json', ...manifest.media.map((item) => item.path)]
  const actualPaths = entries.filter((entry) => !entry.dir).map((entry) => entry.name)
  if (!unique(manifest.observations.map((item) => item.id))) errors.push('The manifest contains duplicate observation IDs.')
  if (!unique(manifest.media.map((item) => item.id))) errors.push('The manifest contains duplicate media IDs.')
  if (!unique(manifest.media.map((item) => item.path))) errors.push('The manifest contains duplicate media paths.')
  if (!unique(actualPaths)) errors.push('The ZIP contains duplicate entry paths.')
  if (manifest.media.some((item) => !safePath(item.path))) errors.push('A media path is absolute, traverses directories, or is outside media/.')
  if (entries.some((entry) => {
    const originalName = (entry as JSZip.JSZipObject & { unsafeOriginalName?: string }).unsafeOriginalName
    return (originalName !== undefined && originalName !== entry.name) || (entry.dir && entry.name !== 'media/')
  }) ||
      !unique(expectedPaths) || !unique(actualPaths) || expectedPaths.length !== actualPaths.length ||
      expectedPaths.some((path) => !actualPaths.includes(path))) {
    errors.push('The ZIP contains unexpected entries or is missing one or more expected entries.')
  } else {
    checks.entriesExpected = true
  }

  const observations = new Map(manifest.observations.map((item) => [item.id, item]))
  for (const observation of manifest.observations) {
    if (observation.projectId !== manifest.project.id) errors.push(`Observation ${observation.id} references a different project.`)
    if (observation.baselineId) {
      const baseline = observations.get(observation.baselineId)
      if (!baseline || baseline.id === observation.id || baseline.projectId !== observation.projectId ||
          baseline.room !== observation.room || observation.phase !== 'move-out' || baseline.phase !== 'move-in') {
        errors.push(`Observation ${observation.id} has an invalid move-in baseline pairing.`)
      }
    }
  }
  for (const media of manifest.media) {
    const observation = observations.get(media.observationId)
    if (media.projectId !== manifest.project.id || !observation || observation.projectId !== media.projectId) {
      errors.push(`Media ${media.id} has an invalid project or observation reference.`)
    }
  }
  if (errors.every((error) => !/references|baseline pairing/.test(error))) checks.referencesValid = true

  const mediaBytes = new Map<string, Uint8Array>()
  let allChecksumsValid = true
  for (const media of manifest.media) {
    const file = zip.file(media.path)
    if (!file) {
      allChecksumsValid = false
      errors.push(`Media file is missing from the ZIP: ${media.path}.`)
      continue
    }
    const bytes = await file.async('uint8array')
    mediaBytes.set(media.id, bytes)
    if (await sha256(bytes) !== media.sha256) {
      allChecksumsValid = false
      errors.push(`SHA-256 checksum mismatch for media ${media.id} (${media.fileName}).`)
    }
  }
  checks.checksumsValid = allChecksumsValid
  return { manifest, mediaBytes, checks, errors }
}

/** Exports a project and its original media bytes as a version 1 evidence packet. */
export async function exportEvidenceArchive(projectId: string, database: RoomTraceDatabase = defaultDatabase): Promise<Blob> {
  const project = await database.projects.get(projectId)
  if (!project) throw new Error(`Project ${projectId} was not found.`)
  const observations = await database.observations.where('projectId').equals(projectId).toArray()
  const mediaRecords = await database.media.where('projectId').equals(projectId).toArray()
  const zip = new JSZip()
  const media: EvidenceArchiveMediaV1[] = []
  for (const record of mediaRecords) {
    const bytes = new Uint8Array(await record.blob.arrayBuffer())
    const path = `media/${encodeURIComponent(record.id)}.bin`
    zip.file(path, bytes)
    media.push({
      id: record.id,
      projectId: record.projectId,
      observationId: record.observationId,
      fileName: record.fileName,
      mimeType: record.mimeType,
      sha256: await sha256(bytes),
      path,
    })
  }
  const manifest: EvidenceArchiveV1 = { version: 1, project, observations, media }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

/** Independently inspects the ZIP bytes, manifest, record links, entry set, and media checksums. */
export async function verifyEvidenceArchive(input: Blob | ArrayBuffer | Uint8Array): Promise<VerificationResult> {
  const result = await validateArchive(input)
  const checks = [
    `ZIP readability: ${result.checks.zipReadable ? 'passed' : 'failed'}`,
    `Manifest schema and version: ${result.checks.manifestValid ? 'passed' : 'failed'}`,
    `Expected archive entries: ${result.checks.entriesExpected ? 'passed' : 'failed'}`,
    `Project and record references: ${result.checks.referencesValid ? 'passed' : 'failed'}`,
    `Media SHA-256 checksums: ${result.checks.checksumsValid ? 'passed' : 'failed'}`,
  ]
  return {
    valid: result.errors.length === 0 && Object.values(result.checks).every(Boolean),
    checks,
    errors: result.errors,
    ...(result.manifest ? { projectName: result.manifest.project.name } : {}),
    observationCount: result.manifest?.observations.length ?? 0,
    mediaCount: result.manifest?.media.length ?? 0,
  }
}

/** Validates the complete packet before opening a write transaction, then restores it under fresh IDs. */
export async function restoreEvidenceArchive(input: Blob | ArrayBuffer | Uint8Array, database: RoomTraceDatabase = defaultDatabase): Promise<RestoreResult> {
  const validated = await validateArchive(input)
  if (validated.errors.length || !Object.values(validated.checks).every(Boolean)) {
    throw new Error(`Evidence archive verification failed: ${validated.errors.join(' ') || 'one or more checks failed.'}`)
  }
  const { manifest, mediaBytes } = validated
  const id = () => globalThis.crypto.randomUUID()
  const projectId = id()
  const project: Project = { ...manifest.project, id: projectId }
  const observationIds = new Map(manifest.observations.map((observation) => [observation.id, id()]))
  const mediaRows: Media[] = manifest.media.map((item) => {
    const bytes = mediaBytes.get(item.id)
    if (!bytes) throw new Error(`Validated media bytes missing for ${item.id}.`)
    return {
      id: id(),
      projectId,
      observationId: observationIds.get(item.observationId)!,
      fileName: item.fileName,
      mimeType: item.mimeType,
      sha256: item.sha256,
      blob: new Blob([bytes], { type: item.mimeType }),
    }
  })
  const observationRows: Observation[] = manifest.observations.map((observation) => ({
    ...observation,
    id: observationIds.get(observation.id)!,
    projectId,
    ...(observation.baselineId ? { baselineId: observationIds.get(observation.baselineId)! } : {}),
  }))

  await database.transaction('rw', database.projects, database.observations, database.media, async () => {
    await database.projects.add(project)
    await database.observations.bulkAdd(observationRows)
    await database.media.bulkAdd(mediaRows)
  })
  return { project, observationCount: observationRows.length, mediaCount: mediaRows.length }
}
