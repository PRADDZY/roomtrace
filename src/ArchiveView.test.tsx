import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArchiveView } from './ArchiveView'
import * as archive from './data/archive'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('archive selection identity', () => {
  it('announces verification progress and restore availability without moving focus', async () => {
    let finish!: (result: archive.VerificationResult) => void
    vi.spyOn(archive, 'verifyEvidenceArchive').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const user = userEvent.setup()
    render(<ArchiveView project={null} observations={[]} media={[]} onRestore={async () => {}} />)
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveAttribute('aria-atomic', 'true')
    const picker = document.getElementById('archive-upload') as HTMLInputElement
    await user.upload(picker, new File(['archive'], 'home.zip', { type: 'application/zip' }))
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(status).toHaveTextContent(/checking/i)
    picker.focus()
    await act(async () => finish({ valid: true, checks: [], errors: [], projectName: 'Home', observationCount: 1, mediaCount: 1 }))
    expect(status).toHaveTextContent(/verification complete/i)
    expect(status).toHaveTextContent(/restore as a new journal is available/i)
    expect(screen.getByRole('button', { name: /Restore as new journal/ })).toBeEnabled()
    expect(picker).toHaveFocus()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('announces an ordinary rejected verification result as an alert', async () => {
    vi.spyOn(archive, 'verifyEvidenceArchive').mockResolvedValueOnce({ valid: false, checks: ['Checksum check failed'], errors: ['The original photo checksum does not match.'], observationCount: 0, mediaCount: 0 })
    const user = userEvent.setup()
    render(<ArchiveView project={null} observations={[]} media={[]} onRestore={async () => {}} />)
    const picker = document.getElementById('archive-upload') as HTMLInputElement
    await user.upload(picker, new File(['archive'], 'broken.zip', { type: 'application/zip' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This packet needs attention.')
    expect(screen.getByRole('alert')).toHaveTextContent('The original photo checksum does not match.')
    expect(screen.getByRole('status')).toHaveTextContent(/verification complete/i)
    expect(screen.getByRole('status')).toHaveTextContent(/restore is unavailable/i)
    expect(screen.queryByRole('button', { name: /Restore as new journal/ })).not.toBeInTheDocument()
    expect(picker).toHaveFocus()
  })
  it('never restores a new selection using the previous verification result', async () => {
    let resolveFirst!: (result: archive.VerificationResult) => void
    let resolveSecond!: (result: archive.VerificationResult) => void
    vi.spyOn(archive, 'verifyEvidenceArchive')
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
    const restore = vi.fn(async () => {})
    const user = userEvent.setup()
    render(<ArchiveView project={null} observations={[]} media={[]} onRestore={restore} />)
    const picker = document.getElementById('archive-upload') as HTMLInputElement
    const first = new File(['one'], 'first.zip', { type: 'application/zip' })
    const second = new File(['two'], 'second.zip', { type: 'application/zip' })
    await user.upload(picker, first)
    await waitFor(() => expect(resolveFirst).toBeTypeOf('function'))
    await user.upload(picker, second)
    await waitFor(() => expect(resolveSecond).toBeTypeOf('function'))
    const valid = { valid: true, checks: [], errors: [], projectName: 'First', observationCount: 0, mediaCount: 0 }
    await act(async () => resolveFirst(valid))
    expect(screen.getByText('second.zip')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Restore as new journal/ })).not.toBeInTheDocument()
    await act(async () => resolveSecond({ ...valid, projectName: 'Second' }))
    await user.click(screen.getByRole('button', { name: /Restore as new journal/ }))
    expect(restore).toHaveBeenCalledExactlyOnceWith(second)
  })
})
