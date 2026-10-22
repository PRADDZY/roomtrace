import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Media, Observation, Project } from './models'

const pageWidth = 612
const pageHeight = 792
const ink = rgb(0.13, 0.18, 0.16)
const muted = rgb(0.41, 0.45, 0.41)
const green = rgb(0.20, 0.34, 0.28)
const line = rgb(0.85, 0.84, 0.79)
const paper = rgb(0.975, 0.969, 0.946)

function safeText(value: string) {
  return value.normalize('NFKD').replace(/[^\x20-\x7e]/g, '?')
}

function drawText(page: PDFPage, text: string, x: number, top: number, size: number, font: PDFFont, color = ink) {
  page.drawText(safeText(text), { x, y: pageHeight - top - size, size, font, color, maxWidth: pageWidth - x - 50 })
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = safeText(text).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(current)
      current = word
    } else current = next
  }
  if (current) lines.push(current)
  return lines
}

function paintPage(page: PDFPage, fonts: { regular: PDFFont; bold: PDFFont }) {
  page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: paper })
  page.drawText('ROOMTRACE', { x: 48, y: pageHeight - 39, size: 9, font: fonts.bold, color: green })
  page.drawText('HOME CONDITION JOURNAL', { x: 48, y: pageHeight - 55, size: 7, font: fonts.regular, color: muted })
  page.drawLine({ start: { x: 48, y: pageHeight - 68 }, end: { x: pageWidth - 48, y: pageHeight - 68 }, thickness: 0.8, color: line })
}

/** Creates a printable index for a journal; original files remain in the ZIP packet. */
export async function createEvidenceIndex(project: Project, observations: Observation[], media: Media[]): Promise<Blob> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`RoomTrace evidence index — ${safeText(project.name)}`)
  pdf.setSubject('Evidence index. Original files are preserved in the accompanying RoomTrace ZIP archive.')
  pdf.setProducer('RoomTrace · local evidence index')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fonts = { regular, bold }
  let page = pdf.addPage([pageWidth, pageHeight])
  paintPage(page, fonts)
  let top = 98
  drawText(page, 'EVIDENCE INDEX', 48, top, 8, bold, green)
  top += 22
  drawText(page, safeText(project.name), 48, top, 27, bold)
  top += 36
  drawText(page, project.address || 'Address not recorded', 48, top, 11, regular, muted)
  top += 25
  page.drawLine({ start: { x: 48, y: pageHeight - top }, end: { x: pageWidth - 48, y: pageHeight - top }, thickness: 0.8, color: line })
  top += 18
  drawText(page, `CREATED ${new Date(project.createdAt).toLocaleDateString('en-US')}`, 48, top, 8, bold, muted)
  drawText(page, `EXPORTED ${new Date().toLocaleDateString('en-US')}`, 325, top, 8, bold, muted)
  top += 28
  drawText(page, 'ABOUT THIS INDEX', 48, top, 8, bold, green)
  top += 15
  const intro = `${observations.length} observation${observations.length === 1 ? '' : 's'} across ${project.rooms.length} listed rooms. The accompanying ZIP preserves the original media files and a versioned manifest. This PDF is an index; it does not include or authenticate the original files.`
  for (const lineText of wrapLines(intro, regular, 10, pageWidth - 100)) {
    drawText(page, lineText, 48, top, 10, regular, muted)
    top += 14
  }
  top += 17

  const ordered = [...observations].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  for (const observation of ordered) {
    const files = media.filter((item) => item.observationId === observation.id)
    const noteLines = wrapLines(observation.notes || 'No note recorded.', regular, 10, pageWidth - 114)
    const needed = 85 + noteLines.length * 13 + Math.max(1, files.length) * 13
    if (top + needed > pageHeight - 55) {
      page = pdf.addPage([pageWidth, pageHeight])
      paintPage(page, fonts)
      top = 90
    }
    page.drawRectangle({ x: 48, y: pageHeight - top - 24, width: pageWidth - 96, height: 24, color: rgb(0.92, 0.925, 0.89) })
    const phase = observation.phase === 'move-in' ? 'MOVE-IN' : 'MOVE-OUT'
    page.drawText(safeText(`${phase}  /  ${observation.room}`), { x: 58, y: pageHeight - top - 16, size: 8, font: bold, color: green })
    page.drawText(new Date(observation.recordedAt).toLocaleDateString('en-US'), { x: 445, y: pageHeight - top - 16, size: 8, font: regular, color: muted })
    top += 34
    drawText(page, observation.title, 58, top, 12, bold)
    top += 18
    for (const noteLine of noteLines) {
      drawText(page, noteLine, 58, top, 10, regular, muted)
      top += 13
    }
    if (observation.baselineId) {
      const baseline = observations.find((item) => item.id === observation.baselineId)
      if (baseline) {
        drawText(page, `PAIRED TO MOVE-IN: ${baseline.title} · ${new Date(baseline.recordedAt).toLocaleDateString('en-US')}`, 58, top + 3, 8, bold, green)
        top += 17
      }
    }
    if (files.length) {
      drawText(page, 'ORIGINAL MEDIA IN ZIP', 58, top + 2, 7, bold, muted)
      top += 14
      for (const file of files) {
        drawText(page, `${file.fileName} · ${file.mimeType} · SHA-256 ${file.sha256}`, 58, top, 7.5, regular, muted)
        top += 12
      }
    } else {
      drawText(page, 'NO ORIGINAL MEDIA FILE ATTACHED', 58, top + 2, 7.5, regular, muted)
      top += 14
    }
    top += 11
    page.drawLine({ start: { x: 58, y: pageHeight - top }, end: { x: pageWidth - 58, y: pageHeight - top }, thickness: 0.45, color: line })
    top += 13
  }

  for (const [index, item] of pdf.getPages().entries()) {
    item.drawLine({ start: { x: 48, y: 35 }, end: { x: pageWidth - 48, y: 35 }, thickness: 0.7, color: line })
    item.drawText('ROOMTRACE · ORIGINALS REMAIN IN THE ZIP PACKET', { x: 48, y: 20, size: 7, font: regular, color: muted })
    item.drawText(`${index + 1} / ${pdf.getPageCount()}`, { x: pageWidth - 86, y: 20, size: 7, font: regular, color: muted })
  }

  const bytes = await pdf.save()
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/pdf' })
}
