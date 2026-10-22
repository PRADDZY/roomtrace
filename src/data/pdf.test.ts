// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import type { Media, Observation, Project } from './models'
import { createEvidenceIndex } from './pdf'

const project: Project = {
  id: 'pdf-project', name: 'Alder House', address: '14 Alder Road',
  createdAt: '2026-10-01T09:00:00.000Z', rooms: ['Kitchen', 'Entry'],
}

describe('printable evidence index', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(await readFile(new URL(`../../public${url}`, import.meta.url)))))
  })
  afterEach(() => vi.unstubAllGlobals())

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

  it('embeds Unicode text for Hindi, Marathi and accented Latin', async () => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const blob = await createEvidenceIndex({ ...project, name: 'Café — घर निरीक्षण', address: 'पुणे, महाराष्ट्र' }, [{
      id: 'unicode', projectId: project.id, room: 'रसोई / स्वयंपाकघर', phase: 'move-in',
      title: 'खिड़की / खिडकी', notes: 'दीवार में दरार है। भिंतीवर ओलावा आहे. Crème brûlée.',
      recordedAt: project.createdAt,
    }], [])
    const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: false })
    const pdf = await task.promise
    const content = await (await pdf.getPage(1)).getTextContent()
    const text = content.items.flatMap((item) => 'str' in item ? [item.str] : []).join(' ')
    expect(text).toContain('Café')
    expect(text).toContain('Crème brûlée')
    expect(text).toContain('पुणे')
    expect(text).toContain('ओलावा')
    expect(text).not.toContain('?')
    const titleRuns = content.items.flatMap((item) => 'str' in item && (item.str.includes('Café') || item.str === 'घर') ? [item] : [])
    expect(titleRuns).toHaveLength(2)
    expect(titleRuns[0].transform[5]).toBeCloseTo(titleRuns[1].transform[5], 3)
    expect((await pdf.getMetadata()).info).toMatchObject({ Title: 'RoomTrace evidence index — Café — घर निरीक्षण' })
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toContain('/FontFile2')
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toContain('/ToUnicode')
    await task.destroy()
  })

  it('flows a single oversized record and unbroken filenames across pages without clipping or losing the ending', async () => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const baseline: Observation = {
      id: 'baseline', projectId: project.id, room: 'Entry', phase: 'move-in',
      title: 'Baseline reference', notes: 'Original condition', recordedAt: project.createdAt,
    }
    const observation: Observation = {
      ...baseline, id: 'large', phase: 'move-out', baselineId: baseline.id,
      title: `${'Long observation title '.repeat(35)}TITLE-END`,
      notes: `${'The visible finish is recorded with nearby fixtures. '.repeat(500)}NOTE-END`,
    }
    const file: Media = {
      id: 'file', projectId: project.id, observationId: observation.id,
      fileName: `${'x'.repeat(900)}-FILE-END.jpg`, mimeType: 'image/jpeg', sha256: 'a1b2c3d4'.repeat(8), blob: new Blob(),
    }
    const blob = await createEvidenceIndex({ ...project, name: 'Project name '.repeat(40), address: 'Long address '.repeat(50) }, [baseline, observation], [file])
    const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: false })
    const pdf = await task.promise
    expect(pdf.numPages).toBeGreaterThan(5)
    let allText = ''
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const content = await (await pdf.getPage(index)).getTextContent()
      const items = content.items.filter((item) => 'str' in item)
      const text = items.map((item) => item.str).join(' ')
      allText += text
      expect(text).toContain(`${index} / ${pdf.numPages}`)
      for (const item of items) {
        if (!item.str.trim()) continue
        expect(item.transform[4]).toBeGreaterThanOrEqual(47)
        expect(item.transform[4] + item.width).toBeLessThanOrEqual(565)
        const y = item.transform[5]
        if (item.str.startsWith('ROOMTRACE') || item.str === 'HOME CONDITION JOURNAL' || item.str === `${index} / ${pdf.numPages}`) continue
        expect(y).toBeGreaterThanOrEqual(62)
        expect(y).toBeLessThanOrEqual(703)
      }
    }
    expect(allText).toContain('TITLE-END')
    expect(allText).toContain('NOTE-END')
    expect(allText).toContain('FILE-END.jpg')
    expect(allText).toContain(file.sha256)
    expect(allText).toContain('PAIRED TO MOVE-IN: Baseline reference')
    await task.destroy()
  })

  it('reports missing local fonts instead of exporting damaged text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(createEvidenceIndex(project, [], [])).rejects.toThrow('PDF fonts could not be loaded')
  })

  it.each(['\n', '\r\n', '\r', '\u2028', '\u2029'])('preserves hard line breaks between scripts (%j)', async (newline) => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const labels = ['Café', 'घर', 'Hello', 'स्वयंपाकघर', 'END']
    const blob = await createEvidenceIndex(project, [{
      id: 'multiline', projectId: project.id, room: 'Entry', phase: 'move-in',
      title: 'Multiline notes', notes: labels.join(newline), recordedAt: project.createdAt,
    }], [])
    const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: false })
    try {
      const pdf = await task.promise
      const content = await (await pdf.getPage(1)).getTextContent()
      // PDF.js can expose the leading conjunct as a separate text item.
      const rows = ['Café', 'घर', 'Hello', 'स्', 'END'].map((label) => content.items.flatMap((item) => 'str' in item && item.str.trim() === label ? [item] : [])[0])
      expect(rows.every(Boolean)).toBe(true)
      rows.forEach((row, index) => {
        expect(row.transform[4]).toBeCloseTo(48, 3)
        if (index) expect(rows[index - 1].transform[5] - row.transform[5]).toBeGreaterThan(13)
      })
    } finally {
      await task.destroy()
    }
  })

  it('keeps blank lines between mixed-script paragraphs', async () => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const blob = await createEvidenceIndex(project, [{
      id: 'blank-line', projectId: project.id, room: 'Entry', phase: 'move-in',
      title: 'Separated paragraphs', notes: 'Café घर\n\nHello स्वयंपाकघर', recordedAt: project.createdAt,
    }], [])
    const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useSystemFonts: false })
    try {
      const pdf = await task.promise
      const content = await (await pdf.getPage(1)).getTextContent()
      const items = content.items.filter((item) => 'str' in item)
      const first = items.find((item) => item.str.includes('Café'))!
      const firstMarathi = items.find((item) => item.str === 'घर')!
      const second = items.find((item) => item.str.includes('Hello'))!
      const secondMarathi = items.find((item) => item.str.trim() === 'स्')!
      expect(first.transform[5]).toBeCloseTo(firstMarathi.transform[5], 3)
      expect(second.transform[5]).toBeCloseTo(secondMarathi.transform[5], 3)
      expect(first.transform[5] - second.transform[5]).toBeGreaterThan(30)
      expect(second.transform[4]).toBeCloseTo(48, 3)
    } finally {
      await task.destroy()
    }
  })
})
