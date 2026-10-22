import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArchiveView } from './ArchiveView'
import * as archive from './data/archive'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('archive selection identity', () => {
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
