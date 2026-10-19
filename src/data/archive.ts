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

/** Limits apply to both import and export so the app never emits an archive it cannot restore. */
export const EVIDENCE_ARCHIVE_LIMITS = {
  maxInputBytes: 256 * 1024 * 1024,
  maxZipEntries: 5002,
  maxManifestBytes: 8 * 1024 * 1024,
  maxMediaItemBytes: 32 * 1024 * 1024,
  maxTotalMediaBytes: 240 * 1024 * 1024,
  maxMediaRecords: 5000,
} as const

interface ValidatedArchive {
  manifest?: EvidenceArchiveV1
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

function inputSize(input: Blob | ArrayBuffer | Uint8Array): number {
  if (input instanceof Blob) return input.size
  return input instanceof ArrayBuffer ? input.byteLength : input.byteLength
}

function uncompressedSize(file: JSZip.JSZipObject): number | undefined {
  const size = (file as JSZip.JSZipObject & { _data?: { uncompressedSize?: unknown } })._data?.uncompressedSize
  return typeof size === 'number' && Number.isSafeInteger(size) && size >= 0 ? size : undefined
}

function invalidArchive(checks: VerificationChecks, errors: string[]): ValidatedArchive {
  return { mediaBytes: new Map(), checks, errors }
}

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
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copyBytes(bytes))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read media blob.'))
    reader.readAsArrayBuffer(blob)
  })
}

/** Computes the SHA-256 digest of a media blob's original bytes. */
export async function hashBlob(blob: Blob): Promise<string> {
  return sha256(await blobBytes(blob))
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
  if (inputSize(input) > EVIDENCE_ARCHIVE_LIMITS.maxInputBytes) {
    errors.push(`The archive exceeds the ${EVIDENCE_ARCHIVE_LIMITS.maxInputBytes / (1024 * 1024)} MiB input size limit.`)
    return invalidArchive(checks, errors)
  }
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(input)
    checks.zipReadable = true
  } catch {
    errors.push('The ZIP file is unreadable or corrupt.')
    return invalidArchive(checks, errors)
  }

  const entries = Object.values(zip.files)
  if (entries.length > EVIDENCE_ARCHIVE_LIMITS.maxZipEntries) {
    errors.push(`The archive exceeds the ${EVIDENCE_ARCHIVE_LIMITS.maxZipEntries} ZIP entry limit.`)
    return invalidArchive(checks, errors)
  }
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) {
    errors.push('The archive is missing manifest.json.')
    return invalidArchive(checks, errors)
  }
  const manifestSize = uncompressedSize(manifestFile)
  if (manifestSize === undefined || manifestSize > EVIDENCE_ARCHIVE_LIMITS.maxManifestBytes) {
    errors.push(`manifest.json exceeds the ${EVIDENCE_ARCHIVE_LIMITS.maxManifestBytes / (1024 * 1024)} MiB manifest size limit.`)
    return invalidArchive(checks, errors)
  }

  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(await manifestFile.async('string')) as unknown
  } catch {
    errors.push('manifest.json is not valid JSON.')
    return invalidArchive(checks, errors)
  }
  if (!validateManifest(rawManifest)) {
    errors.push('manifest.json does not match EvidenceArchiveV1 (version must be exactly 1).')
    return invalidArchive(checks, errors)
  }
  checks.manifestValid = true
  const manifest = rawManifest

  const expectedPaths = ['manifest.json', ...manifest.media.map((item) => item.path)]
  const actualPaths = entries.filter((entry) => !entry.dir).map((entry) => entry.name)
  if (!unique(manifest.observations.map((item) => item.id))) errors.push('The manifest contains duplicate observation IDs.')
  if (!unique(manifest.media.map((item) => item.id))) errors.push('The manifest contains duplicate media IDs.')
  if (!unique(manifest.media.map((item) => item.path))) errors.push('The manifest contains duplicate media paths.')
  if (manifest.media.length > EVIDENCE_ARCHIVE_LIMITS.maxMediaRecords) {
    errors.push(`The manifest exceeds the ${EVIDENCE_ARCHIVE_LIMITS.maxMediaRecords} media record limit.`)
  }
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
  let referencesValid = true
  for (const observation of manifest.observations) {
    if (observation.projectId !== manifest.project.id) {
      referencesValid = false
      errors.push(`Observation ${observation.id} references a different project.`)
    }
    if (observation.baselineId) {
      const baseline = observations.get(observation.baselineId)
      if (!baseline || baseline.id === observation.id || baseline.projectId !== observation.projectId ||
          baseline.room !== observation.room || observation.phase !== 'move-out' || baseline.phase !== 'move-in') {
        referencesValid = false
        errors.push(`Observation ${observation.id} has an invalid move-in baseline pairing.`)
      }
    }
  }
  for (const media of manifest.media) {
    const observation = observations.get(media.observationId)
    if (media.projectId !== manifest.project.id || !observation || observation.projectId !== media.projectId) {
      referencesValid = false
      errors.push(`Media ${media.id} has an invalid project or observation reference.`)
    }
  }
  checks.referencesValid = referencesValid

  const archiveMediaFiles = entries.filter((entry) => !entry.dir && entry.name.startsWith('media/'))
  let totalMediaBytes = 0
  for (const file of archiveMediaFiles) {
    const size = uncompressedSize(file)
    if (size === undefined) {
      errors.push(`Cannot determine the uncompressed size of media entry ${file.name}.`)
      continue
    }
    if (size > EVIDENCE_ARCHIVE_LIMITS.maxMediaItemBytes) {
      errors.push(`Media entry ${file.name} exceeds the ${EVIDENCE_ARCHIVE_LIMITS.maxMediaItemBytes / (1024 * 1024)} MiB per-item limit.`)
    }
    totalMediaBytes += size
  }
  if (totalMediaBytes > EVIDENCE_ARCHIVE_LIMITS.maxTotalMediaBytes) {
    errors.push(`Archive media exceeds the ${EVIDENCE_ARCHIVE_LIMITS.maxTotalMediaBytes / (1024 * 1024)} MiB total uncompressed media limit.`)
  }

  const mediaBytes = new Map<string, Uint8Array>()
  let allChecksumsValid = totalMediaBytes <= EVIDENCE_ARCHIVE_LIMITS.maxTotalMediaBytes &&
    archiveMediaFiles.every((file) => (uncompressedSize(file) ?? Infinity) <= EVIDENCE_ARCHIVE_LIMITS.maxMediaItemBytes) &&
    manifest.media.length <= EVIDENCE_ARCHIVE_LIMITS.maxMediaRecords
  const mediaWithinLimits = allChecksumsValid
  for (const media of manifest.media) {
    const file = zip.file(media.path)
    if (!file) {
      allChecksumsValid = false
      errors.push(`Media file is missing from the ZIP: ${media.path}.`)
      continue
    }
    if (!mediaWithinLimits) continue
    try {
      const bytes = await file.async('uint8array')
      mediaBytes.set(media.id, bytes)
      if (await sha256(bytes) !== media.sha256) {
        allChecksumsValid = false
        errors.push(`SHA-256 checksum mismatch for media ${media.id} (${media.fileName}).`)
      }
    } catch {
      allChecksumsValid = false
      errors.push(`Media entry ${media.path} could not be decompressed.`)
    }
  }
  checks.checksumsValid = allChecksumsValid
  return { manifest, mediaBytes, checks, errors }
}

