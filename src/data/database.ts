import Dexie, { type Table } from 'dexie'
import type { Media, Observation, Project } from './models'

export class RoomTraceDatabase extends Dexie {
  projects!: Table<Project, string>
  observations!: Table<Observation, string>
  media!: Table<Media, string>

  constructor(name = 'roomtrace') {
    super(name)
    this.version(1).stores({
      projects: 'id, name, createdAt',
      observations: 'id, projectId, room, phase, recordedAt, baselineId',
      media: 'id, projectId, observationId',
    })
  }
}

export const db = new RoomTraceDatabase()
