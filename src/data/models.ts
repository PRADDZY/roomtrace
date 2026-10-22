export type ObservationPhase = 'move-in' | 'move-out'

export interface Project {
  id: string
  name: string
  address: string
  createdAt: string
  rooms: string[]
}

export interface Observation {
  id: string
  projectId: string
  room: string
  phase: ObservationPhase
  title: string
  notes: string
  recordedAt: string
  baselineId?: string
}

export interface Media {
  id: string
  projectId: string
  observationId: string
  fileName: string
  mimeType: string
  sha256: string
  blob: Blob
}
