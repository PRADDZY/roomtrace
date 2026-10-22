/// <reference types="vite/client" />
import type { Media, Observation, Project } from './models'

// DefinitelyTyped still describes PDFKit 0.17's CommonJS constructor. Version
// 0.20 adds the named export and supports null to disable the standard font.
type PdfKitModule = {
  PDFDocument: new (options: Omit<PDFKit.PDFDocumentOptions, 'font'> & { font: null }) => PDFKit.PDFDocument
}

const pageWidth = 612
const pageHeight = 792
const margin = 48
const ink = '#212e29'
const muted = '#697369'
const green = '#335747'
const rule = '#d9d6c9'

async function loadFont(name: string) {
  const response = await fetch(`${import.meta.env.BASE_URL}fonts/${name}.ttf`)
  if (!response.ok) throw new Error('The PDF fonts could not be loaded. Please try exporting the index again.')
  return new Uint8Array(await response.arrayBuffer())
}

/** Creates a printable index; the accompanying ZIP retains the original files. */
export async function createEvidenceIndex(project: Project, observations: Observation[], media: Media[]): Promise<Blob> {
  // This module, PDFKit and both fonts are requested only when an index is exported.
  const [{ PDFDocument }, latin, devanagari] = await Promise.all([
    import('pdfkit') as unknown as Promise<PdfKitModule>, loadFont('NotoSans-Regular'), loadFont('NotoSansDevanagari-Regular'),
  ])
  const doc = new PDFDocument({
    size: [pageWidth, pageHeight], margins: { top: 90, bottom: 62, left: margin, right: margin },
    font: null, autoFirstPage: false, bufferPages: true,
    info: {
      Title: `RoomTrace evidence index — ${project.name}`,
      Subject: 'Evidence index. Original files are preserved in the accompanying RoomTrace ZIP archive.',
      Producer: 'RoomTrace · local evidence index',
    },
  })
  doc.registerFont('Latin', latin).registerFont('Devanagari', devanagari)
  const chunks: BlobPart[] = []
  const output = new Promise<Blob>((resolve) => {
    doc.on('data', (chunk: Uint8Array) => chunks.push(new Uint8Array(chunk).buffer))
    doc.on('end', () => resolve(new Blob(chunks, { type: 'application/pdf' })))
  })

  doc.addPage()

  // Keep each Devanagari run intact so fontkit can apply conjuncts and reordered
  // matras. Latin runs use their own font to retain accented names and addresses.
  function text(value: string, size = 10, color = ink) {
    const runs = value.split(/([\u0900-\u097f\u200c\u200d]+)/u).filter(Boolean)
    if (!runs.length) return
    doc.x = margin
    doc.fontSize(size).fillColor(color)
    runs.forEach((run, index) => {
      doc.font(/[\u0900-\u097f]/u.test(run) ? 'Devanagari' : 'Latin')
        .text(run, {
          width: pageWidth - margin * 2, lineGap: 4, continued: index < runs.length - 1,
          // Use a common alphabetic baseline despite the fonts' different ascenders.
          baseline: -size * 1.1,
        })
    })
  }
  function gap(points = 12) {
    doc.y += points
    if (doc.y >= pageHeight - 80) doc.addPage()
  }
  function divider() {
    gap(5)
    doc.moveTo(margin, doc.y).lineTo(pageWidth - margin, doc.y).lineWidth(0.6).stroke(rule)
    gap(14)
  }

  text('EVIDENCE INDEX', 8, green)
  gap(8)
  text(project.name, 25)
  gap(6)
  text(project.address || 'Address not recorded', 11, muted)
  divider()
  text(`CREATED ${new Date(project.createdAt).toLocaleDateString('en-US')}   ·   EXPORTED ${new Date().toLocaleDateString('en-US')}`, 8, muted)
  gap()
  text('ABOUT THIS INDEX', 8, green)
  text(`${observations.length} observation${observations.length === 1 ? '' : 's'} across ${project.rooms.length} listed rooms. The accompanying ZIP preserves the original media files and a versioned manifest. This PDF is an index; it does not include or authenticate the original files.`, 10, muted)
  gap(20)

  const byId = new Map(observations.map((observation) => [observation.id, observation]))
  const filesByObservation = new Map<string, Media[]>()
  for (const file of media) {
    const files = filesByObservation.get(file.observationId) ?? []
    files.push(file)
    filesByObservation.set(file.observationId, files)
  }
  for (const observation of [...observations].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
    if (doc.y > pageHeight - 160) doc.addPage()
    const phase = observation.phase === 'move-in' ? 'MOVE-IN' : 'MOVE-OUT'
    text(`${phase}  /  ${observation.room}`, 9, green)
    text(new Date(observation.recordedAt).toLocaleDateString('en-US'), 8, muted)
    gap(5)
    text(observation.title, 13)
    text(observation.notes || 'No note recorded.', 10, muted)
    if (observation.baselineId) {
      const baseline = byId.get(observation.baselineId)
      gap(5)
      text(baseline
        ? `PAIRED TO MOVE-IN: ${baseline.title} · ${new Date(baseline.recordedAt).toLocaleDateString('en-US')}`
        : `PAIRED TO MOVE-IN RECORD: ${observation.baselineId}`, 8, green)
    }
    const files = filesByObservation.get(observation.id) ?? []
    gap(5)
    if (files.length) {
      text('ORIGINAL MEDIA IN ZIP', 7, muted)
      for (const file of files) {
        text(file.fileName, 8, muted)
        text(`${file.mimeType} · SHA-256 ${file.sha256}`, 8, muted)
      }
    } else text('NO ORIGINAL MEDIA FILE ATTACHED', 7.5, muted)
    divider()
  }

  const pages = doc.bufferedPageRange()
  for (let index = pages.start; index < pages.start + pages.count; index += 1) {
    doc.switchToPage(index)
    doc.font('Latin').fontSize(9).fillColor(green).text('ROOMTRACE', margin, 28, { lineBreak: false })
    doc.fontSize(7).fillColor(muted).text('HOME CONDITION JOURNAL', margin, 45, { lineBreak: false })
    doc.moveTo(margin, 68).lineTo(pageWidth - margin, 68).lineWidth(0.8).stroke(rule)
    doc.moveTo(margin, 757).lineTo(pageWidth - margin, 757).lineWidth(0.7).stroke(rule)
    doc.font('Latin').fontSize(7).fillColor(muted)
      .text('ROOMTRACE · ORIGINALS REMAIN IN THE ZIP PACKET', margin, 768, { lineBreak: false })
      .text(`${index + 1} / ${pages.count}`, pageWidth - 86, 768, { lineBreak: false })
  }
  doc.end()
  return output
}
