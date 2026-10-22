import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import type { Observation, Project } from './models'
import { createEvidenceIndex } from './pdf'

const project: Project = {
  id: 'pdf-project', name: 'Alder House', address: '14 Alder Road',
  createdAt: '2026-10-01T09:00:00.000Z', rooms: ['Kitchen', 'Entry'],
}

describe('printable evidence index', () => {
  it('creates a readable PDF index and adds pages for longer journals', async () => {
    const observations: Observation[] = Array.from({ length: 18 }, (_, index) => ({
      id: `observation-${index}`,
      projectId: project.id,
      room: index % 2 ? 'Kitchen' : 'Entry',
      phase: index % 2 ? 'move-in' : 'move-out',
      title: `Observation ${index + 1}`,
      notes: 'The visible finish and nearby fixture are noted for context. This index lists evidence without assessing cause or responsibility.',
      recordedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    }))

    const blob = await createEvidenceIndex(project, observations, [])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const pdf = await PDFDocument.load(bytes)

    expect(blob.type).toBe('application/pdf')
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(pdf.getPageCount()).toBeGreaterThan(1)
  })
})
