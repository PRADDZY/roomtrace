import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { db } from './data/database'

describe('RoomTrace user journey', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    cleanup()
    await db.delete()
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
    const arrivalPhoto = new File([new Uint8Array([1, 2, 3, 4])], 'arrival.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText(/Original photos/), arrivalPhoto)
    await user.click(screen.getByRole('button', { name: /Save this record/i }))
    expect(await screen.findByText('Small mark beside the sink')).toBeInTheDocument()

    journalNav = screen.getByRole('navigation', { name: 'Journal' })
    await user.click(within(journalNav).getByRole('button', { name: 'Add a record' }))
    await user.click(screen.getByRole('button', { name: /Move-out/ }))
    await user.selectOptions(screen.getByLabelText('Room'), 'Kitchen')
    await user.type(screen.getByLabelText('What did you notice?'), 'Same mark, now beside the tap')
    const departurePhoto = new File([new Uint8Array([5, 6, 7, 8])], 'departure.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText(/Original photos/), departurePhoto)
    const baselineSelect = screen.getByLabelText('Matching move-in record')
    const matchingOption = within(baselineSelect).getByRole('option', { name: /Small mark beside the sink/ }) as HTMLOptionElement
    await user.selectOptions(baselineSelect, matchingOption.value)
    await user.click(screen.getByRole('button', { name: /Save this record/i }))

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
