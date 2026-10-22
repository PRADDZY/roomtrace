import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight, BadgeCheck, Check, CircleHelp, FileImage, FileText, Layers3, LockKeyhole, PackageCheck, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import type { Media, Observation, Project } from './data/models'
import { downloadBlob, prettyBytes, slug } from './files'
type ArchiveResult = import('./data/archive').VerificationResult

export function ArchiveView({ project, observations, media, onRestore }: { project: Project | null; observations: Observation[]; media: Media[]; onRestore: (file: Blob) => Promise<void> }) {
  const [result, setResult] = useState<ArchiveResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [checking, setChecking] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [error, setError] = useState('')

  const selectionToken = useRef(0)
  const verifiedFile = useRef<File | null>(null)
  useEffect(() => () => { selectionToken.current++; verifiedFile.current = null }, [])

  async function selectPacket(file?: File) {
    const token = ++selectionToken.current
    verifiedFile.current = null
    setSelectedFile(file ?? null)
    setResult(null)
    setError('')
    if (!file) { setChecking(false); return }
    setChecking(true)
    try {
      const { verifyEvidenceArchive } = await import('./data/archive')
      const checked = await verifyEvidenceArchive(file)
      if (token === selectionToken.current) { setResult(checked); verifiedFile.current = checked.valid ? file : null }
    }
    catch { if (token === selectionToken.current) setError('The selected file could not be read. Choose an EvidenceArchiveV1 ZIP packet.') }
    finally { if (token === selectionToken.current) setChecking(false) }
  }

  async function exportZip() {
    setExporting(true)
    setError('')
    try {
      const { exportEvidenceArchive } = await import('./data/archive')
      const blob = await exportEvidenceArchive(project!.id)
      downloadBlob(blob, `roomtrace-${slug(project!.name)}-archive.zip`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The archive could not be created.') }
    finally { setExporting(false) }
  }

  async function exportPdf() {
    setPdfBusy(true)
    setError('')
    try {
      const { createEvidenceIndex } = await import('./data/pdf')
      const pdf = await createEvidenceIndex(project!, observations, media)
      downloadBlob(pdf, `roomtrace-${slug(project!.name)}-index.pdf`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The evidence index could not be created.') }
    finally { setPdfBusy(false) }
  }

  async function restore() {
    if (!selectedFile || !result?.valid || checking || verifiedFile.current !== selectedFile) return
    setRestoring(true)
    try { await onRestore(selectedFile) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The packet could not be restored.') }
    finally { setRestoring(false) }
  }

  return <div className="archive-layout">{project && <section className="archive-export-card"><div className="archive-card-top"><div><div className="eyebrow small-eyebrow"><span className="eyebrow-line" />EXPORT YOUR JOURNAL</div><h2>Take the originals with you.</h2><p>The ZIP holds the manifest and each original image file. Verify it on this screen or keep it somewhere safe.</p></div><div className="archive-art"><PackageCheck size={25} /><span className="archive-art-lines"><i /><i /><i /></span></div></div><div className="export-summary"><span><FileText size={15} />{observations.length} {observations.length === 1 ? 'observation' : 'observations'}</span><span><FileImage size={15} />{media.length} original {media.length === 1 ? 'file' : 'files'}</span><span><Layers3 size={15} />EvidenceArchiveV1</span></div><div className="export-actions"><button className="button button-dark" onClick={() => void exportZip()} disabled={exporting}>{exporting ? 'Preparing archive…' : <><ArrowDownToLine size={16} />Download verified packet</>}</button><button className="button button-outline" onClick={() => void exportPdf()} disabled={pdfBusy}>{pdfBusy ? 'Preparing index…' : <><FileText size={16} />Download PDF index</>}</button></div><div className="archive-note"><ShieldCheck size={15} /><span>SHA-256 checks are for file integrity. They do not certify a photo’s date, location, or author.</span></div></section>}

    <section className="archive-restore-card"><div className="restore-card-head"><div><div className="eyebrow small-eyebrow"><span className="eyebrow-line" />CHECK OR RESTORE A PACKET</div><h2>Make sure the copy is whole.</h2><p>Choose a RoomTrace ZIP. Verification reads the archive and hashes the actual media bytes before any restore starts.</p></div><div className="restore-icon"><RotateCcw size={20} /></div></div>
      <label htmlFor="archive-upload" className={`packet-drop ${selectedFile ? 'packet-selected' : ''}`}><input id="archive-upload" type="file" accept=".zip,application/zip" disabled={restoring} onChange={(event) => void selectPacket(event.currentTarget.files?.[0])} /><span className="packet-upload-icon"><Upload size={18} /></span><span><strong>{selectedFile ? selectedFile.name : 'Choose a RoomTrace ZIP packet'}</strong><small>{selectedFile ? `${prettyBytes(selectedFile.size)} · ${checking ? 'Checking packet…' : result ? 'Finished reading bytes' : 'Ready to check'}` : 'The full archive is verified before it can be restored.'}</small></span><span className="button button-outline packet-browse">Browse files</span></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      {checking && <div className="verify-loading"><span className="loading-dot" />Checking manifest, record links, file list and original bytes…</div>}
      {result && <div className={`verification-result ${result.valid ? 'verified' : 'rejected'}`}><div className="verify-result-title">{result.valid ? <BadgeCheck size={19} /> : <CircleHelp size={19} />}<div><strong>{result.valid ? 'All archive checks passed.' : 'This packet needs attention.'}</strong><span>{result.valid ? `${result.projectName} · ${result.observationCount} records · ${result.mediaCount} original files` : 'No journal data has been changed.'}</span></div><span className="verify-seal">{result.valid ? 'VERIFIED' : 'NOT VERIFIED'}</span></div><div className="check-grid">{result.checks.map((check) => <span key={check} className={check.endsWith('passed') ? 'check-pass' : 'check-fail'}>{check.endsWith('passed') ? <Check size={13} /> : <CircleHelp size={13} />}{check}</span>)}</div>{result.errors.length > 0 && <ul className="verify-errors">{result.errors.map((item) => <li key={item}>{item}</li>)}</ul>}{result.valid && <div className="restore-confirm"><span>Restore creates a separate journal. Existing records stay in place.</span><button className="button button-dark" onClick={() => void restore()} disabled={restoring || checking}>{restoring ? 'Restoring…' : <>Restore as new journal <ArrowRight size={15} /></>}</button></div>}</div>}
      {!result && !checking && <div className="checks-explainer"><div><span>01</span><strong>Manifest</strong><small>Version and fields</small></div><div><span>02</span><strong>References</strong><small>Every room and pair</small></div><div><span>03</span><strong>Original files</strong><small>Presence and SHA-256</small></div></div>}
    </section>
    <div className="archive-local-note"><LockKeyhole size={15} /><span><strong>Restore is local, too.</strong> The complete archive is validated before the database transaction. A rejected packet leaves this journal unchanged.</span></div>
  </div>
}

