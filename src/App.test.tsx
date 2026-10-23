import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { db } from './data/database'

vi.setConfig({ testTimeout: 20_000 })

const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='), (char) => char.charCodeAt(0))
// jsdom does not implement image decoding. These UI tests control the browser
// decoder boundary; capture.test separately covers decoder failures and limits.
class DecodedImage {
  naturalWidth = 1
  naturalHeight = 1
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  set src(_value: string) { queueMicrotask(() => this.onload?.()) }
}

describe('RoomTrace user journey', () => {
  it('lets a sample visitor start a real journal', async () => {
    const user = userEvent.setup()
    render(<BrowserRouter><App /></BrowserRouter>)
    await user.click(await screen.findByRole('button', { name: /Open the clearly marked sample journal/i }))
    expect(await screen.findByRole('button', { name: 'New journal' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New journal' }))
    await user.click(screen.getByRole('button', { name: 'Back to active journal' }))
    expect(await screen.findByText('DEMO DATA')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New journal' }))
    await user.clear(screen.getByLabelText('Journal name'))
    await user.type(screen.getByLabelText('Journal name'), 'Real home')
    await user.click(screen.getByRole('button', { name: /Create my journal/ }))
    const selector = await screen.findByRole('combobox', { name: 'Active journal' })
    expect(await db.projects.count()).toBe(2)
    const sample = (await db.projects.toArray()).find((item) => item.name.includes('sample'))!
    await user.selectOptions(selector, sample.id)
    expect(await screen.findByText('DEMO DATA')).toBeInTheDocument()
    expect(await db.observations.count()).toBe(2)
    cleanup()
    render(<BrowserRouter><App /></BrowserRouter>)
    expect(await screen.findByText('DEMO DATA')).toBeInTheDocument()
  })
  beforeEach(async () => {
    vi.stubGlobal('Image', DecodedImage)
    localStorage.clear()
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await db.delete()
  })

  it('requires rooms at creation and validates rooms added later', async () => {
    const user = userEvent.setup()
    render(<BrowserRouter><App /></BrowserRouter>)
    await screen.findByLabelText('Journal name')
    for (const room of ['Living room', 'Kitchen', 'Bedroom', 'Bathroom', 'Entry']) await user.click(screen.getByRole('button', { name: `Remove ${room}` }))
    await user.click(screen.getByRole('button', { name: /Create my journal/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('at least one room')
    expect(await db.projects.count()).toBe(0)
    await user.type(screen.getByPlaceholderText('Add a room'), '  Study  ')
    await user.click(screen.getByRole('button', { name: 'Add room' }))
    await user.click(screen.getByRole('button', { name: /Create my journal/ }))
    await screen.findByRole('combobox', { name: 'Active journal' })
    await user.click(screen.getByRole('button', { name: 'Add room' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a room name')
    await user.type(screen.getByLabelText('Add a room to this journal'), ' study ')
    await user.click(screen.getByRole('button', { name: 'Add room' }))
    expect(screen.getByRole('alert')).toHaveTextContent('already listed')
    await user.clear(screen.getByLabelText('Add a room to this journal'))
    await user.type(screen.getByLabelText('Add a room to this journal'), '  Hall  ')
    await user.click(screen.getByRole('button', { name: 'Add room' }))
    await waitFor(async () => expect((await db.projects.toArray())[0].rooms).toEqual(['Study', 'Hall']))
  })

  it('opens a clearly identified sample journal without presenting it as real evidence', async () => {
    const user = userEvent.setup()
    render(<BrowserRouter><App /></BrowserRouter>)

    await user.click(await screen.findByRole('button', { name: /Open the clearly marked sample journal/i }))

    expect(await screen.findByText('DEMO DATA')).toBeInTheDocument()
    expect(screen.getByText(/fictional examples/i)).toBeInTheDocument()
    expect(screen.getByText('Sink cabinet · arrival')).toBeInTheDocument()
    expect(screen.getByText('Sink cabinet · departure')).toBeInTheDocument()
    expect(await db.projects.count()).toBe(1)
    expect(await db.media.count()).toBe(2)
  })

  it('opens complete notes and every original photo with keyboard close and focus return', async () => {
    const user = userEvent.setup()
    const project = { id: 'project', name: 'Saved home', address: '', rooms: ['Kitchen'], createdAt: '2026-01-01T00:00:00Z' }
    const observation = { id: 'record', projectId: project.id, room: 'Kitchen', phase: 'move-in' as const, title: 'All photos', notes: 'Full notes\nincluding a second line', recordedAt: project.createdAt }
    await db.projects.add(project)
    await db.observations.add(observation)
    await db.media.bulkAdd(Array.from({ length: 10 }, (_, index) => ({ id: `photo-${index}`, projectId: project.id, observationId: observation.id, fileName: `photo-${index + 1}.png`, mimeType: 'image/png', sha256: '0'.repeat(64), blob: new Blob([pngBytes], { type: 'image/png' }) })))
    render(<BrowserRouter><App /></BrowserRouter>)
    const open = await screen.findByRole('button', { name: 'All photos' })
    await user.click(open)
    const dialog = screen.getByRole('dialog', { name: 'All photos' })
    expect(within(dialog).getByText(/including a second line/)).toHaveClass('record-full-notes')
    await user.click(within(dialog).getByRole('button', { name: 'View photo 10: photo-10.png' }))
    expect(within(dialog).getByRole('img')).toHaveAccessibleName('photo-10.png — photo 10 of 10')
    expect(within(dialog).getByRole('link', { name: 'Download original photo' })).toHaveAttribute('download', 'photo-10.png')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(open).toHaveFocus()
    expect(await db.observations.count()).toBe(1)
  })

  it('restores from the first screen without creating a dummy journal', async () => {
    const { exportEvidenceArchive } = await import('./data/archive')
    await db.projects.add({ id: 'source', name: 'Archive home', address: '', rooms: ['Kitchen'], createdAt: '2026-01-01T00:00:00Z' })
    const archive = await exportEvidenceArchive('source')
    await db.projects.clear()
    const user = userEvent.setup()
    render(<BrowserRouter><App /></BrowserRouter>)
    await user.click(await screen.findByRole('button', { name: 'Restore an existing archive' }))
    await user.upload(document.getElementById('archive-upload') as HTMLInputElement, new File([archive], 'home.zip', { type: 'application/zip' }))
    await user.click(await screen.findByRole('button', { name: /Restore as new journal/ }))
    expect(await screen.findByRole('combobox', { name: 'Active journal' })).toHaveDisplayValue('Archive home')
    expect(await db.projects.count()).toBe(1)
  })

  it('rejects an undecodable photo and clears the previous selection without writes', async () => {
    const user = userEvent.setup()
    render(<BrowserRouter><App /></BrowserRouter>)
    await user.click(await screen.findByRole('button', { name: /Create my journal/ }))
    await user.click(within(await screen.findByRole('navigation', { name: 'Journal' })).getByRole('button', { name: 'Add a record' }))
    await user.type(screen.getByLabelText('What did you notice?'), 'Keep these notes')
    await user.upload(screen.getByLabelText(/Original photos/), new File([pngBytes], 'valid.png', { type: 'image/png' }))
    await screen.findByText('1 photo ready')
    vi.stubGlobal('Image', class extends DecodedImage { set src(_value: string) { queueMicrotask(() => this.onerror?.()) } })
    await user.upload(screen.getByLabelText(/Original photos/), new File([pngBytes.slice(0, 8)], 'broken.png', { type: 'image/png' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot decode')
    expect(screen.queryByText('valid.png')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Save this record/ }))
    expect(await db.observations.count()).toBe(0)
    expect(await db.media.count()).toBe(0)
    expect(screen.getByLabelText('What did you notice?')).toHaveValue('Keep these notes')
  })

  it('keeps capture inputs when storage fails and rolls back partial writes', async () => {
    const user = userEvent.setup()
    render(<BrowserRouter><App /></BrowserRouter>)
    await user.click(await screen.findByRole('button', { name: /Create my journal/ }))
    await user.click(within(await screen.findByRole('navigation', { name: 'Journal' })).getByRole('button', { name: 'Add a record' }))
    await user.type(screen.getByLabelText('What did you notice?'), 'Do not lose my draft')
    await user.upload(screen.getByLabelText(/Original photos/), new File([pngBytes], 'saved.png', { type: 'image/png' }))
    await screen.findByText('1 photo ready')
    vi.spyOn(db.media, 'bulkAdd').mockRejectedValueOnce(new DOMException('No space', 'QuotaExceededError'))
    await user.click(screen.getByRole('button', { name: /Save this record/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Browser storage is full')
    expect(screen.getByLabelText('What did you notice?')).toHaveValue('Do not lose my draft')
    expect(screen.getByText('saved.png')).toBeInTheDocument()
    expect(await db.observations.count()).toBe(0)
    expect(await db.media.count()).toBe(0)
  })

  it('resets the exact baseline when room or phase changes', async () => {
    await db.projects.add({ id: 'p', name: 'Home', address: '', rooms: ['Kitchen', 'Hall'], createdAt: '2026-01-01T00:00:00Z' })
    await db.observations.bulkAdd(['Kitchen', 'Hall'].map((room) => ({ id: room, projectId: 'p', room, phase: 'move-in' as const, title: `${room} original`, notes: '', recordedAt: '2026-01-01T00:00:00Z' })))
    const user = userEvent.setup()
    render(<BrowserRouter><App /></BrowserRouter>)
    await user.click(within(await screen.findByRole('navigation', { name: 'Journal' })).getByRole('button', { name: 'Add a record' }))
    await user.click(screen.getByRole('button', { name: /Move-out/ }))
    await user.selectOptions(screen.getByLabelText('Matching move-in record'), 'Kitchen')
    await user.selectOptions(screen.getByLabelText('Room'), 'Hall')
    expect(screen.getByLabelText('Matching move-in record')).toHaveValue('')
    expect(screen.queryByRole('option', { name: /Kitchen original/ })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Matching move-in record'), 'Hall')
    await user.click(screen.getByRole('button', { name: /Move-in/ }))
    await user.click(screen.getByRole('button', { name: /Move-out/ }))
    expect(screen.getByLabelText('Matching move-in record')).toHaveValue('')
  })

  it('keeps a historic journal without rooms readable until a room is added', async () => {
    await db.projects.add({ id: 'empty', name: 'Historic home', address: '', rooms: [], createdAt: '2026-01-01T00:00:00Z' })
    const user = userEvent.setup()
    render(<BrowserRouter><App /></BrowserRouter>)
    await user.click(within(await screen.findByRole('navigation', { name: 'Journal' })).getByRole('button', { name: 'Add a record' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Add a room in Overview')
    await user.click(screen.getByRole('button', { name: 'Go to rooms' }))
    await user.type(screen.getByLabelText('Add a room to this journal'), 'Kitchen')
    await user.click(screen.getByRole('button', { name: 'Add room' }))
    await waitFor(async () => expect((await db.projects.get('empty'))?.rooms).toEqual(['Kitchen']))
    await user.click(within(screen.getByRole('navigation', { name: 'Journal' })).getByRole('button', { name: 'Add a record' }))
    expect(screen.getByLabelText('Room')).toHaveValue('Kitchen')
  })

  it('records original photos and compares move-out to the exact selected baseline', async () => {
    const user = userEvent.setup()
    render(<BrowserRouter><App /></BrowserRouter>)

    const journalName = await screen.findByLabelText('Journal name')
    await user.clear(journalName)
    await user.type(journalName, 'Pine Street flat')
    await user.click(screen.getByRole('button', { name: /Create my journal/i }))
    let journalNav = await screen.findByRole('navigation', { name: 'Journal' })
    await user.click(within(journalNav).getByRole('button', { name: 'Add a record' }))

    await user.selectOptions(screen.getByLabelText('Room'), 'Kitchen')
    await user.type(screen.getByLabelText('What did you notice?'), 'Small mark beside the sink')
    const arrivalPhoto = new File([pngBytes], 'arrival.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText(/Original photos/), arrivalPhoto)
    await screen.findByText('1 photo ready')
    await user.click(screen.getByRole('button', { name: /Save this record/i }))
    expect(await screen.findByText('Small mark beside the sink')).toBeInTheDocument()

    journalNav = screen.getByRole('navigation', { name: 'Journal' })
    await user.click(within(journalNav).getByRole('button', { name: 'Add a record' }))
    await user.click(screen.getByRole('button', { name: /Move-out/ }))
    await user.selectOptions(screen.getByLabelText('Room'), 'Kitchen')
    await user.type(screen.getByLabelText('What did you notice?'), 'Same mark, now beside the tap')
    const departurePhoto = new File([pngBytes], 'departure.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText(/Original photos/), departurePhoto)
    await screen.findByText('1 photo ready')
    const baselineSelect = screen.getByLabelText('Matching move-in record')
    const matchingOption = within(baselineSelect).getByRole('option', { name: /Small mark beside the sink/ }) as HTMLOptionElement
    await user.selectOptions(baselineSelect, matchingOption.value)
    await user.click(screen.getByRole('button', { name: /Save this record/i }))
    await screen.findByRole('button', { name: 'Same mark, now beside the tap' })

    journalNav = screen.getByRole('navigation', { name: 'Journal' })
    await user.click(within(journalNav).getByRole('button', { name: 'Compare' }))
    expect(await screen.findByText('EXACT BASELINE LINK')).toBeInTheDocument()
    expect(screen.getByText('Small mark beside the sink')).toBeInTheDocument()
    expect(screen.getAllByText('Same mark, now beside the tap')).toHaveLength(2)
    const observations = await db.observations.toArray()
    const baseline = observations.find((item) => item.phase === 'move-in')!
    const later = observations.find((item) => item.phase === 'move-out')!
    expect(later.baselineId).toBe(baseline.id)
    expect(await db.media.count()).toBe(2)
  }, 15_000)
})