/** Exports a project and its original media bytes as a version 1 evidence packet. */
export async function exportEvidenceArchive(projectId: string, database: RoomTraceDatabase = defaultDatabase): Promise<Blob> {
  const snapshot = await database.transaction('r', database.projects, database.observations, database.media, async () => {
    const project = await database.projects.get(projectId)
    if (!project) throw new Error(`Project ${projectId} was not found.`)
    const [observations, mediaRecords] = await Promise.all([
      database.observations.where('projectId').equals(projectId).toArray(),
      database.media.where('projectId').equals(projectId).toArray(),
    ])
    return { project, observations, mediaRecords }
  })
  const { project, observations, mediaRecords } = snapshot
  if (mediaRecords.length > EVIDENCE_ARCHIVE_LIMITS.maxMediaRecords) {
    throw new Error(`Project exceeds the ${EVIDENCE_ARCHIVE_LIMITS.maxMediaRecords} media record limit.`)
  }
  let totalMediaBytes = 0
  for (const record of mediaRecords) {
    if (record.blob.size > EVIDENCE_ARCHIVE_LIMITS.maxMediaItemBytes) {
      throw new Error(`Media ${record.id} exceeds the ${EVIDENCE_ARCHIVE_LIMITS.maxMediaItemBytes / (1024 * 1024)} MiB per-item export limit.`)
    }
    totalMediaBytes += record.blob.size
  }
  if (totalMediaBytes > EVIDENCE_ARCHIVE_LIMITS.maxTotalMediaBytes) {
    throw new Error(`Project media exceeds the ${EVIDENCE_ARCHIVE_LIMITS.maxTotalMediaBytes / (1024 * 1024)} MiB total uncompressed export limit.`)
  }
  const zip = new JSZip()
  const media: EvidenceArchiveMediaV1[] = []
  for (const record of mediaRecords) {
    const bytes = await blobBytes(record.blob)
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
  const manifestJson = JSON.stringify(manifest, null, 2)
  if (new TextEncoder().encode(manifestJson).byteLength > EVIDENCE_ARCHIVE_LIMITS.maxManifestBytes) {
    throw new Error(`Project manifest exceeds the ${EVIDENCE_ARCHIVE_LIMITS.maxManifestBytes / (1024 * 1024)} MiB export limit.`)
  }
  zip.file('manifest.json', manifestJson)
  const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  if (archive.size > EVIDENCE_ARCHIVE_LIMITS.maxInputBytes) {
    throw new Error(`Generated archive exceeds the ${EVIDENCE_ARCHIVE_LIMITS.maxInputBytes / (1024 * 1024)} MiB input size limit.`)
  }
  return archive
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
  const { mediaBytes } = validated
  const manifest = validated.manifest
  if (!manifest) throw new Error('Evidence archive verification failed: manifest.json was not available.')
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
      blob: new Blob([copyBytes(bytes)], { type: item.mimeType }),
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
