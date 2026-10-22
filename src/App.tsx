import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileCheck2,
  FileImage,
  FileText,
  HardDrive,
  House,
  ImagePlus,
  Layers3,
  LockKeyhole,
  MapPin,
  PackageCheck,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react'
import { db } from './data/database'
import { hashBlob } from './data/hash'
import type { Media, Observation, ObservationPhase, Project } from './data/models'

type Section = 'overview' | 'capture' | 'compare' | 'archive'
type ArchiveResult = import('./data/archive').VerificationResult

const roomDefaults = ['Living room', 'Kitchen', 'Bedroom', 'Bathroom', 'Entry']

const pageCopy: Record<Section, { eyebrow: string; title: string; note: string }> = {
  overview: { eyebrow: 'YOUR FIELD JOURNAL', title: 'A clear record, from day one.', note: 'Keep the small details that are easy to forget and hard to prove later.' },
  capture: { eyebrow: 'ADD TO THE RECORD', title: 'Notice it. Photograph it. Save it.', note: 'An observation belongs to a room, a moment, and the original photo.' },
  compare: { eyebrow: 'BEFORE / AFTER', title: 'Look at the same place twice.', note: 'Compare a move-out record against the exact move-in baseline you chose.' },
  archive: { eyebrow: 'YOUR COPY, YOUR CALL', title: 'Keep a copy you can verify.', note: 'Export the original media, check the packet, or restore it as a separate journal.' },
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function prettyBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function slug(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home'
}

function useImageUrl(blob?: Blob) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!blob) { setUrl(''); return }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

function EvidenceImage({ media, label }: { media?: Media; label: string }) {
  const src = useImageUrl(media?.blob)
  if (!media) return <div className="image-placeholder"><ImagePlus size={22} /><span>{label}</span></div>
  return <div className="evidence-image"><img src={src || undefined} alt={`${label}: ${media.fileName}`} /><span className="image-caption"><FileImage size={13} />{media.fileName}</span></div>
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export default function App() {
  const location = useLocation()
  return location.pathname === '/quality' ? <QualityPage /> : <Workspace />
}

function Workspace() {
  const [section, setSection] = useState<Section>('overview')
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [observations, setObservations] = useState<Observation[]>([])
  const [media, setMedia] = useState<Media[]>([])
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')

  const refreshProject = useCallback(async (projectId: string) => {
    const [nextProject, nextObservations, nextMedia, allProjects] = await Promise.all([
      db.projects.get(projectId),
      db.observations.where('projectId').equals(projectId).toArray(),
      db.media.where('projectId').equals(projectId).toArray(),
      db.projects.orderBy('createdAt').reverse().toArray(),
    ])
    setProjects(allProjects)
    setProject(nextProject ?? null)
    setObservations(nextObservations.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)))
    setMedia(nextMedia)
    if (nextProject) localStorage.setItem('roomtrace.activeProject', nextProject.id)
  }, [])

  useEffect(() => {
    let active = true
    void db.projects.orderBy('createdAt').reverse().toArray().then(async (allProjects) => {
      if (!active) return
      setProjects(allProjects)
      const remembered = localStorage.getItem('roomtrace.activeProject')
      const first = allProjects.find((item) => item.id === remembered) ?? allProjects[0]
      if (first) await refreshProject(first.id)
    }).catch(() => setMessage('This browser could not open its local journal. Try a current version of Chrome, Safari, Firefox, or Edge.')).finally(() => {
      if (active) setReady(true)
    })
    return () => { active = false }
  }, [refreshProject])

  const mediaFor = useCallback((observationId: string) => media.filter((item) => item.observationId === observationId), [media])
  const roomCount = project?.rooms.length ?? 0
  const recordedRooms = useMemo(() => new Set(observations.map((item) => item.room)).size, [observations])
  const coverage = roomCount ? Math.min(100, Math.round(recordedRooms / roomCount * 100)) : 0

  async function saveProject(input: { name: string; address: string; rooms: string[] }) {
    const next: Project = { id: crypto.randomUUID(), name: input.name.trim(), address: input.address.trim(), rooms: input.rooms, createdAt: new Date().toISOString() }
    await db.projects.add(next)
    await refreshProject(next.id)
    setSection('overview')
    setMessage('Your journal is ready. Add the first room record when you are there.')
  }

  async function createDemo() {
    const projectId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const nextProject: Project = {
      id: projectId,
      name: 'Sunday apartment · sample',
      address: '17 Alder Lane, Portland, Maine',
      createdAt,
      rooms: ['Living room', 'Kitchen', 'Bedroom', 'Bathroom', 'Entry'],
    }
    const svg = (wall: string, floor: string, detail: string) => new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480"><rect width="720" height="480" fill="${wall}"/><path d="M0 350 720 300v180H0z" fill="${floor}"/><path d="M110 72h252v214H110z" fill="#f4f0e8"/><path d="M133 96h96v104h-96z" fill="#d7e4dc"/><path d="M244 96h94v104h-94z" fill="#d7e4dc"/><path d="M138 211h196v15H138z" fill="#c5b59d"/><path d="M415 164h152v134H415z" fill="#b87355" opacity=".82"/><path d="M435 181h112v96H435z" fill="#e5d6bd"/><path d="M470 230h42v46h-42z" fill="#6f8275"/><circle cx="594" cy="92" r="24" fill="#e4c47c"/><path d="M0 348h720" stroke="#8c735d" stroke-width="4"/><text x="34" y="438" fill="#f8f5ee" font-family="sans-serif" font-size="19" letter-spacing="3">${detail}</text></svg>`], { type: 'image/svg+xml' })
    const firstId = crypto.randomUUID()
    const lastId = crypto.randomUUID()
    const firstPhoto = svg('#aebcb0', '#9d8e7c', 'SAMPLE IMAGE · KITCHEN / MOVE-IN')
    const lastPhoto = svg('#b9c1b4', '#a49582', 'SAMPLE IMAGE · KITCHEN / MOVE-OUT')
    const first: Observation = { id: firstId, projectId, room: 'Kitchen', phase: 'move-in', title: 'Sink cabinet · arrival', notes: 'Sample record. A small scrape is already visible below the left hinge.', recordedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString() }
    const last: Observation = { id: lastId, projectId, room: 'Kitchen', phase: 'move-out', title: 'Sink cabinet · departure', notes: 'Sample record. The original scrape is still present; no claim is being made about who caused it.', recordedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), baselineId: firstId }
    const toMedia = async (observation: Observation, blob: Blob, fileName: string): Promise<Media> => ({
      id: crypto.randomUUID(), projectId, observationId: observation.id, fileName, mimeType: blob.type, blob, sha256: await hashBlob(blob),
    })
    try {
      const firstMedia = await toMedia(first, firstPhoto, 'sample-kitchen-arrival.svg')
      const lastMedia = await toMedia(last, lastPhoto, 'sample-kitchen-departure.svg')
      await db.transaction('rw', db.projects, db.observations, db.media, async () => {
        await db.projects.add(nextProject)
        await db.observations.bulkAdd([first, last])
        await db.media.bulkAdd([firstMedia, lastMedia])
      })
      await refreshProject(projectId)
      setSection('overview')
      setMessage('Sample journal loaded. Its records and illustrations are clearly marked as sample data.')
    } catch {
      setMessage('The sample journal could not be saved in this browser. Check available storage and try again.')
    }
  }

  async function saveObservation(input: { room: string; phase: ObservationPhase; title: string; notes: string; baselineId?: string; files: File[] }) {
    if (!project) return
    const observation: Observation = {
      id: crypto.randomUUID(), projectId: project.id, room: input.room, phase: input.phase,
      title: input.title.trim(), notes: input.notes.trim(), recordedAt: new Date().toISOString(),
      ...(input.phase === 'move-out' && input.baselineId ? { baselineId: input.baselineId } : {}),
    }
    try {
      const storedMedia = await Promise.all(input.files.map(async (file): Promise<Media> => ({
        id: crypto.randomUUID(), projectId: project.id, observationId: observation.id,
        fileName: file.name, mimeType: file.type || 'application/octet-stream', sha256: await hashBlob(file), blob: file,
      })))
      await db.transaction('rw', db.observations, db.media, async () => {
        await db.observations.add(observation)
        await db.media.bulkAdd(storedMedia)
      })
      await refreshProject(project.id)
      setSection('overview')
      setMessage('Record saved on this device, with its original photo files.')
    } catch (error) {
      const reason = error instanceof DOMException && error.name === 'QuotaExceededError'
        ? 'Browser storage is full. Export an archive, free space, then try again.'
        : 'This browser could not save the record. Your existing journal is unchanged; try again or export a copy first.'
      setMessage(reason)
    }
  }

  async function restorePacket(file: Blob) {
    try {
      const { restoreEvidenceArchive } = await import('./data/archive')
      const restored = await restoreEvidenceArchive(file)
      await refreshProject(restored.project.id)
      setSection('overview')
      setMessage(`Restored “${restored.project.name}” as a separate journal with ${restored.observationCount} records and ${restored.mediaCount} original files.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The packet could not be restored. Your existing journal was not changed.')
      throw error
    }
  }

  if (!ready) return <div className="boot-screen"><div className="brand-mark"><Layers3 size={19} /></div><span>Opening your local journal…</span></div>
  if (!project) return <StartPage error={message} onCreate={saveProject} onDemo={createDemo} />

  const copy = pageCopy[section]
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand-lockup" aria-label="RoomTrace home" onClick={() => setSection('overview')}>
          <span className="brand-mark"><Layers3 size={19} strokeWidth={1.8} /></span>
          <span className="brand-name">roomtrace<span>FIELD JOURNAL · 01</span></span>
        </Link>
        <div className="side-label">JOURNAL</div>
        <nav className="side-nav" aria-label="Journal">
          <button className={section === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('overview')}><House size={17} /><span>Overview</span><span className="nav-count">{observations.length}</span></button>
          <button className={section === 'capture' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('capture')}><Camera size={17} /><span>Add a record</span></button>
          <button className={section === 'compare' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('compare')}><ArrowLeftRight size={17} /><span>Compare</span></button>
          <button className={section === 'archive' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('archive')}><PackageCheck size={17} /><span>Archive & restore</span></button>
        </nav>
        <div className="side-divider" />
        <div className="side-label">YOUR SPACE</div>
        <label className="property-chip"><span className="property-dot" /><select aria-label="Choose journal" value={project.id} onChange={(event) => void refreshProject(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></label>
        <div className="side-property-address"><MapPin size={13} />{project.address || 'Address not added'}</div>
        <div className="sidebar-spacer" />
        <div className="privacy-card"><span className="privacy-icon"><LockKeyhole size={15} /></span><p><strong>Your evidence stays here.</strong><br />Photos and notes are stored in this browser. Nothing uploads.</p></div>
        <Link to="/quality" className="quality-link"><ShieldCheck size={15} />How RoomTrace checks its archive<ArrowRight size={13} /></Link>
        <div className="side-foot">ROOMTRACE <span>·</span> PRIVATE BY DESIGN</div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb"><span>FIELD JOURNAL</span><span className="breadcrumb-slash">/</span><strong>{project.name}</strong></div>
          <div className="topbar-right"><span className="local-pill"><span />LOCAL VAULT · ON THIS DEVICE</span><span className="avatar-mark">{project.name.slice(0, 1).toUpperCase()}</span></div>
        </header>
        <main className="page-wrap">
          <div className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-line" />{copy.eyebrow}</div><h1>{copy.title}</h1><p>{copy.note}</p></div>
            {section !== 'capture' && <button className="button button-dark heading-action" onClick={() => setSection('capture')}><Plus size={16} />Add a record</button>}
          </div>
          {message && <div className="toast-message" role="status"><BadgeCheck size={17} />{message}<button aria-label="Dismiss message" onClick={() => setMessage('')}>×</button></div>}
          {section === 'overview' && <Overview project={project} observations={observations} mediaFor={mediaFor} coverage={coverage} onAdd={() => setSection('capture')} onCompare={() => setSection('compare')} />}
          {section === 'capture' && <CaptureForm project={project} observations={observations} onSave={saveObservation} onCancel={() => setSection('overview')} />}
          {section === 'compare' && <CompareView observations={observations} mediaFor={mediaFor} />}
          {section === 'archive' && <ArchiveView project={project} observations={observations} media={media} onRestore={restorePacket} />}
          <footer className="page-footer"><span>ROOMTRACE · YOUR HOME, WELL REMEMBERED</span><span>PHOTOS STAY IN THIS BROWSER <LockKeyhole size={12} /></span></footer>
        </main>
      </div>
    </div>
  )
}

function StartPage({ error, onCreate, onDemo }: { error: string; onCreate: (data: { name: string; address: string; rooms: string[] }) => Promise<void>; onDemo: () => Promise<void> }) {
  const [name, setName] = useState('My home')
  const [address, setAddress] = useState('')
  const [rooms, setRooms] = useState<string[]>(roomDefaults)
  const [roomInput, setRoomInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) { setFormError('Give this journal a name to continue.'); return }
    setSaving(true)
    setFormError('')
    try { await onCreate({ name, address, rooms }) }
    catch { setFormError('This browser could not create a journal. Check browser storage and try again.') }
    finally { setSaving(false) }
  }

  function addRoom() {
    const room = roomInput.trim()
    if (room && !rooms.some((item) => item.toLowerCase() === room.toLowerCase())) setRooms((current) => [...current, room])
    setRoomInput('')
  }

  return (
    <div className="onboarding-page">
      <header className="onboarding-top"><Link to="/" className="brand-lockup"><span className="brand-mark"><Layers3 size={19} /></span><span className="brand-name">roomtrace<span>FIELD JOURNAL · 01</span></span></Link><span className="local-pill"><span />LOCAL ONLY · NO ACCOUNT</span></header>
      <main className="onboarding-layout">
        <section className="onboarding-story">
          <div className="eyebrow"><span className="eyebrow-line" />A QUIETER WAY TO KEEP THE DETAILS</div>
          <h1>Good records make a home feel <em>settled.</em></h1>
          <p className="onboarding-intro">A private, photo-first journal for the small things you notice when you move in—and the changes you want to remember when you leave.</p>
          <div className="onboarding-illustration" aria-label="Illustration of a home journal">
            <div className="illustration-sun" /><div className="illustration-paper"><div className="paper-topline"><span>ROOM 02 / KITCHEN</span><span>01—19</span></div><div className="paper-photo"><div className="mini-window" /><div className="mini-cabinet" /><div className="mini-floor" /></div><div className="paper-caption"><span className="caption-dot" />MOVE-IN · 1 PHOTO SAVED</div></div>
            <div className="illustration-tag"><LockKeyhole size={13} />STAYS ON THIS DEVICE</div>
            <div className="illustration-leaf leaf-one" /><div className="illustration-leaf leaf-two" />
          </div>
          <div className="onboarding-points"><span><ShieldCheck size={15} />Private by default</span><span><FileCheck2 size={15} />Portable evidence packet</span><span><ArrowLeftRight size={15} />Exact before / after pairing</span></div>
        </section>
        <section className="setup-card">
          <div className="setup-step"><span>01</span><span className="setup-step-line" /><span>YOUR PLACE</span></div>
          <h2>Start a journal</h2>
          <p>Give your space a name. You can add more rooms and records any time.</p>
          <form onSubmit={submit} className="setup-form">
            <label className="field-label" htmlFor="home-name">Journal name</label>
            <input id="home-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={64} placeholder="My home" />
            <label className="field-label" htmlFor="home-address">Address <span>OPTIONAL</span></label>
            <input id="home-address" className="text-input" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={160} placeholder="Street, city" autoComplete="street-address" />
            <div className="field-label room-label">Rooms <span>{rooms.length} ADDED</span></div>
            <div className="room-chips">{rooms.map((room) => <button type="button" className="room-chip" key={room} onClick={() => setRooms((current) => current.filter((item) => item !== room))} aria-label={`Remove ${room}`}>{room}<span>×</span></button>)}</div>
            <div className="add-room-row"><input className="text-input" value={roomInput} onChange={(event) => setRoomInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addRoom() } }} placeholder="Add a room" maxLength={40} /><button className="button button-outline square-button" type="button" onClick={addRoom} aria-label="Add room"><Plus size={17} /></button></div>
            {(formError || error) && <div className="form-error" role="alert">{formError || error}</div>}
            <button className="button button-dark setup-submit" type="submit" disabled={saving}>{saving ? 'Creating journal…' : <>Create my journal <ArrowRight size={16} /></>}</button>
          </form>
          <div className="setup-divider"><span />OR TAKE A LOOK AROUND<span /></div>
          <button className="demo-button" onClick={() => void onDemo()}><Sparkles size={15} />Open the clearly marked sample journal</button>
          <div className="setup-privacy"><LockKeyhole size={13} />Nothing uploads. Your journal lives in this browser.</div>
        </section>
      </main>
      <footer className="onboarding-footer"><span>ROOMTRACE · 2026</span><span>LOCAL FIRST, ALWAYS <span className="footer-mark">✳</span></span></footer>
    </div>
  )
}

function Overview({ project, observations, mediaFor, coverage, onAdd, onCompare }: {
  project: Project; observations: Observation[]; mediaFor: (id: string) => Media[]; coverage: number; onAdd: () => void; onCompare: () => void
}) {
  const moveInCount = observations.filter((item) => item.phase === 'move-in').length
  const moveOutCount = observations.filter((item) => item.phase === 'move-out').length
  const isSample = project.name.includes('· sample')
  const pairedCount = observations.filter((item) => item.phase === 'move-out' && item.baselineId).length

  return (
    <>
      {isSample && <div className="sample-banner"><Sparkles size={15} /><span><strong>Sample journal</strong> · the illustration and notes below are fictional examples. They are not evidence of a real property.</span><span className="sample-tag">DEMO DATA</span></div>}
      <section className="hero-card">
        <div className="hero-left"><div className="hero-kicker"><span className="hero-kicker-mark"><House size={14} /></span>YOUR PLACE, IN CONTEXT <span className="hero-index">01 / 01</span></div><h2>{project.name}</h2><div className="hero-address"><MapPin size={14} />{project.address || 'Add an address when you are ready'}</div>
          <div className="hero-coverage"><div className="coverage-top"><span>ROOMS WITH A RECORD</span><strong>{coverage}% <small>OF YOUR JOURNAL</small></strong></div><div className="coverage-track"><span style={{ width: `${coverage}%` }} /></div><div className="coverage-foot"><span>{new Set(observations.map((item) => item.room)).size} of {project.rooms.length} rooms started</span><span>{project.rooms.length} rooms listed</span></div></div>
          <div className="hero-actions"><button className="button button-paper" onClick={onAdd}><Camera size={16} />Add a room record<ArrowRight size={15} /></button><button className="text-link-light" onClick={onCompare}>See a before / after <ArrowRight size={14} /></button></div>
        </div>
        <div className="hero-right"><div className="floorplan-head"><span>ROOM INDEX</span><span>LIVE FROM YOUR JOURNAL</span></div><div className="floorplan-grid">{project.rooms.slice(0, 6).map((room, index) => {
          const has = observations.some((item) => item.room === room)
          return <div key={room} className={`floor-room floor-room-${index + 1} ${has ? 'has-record' : ''}`}><span className="floor-room-no">0{index + 1}</span><span>{room}</span>{has && <Check size={13} />}</div>
        })}</div><div className="floorplan-note"><span className="floorplan-dot" />{observations.length ? `${observations.length} observations across ${new Set(observations.map((item) => item.room)).size} rooms` : 'Your first observation will show here'}</div></div>
      </section>

      <section className="metric-strip" aria-label="Journal summary"><Metric icon={<FileText size={17} />} value={observations.length} label="RECORDS SAVED" /><Metric icon={<Camera size={17} />} value={observations.reduce((sum, item) => sum + mediaFor(item.id).length, 0)} label="ORIGINAL PHOTOS" /><Metric icon={<ArrowLeftRight size={17} />} value={pairedCount} label="BEFORE / AFTER PAIRS" /><Metric icon={<Clock3 size={17} />} value={project.createdAt ? dateLabel(project.createdAt) : '—'} label="JOURNAL STARTED" /></section>

      <div className="section-heading-row"><div><div className="eyebrow small-eyebrow"><span className="eyebrow-line" />RECENT NOTES</div><h2 className="section-title">The details, in order.</h2></div><span className="record-count">{observations.length ? `${observations.length} TOTAL` : 'NO RECORDS YET'}</span></div>
      {observations.length ? <div className="record-list">{observations.slice(0, 5).map((item, index) => <ObservationRow key={item.id} observation={item} media={mediaFor(item.id)} index={index} />)}</div> : <div className="empty-records"><div className="empty-record-icon"><Camera size={21} /></div><div><h3>Start with what you notice.</h3><p>A photo and a sentence are enough to create a useful first record.</p></div><button className="button button-dark" onClick={onAdd}><Plus size={16} />Add first record</button></div>}
      <div className="phase-strip"><div className="phase-item"><span className="phase-icon arrival"><House size={17} /></span><div><strong>Arrival record</strong><span>{moveInCount} {moveInCount === 1 ? 'observation' : 'observations'} at move-in</span></div></div><div className="phase-arrow"><ArrowRight size={18} /></div><div className="phase-item"><span className="phase-icon departure"><ArrowDownToLine size={17} /></span><div><strong>Departure record</strong><span>{moveOutCount} {moveOutCount === 1 ? 'observation' : 'observations'} at move-out</span></div></div><div className="phase-callout"><ShieldCheck size={16} /><span>Pair each later note with its original room baseline.</span></div></div>
    </>
  )
}

function Metric({ icon, value, label }: { icon: ReactNode; value: string | number; label: string }) {
  return <div className="metric-item"><span className="metric-icon">{icon}</span><div><strong>{value}</strong><span>{label}</span></div></div>
}

function ObservationRow({ observation, media, index }: { observation: Observation; media: Media[]; index: number }) {
  const thumb = useImageUrl(media[0]?.blob)
  return <article className="record-row"><div className="record-index">{String(index + 1).padStart(2, '0')}</div><div className="record-thumb">{thumb ? <img src={thumb} alt="" /> : <FileImage size={18} />}</div><div className="record-main"><div className="record-room"><span className={observation.phase === 'move-in' ? 'phase-pill arrival-pill' : 'phase-pill departure-pill'}>{observation.phase === 'move-in' ? 'MOVE-IN' : 'MOVE-OUT'}</span><span>{observation.room}</span><span className="record-separator">·</span><span>{timeLabel(observation.recordedAt)}</span></div><h3>{observation.title}</h3><p>{observation.notes || 'No note added.'}</p></div><div className="record-end"><span className="record-photos"><FileImage size={14} />{media.length} {media.length === 1 ? 'photo' : 'photos'}</span>{observation.baselineId && <span className="paired-pill"><Check size={12} />PAIRED</span>}</div></article>
}

function CaptureForm({ project, observations, onSave, onCancel }: {
  project: Project; observations: Observation[]; onSave: (input: { room: string; phase: ObservationPhase; title: string; notes: string; baselineId?: string; files: File[] }) => Promise<void>; onCancel: () => void
}) {
  const [phase, setPhase] = useState<ObservationPhase>('move-in')
  const [room, setRoom] = useState(project.rooms[0] ?? '')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [baselineId, setBaselineId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const baselines = observations.filter((item) => item.phase === 'move-in' && item.room === room)

  function chooseFiles(list: FileList | null) {
    setError('')
    const chosen = Array.from(list ?? [])
    if (chosen.length > 10) { setError('Choose up to 10 images per record.'); return }
    if (chosen.some((file) => !file.type.startsWith('image/'))) { setError('Choose image files only.'); return }
    if (chosen.some((file) => file.size > 25 * 1024 * 1024)) { setError('Each image must be 25 MB or smaller. Your original files are kept as uploaded.'); return }
    setFiles(chosen)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) { setError('Add a short title for this observation.'); return }
    if (!files.length) { setError('Add at least one photo. Original images are the heart of this record.'); return }
    if (phase === 'move-out' && !baselineId) { setError('Choose the move-in record that shows this same room.'); return }
    setSaving(true)
    setError('')
    try { await onSave({ room, phase, title, notes, baselineId: phase === 'move-out' ? baselineId : undefined, files }) }
    catch { setError('The record did not save. Your existing journal is unchanged; try again.') }
    finally { setSaving(false) }
  }

  return <div className="capture-layout"><section className="capture-card"><div className="capture-card-head"><div><div className="eyebrow small-eyebrow"><span className="eyebrow-line" />NEW OBSERVATION</div><h2>Make it easy to remember.</h2></div><span className="capture-number">RECORD · {String(observations.length + 1).padStart(2, '0')}</span></div>
    <form className="capture-form" onSubmit={submit}>
      <div className="field-label">When is this record from?</div><div className="phase-toggle" role="group" aria-label="Record phase"><button type="button" className={phase === 'move-in' ? 'phase-choice selected' : 'phase-choice'} onClick={() => { setPhase('move-in'); setBaselineId('') }}><span className="choice-icon"><House size={16} /></span><span><strong>Move-in</strong><small>Starting condition</small></span>{phase === 'move-in' && <Check size={15} />}</button><button type="button" className={phase === 'move-out' ? 'phase-choice selected' : 'phase-choice'} onClick={() => { setPhase('move-out'); setBaselineId('') }}><span className="choice-icon out"><ArrowDownToLine size={16} /></span><span><strong>Move-out</strong><small>Later condition</small></span>{phase === 'move-out' && <Check size={15} />}</button></div>
      <div className="capture-fields"><div className="field-block"><label className="field-label" htmlFor="record-room">Room</label><select id="record-room" className="text-input" value={room} onChange={(event) => { setRoom(event.target.value); setBaselineId('') }}>{project.rooms.map((item) => <option key={item}>{item}</option>)}</select></div><div className="field-block"><label className="field-label" htmlFor="record-title">What did you notice?</label><input id="record-title" className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Scuff below the window" maxLength={100} /></div></div>
      {phase === 'move-out' && <div className="baseline-picker"><div className="baseline-title"><span className="baseline-icon"><ArrowLeftRight size={15} /></span><div><strong>Choose the matching move-in record</strong><small>RoomTrace links this exact baseline for comparison.</small></div></div>{baselines.length ? <select className="text-input" aria-label="Matching move-in record" value={baselineId} onChange={(event) => setBaselineId(event.target.value)}><option value="">Choose an earlier {room.toLowerCase()} record…</option>{baselines.map((item) => <option key={item.id} value={item.id}>{dateLabel(item.recordedAt)} · {item.title}</option>)}</select> : <div className="inline-hint"><CircleHelp size={15} />Add a move-in record for {room} first, then pair a later observation.</div>}</div>}
      <div className="field-block notes-block"><label className="field-label" htmlFor="record-notes">A little more context <span>OPTIONAL</span></label><textarea id="record-notes" className="text-input textarea" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Where is it? What does it look like? Stick to what you can see." maxLength={1000} rows={4} /><div className="char-count">{notes.length} / 1000</div></div>
      <div className="field-block"><div className="upload-label-row"><label className="field-label" htmlFor="record-photos">Original photos <span>REQUIRED · UP TO 10</span></label>{files.length > 0 && <button type="button" className="clear-files" onClick={() => setFiles([])}>Remove all</button>}</div><label className={`upload-zone ${files.length ? 'has-files' : ''}`} htmlFor="record-photos"><span className="upload-icon"><ImagePlus size={19} /></span><span><strong>{files.length ? `${files.length} ${files.length === 1 ? 'photo' : 'photos'} ready` : 'Choose photos from this device'}</strong><small>Full-size originals stay in your local journal.</small></span><span className="button button-outline upload-browse">Browse</span><input id="record-photos" type="file" accept="image/*" multiple capture="environment" onChange={(event) => chooseFiles(event.currentTarget.files)} /></label>{files.length > 0 && <div className="file-list">{files.map((file) => <span key={`${file.name}-${file.size}`}><FileImage size={13} />{file.name}<small>{prettyBytes(file.size)}</small></span>)}</div>}</div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="capture-submit-row"><div className="capture-privacy"><LockKeyhole size={14} /><span>Saved on this device only.<br /><strong>No cloud upload.</strong></span></div><div className="capture-actions"><button className="button button-quiet" type="button" onClick={onCancel}>Cancel</button><button className="button button-dark" type="submit" disabled={saving || (phase === 'move-out' && baselines.length === 0)}>{saving ? 'Saving…' : <>Save this record <ArrowRight size={16} /></>}</button></div></div>
    </form>
  </section><aside className="capture-aside"><div className="aside-card guide-card"><div className="aside-icon"><BookOpenCheck size={17} /></div><div className="eyebrow small-eyebrow">A USEFUL RECORD</div><h3>Three things make it clear.</h3><div className="guide-row"><span>01</span><p><strong>Where</strong><small>Pick the room, then get specific.</small></p><Check size={14} /></div><div className="guide-row"><span>02</span><p><strong>When</strong><small>The saved time comes from your device clock.</small></p><Check size={14} /></div><div className="guide-row"><span>03</span><p><strong>What you see</strong><small>Keep the original photo and say what is visible.</small></p><Check size={14} /></div><div className="guide-disclaimer">RoomTrace records files and notes. It does not authenticate when or where a photo was taken.</div></div><div className="aside-card storage-card"><HardDrive size={16} /><div><strong>Keep your own copy.</strong><p>Browser storage can be cleared. Export your archive before switching devices.</p></div></div></aside></div>
}

function CompareView({ observations, mediaFor }: { observations: Observation[]; mediaFor: (id: string) => Media[] }) {
  const paired = observations.filter((item) => item.phase === 'move-out' && item.baselineId)
  const [selectedId, setSelectedId] = useState(paired[0]?.id ?? '')
  useEffect(() => { if (!paired.some((item) => item.id === selectedId)) setSelectedId(paired[0]?.id ?? '') }, [paired, selectedId])
  const current = paired.find((item) => item.id === selectedId)
  const baseline = observations.find((item) => item.id === current?.baselineId)

  return <section className="compare-shell"><div className="compare-toolbar"><div><span className="compare-label"><span />PAIRED BY YOU</span><h2>One room. Two moments.</h2><p>Every comparison uses the specific move-in record selected for this move-out note.</p></div>{paired.length > 1 && <label className="compare-select-wrap"><span>CHOOSE A PAIR</span><select className="text-input" aria-label="Choose comparison pair" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{paired.map((item) => <option key={item.id} value={item.id}>{item.room} · {item.title}</option>)}</select></label>}</div>
    {current && baseline ? <><div className="compare-context"><span className="compare-room-index">ROOM {String(Math.max(1, observations.filter((item) => item.room.localeCompare(current.room) < 0).length + 1)).padStart(2, '0')}</span><strong>{current.room}</strong><span className="context-divider" /><span>{current.title}</span><span className="context-badge"><Check size={12} />EXACT BASELINE LINK</span></div><div className="compare-grid"><ComparePanel label="MOVE-IN · BASELINE" observation={baseline} media={mediaFor(baseline.id)} variant="arrival" /><div className="compare-middle"><div className="compare-arrow"><ArrowRight size={18} /></div><span>THEN / NOW</span></div><ComparePanel label="MOVE-OUT · LATER" observation={current} media={mediaFor(current.id)} variant="departure" /></div><div className="compare-footnote"><ShieldCheck size={15} /><span>Files are displayed side by side from the same local journal. RoomTrace does not infer damage, cause, or responsibility.</span></div></> : <div className="compare-empty"><div className="empty-pair-mark"><ArrowLeftRight size={20} /></div><h3>No complete comparison yet.</h3><p>Add a move-in record with an original photo. When you record the room again, select that exact baseline to make a pair.</p><div className="compare-empty-steps"><span><b>01</b> Photograph a room on move-in</span><ArrowRight size={14} /><span><b>02</b> Select it as the later baseline</span></div></div>}
  </section>
}

function ComparePanel({ label, observation, media, variant }: { label: string; observation: Observation; media: Media[]; variant: 'arrival' | 'departure' }) {
  return <article className={`compare-panel ${variant}`}><div className="compare-panel-head"><span className="phase-pill">{label}</span><span>{dateLabel(observation.recordedAt)}</span></div><div className="compare-photo-grid">{media.length ? media.slice(0, 3).map((item) => <EvidenceImage key={item.id} media={item} label={observation.room} />) : <EvidenceImage label="No photo in this record" />}</div><div className="compare-caption"><strong>{observation.title}</strong><p>{observation.notes || 'No note added.'}</p><span><Clock3 size={12} />RECORDED {timeLabel(observation.recordedAt)}</span></div></article>
}

function ArchiveView({ project, observations, media, onRestore }: { project: Project; observations: Observation[]; media: Media[]; onRestore: (file: Blob) => Promise<void> }) {
  const [result, setResult] = useState<ArchiveResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [checking, setChecking] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [error, setError] = useState('')

  async function selectPacket(file?: File) {
    setSelectedFile(file ?? null)
    setResult(null)
    setError('')
    if (!file) return
    setChecking(true)
    try {
      const { verifyEvidenceArchive } = await import('./data/archive')
      setResult(await verifyEvidenceArchive(file))
    }
    catch { setError('The selected file could not be read. Choose an EvidenceArchiveV1 ZIP packet.') }
    finally { setChecking(false) }
  }

  async function exportZip() {
    setExporting(true)
    setError('')
    try {
      const { exportEvidenceArchive } = await import('./data/archive')
      const blob = await exportEvidenceArchive(project.id)
      downloadBlob(blob, `roomtrace-${slug(project.name)}-archive.zip`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The archive could not be created.') }
    finally { setExporting(false) }
  }

  async function exportPdf() {
    setPdfBusy(true)
    setError('')
    try {
      const { createEvidenceIndex } = await import('./data/pdf')
      const pdf = await createEvidenceIndex(project, observations, media)
      downloadBlob(pdf, `roomtrace-${slug(project.name)}-index.pdf`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The evidence index could not be created.') }
    finally { setPdfBusy(false) }
  }

  async function restore() {
    if (!selectedFile || !result?.valid) return
    setRestoring(true)
    try { await onRestore(selectedFile) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The packet could not be restored.') }
    finally { setRestoring(false) }
  }

  return <div className="archive-layout"><section className="archive-export-card"><div className="archive-card-top"><div><div className="eyebrow small-eyebrow"><span className="eyebrow-line" />EXPORT YOUR JOURNAL</div><h2>Take the originals with you.</h2><p>The ZIP holds the manifest and each original image file. Verify it on this screen or keep it somewhere safe.</p></div><div className="archive-art"><PackageCheck size={25} /><span className="archive-art-lines"><i /><i /><i /></span></div></div><div className="export-summary"><span><FileText size={15} />{observations.length} {observations.length === 1 ? 'observation' : 'observations'}</span><span><FileImage size={15} />{media.length} original {media.length === 1 ? 'file' : 'files'}</span><span><Layers3 size={15} />EvidenceArchiveV1</span></div><div className="export-actions"><button className="button button-dark" onClick={() => void exportZip()} disabled={exporting}>{exporting ? 'Preparing archive…' : <><ArrowDownToLine size={16} />Download verified packet</>}</button><button className="button button-outline" onClick={() => void exportPdf()} disabled={pdfBusy}>{pdfBusy ? 'Preparing index…' : <><FileText size={16} />Download PDF index</>}</button></div><div className="archive-note"><ShieldCheck size={15} /><span>SHA-256 checks are for file integrity. They do not certify a photo’s date, location, or author.</span></div></section>

    <section className="archive-restore-card"><div className="restore-card-head"><div><div className="eyebrow small-eyebrow"><span className="eyebrow-line" />CHECK OR RESTORE A PACKET</div><h2>Make sure the copy is whole.</h2><p>Choose a RoomTrace ZIP. Verification reads the archive and hashes the actual media bytes before any restore starts.</p></div><div className="restore-icon"><RotateCcw size={20} /></div></div>
      <label htmlFor="archive-upload" className={`packet-drop ${selectedFile ? 'packet-selected' : ''}`}><input id="archive-upload" type="file" accept=".zip,application/zip" onChange={(event) => void selectPacket(event.currentTarget.files?.[0])} /><span className="packet-upload-icon"><Upload size={18} /></span><span><strong>{selectedFile ? selectedFile.name : 'Choose a RoomTrace ZIP packet'}</strong><small>{selectedFile ? `${prettyBytes(selectedFile.size)} · ${checking ? 'Checking packet…' : result ? 'Finished reading bytes' : 'Ready to check'}` : 'The full archive is verified before it can be restored.'}</small></span><span className="button button-outline packet-browse">Browse files</span></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      {checking && <div className="verify-loading"><span className="loading-dot" />Checking manifest, record links, file list and original bytes…</div>}
      {result && <div className={`verification-result ${result.valid ? 'verified' : 'rejected'}`}><div className="verify-result-title">{result.valid ? <BadgeCheck size={19} /> : <CircleHelp size={19} />}<div><strong>{result.valid ? 'All archive checks passed.' : 'This packet needs attention.'}</strong><span>{result.valid ? `${result.projectName} · ${result.observationCount} records · ${result.mediaCount} original files` : 'No journal data has been changed.'}</span></div><span className="verify-seal">{result.valid ? 'VERIFIED' : 'NOT VERIFIED'}</span></div><div className="check-grid">{result.checks.map((check) => <span key={check} className={check.endsWith('passed') ? 'check-pass' : 'check-fail'}>{check.endsWith('passed') ? <Check size={13} /> : <CircleHelp size={13} />}{check}</span>)}</div>{result.errors.length > 0 && <ul className="verify-errors">{result.errors.map((item) => <li key={item}>{item}</li>)}</ul>}{result.valid && <div className="restore-confirm"><span>Restore creates a separate journal. Existing records stay in place.</span><button className="button button-dark" onClick={() => void restore()} disabled={restoring}>{restoring ? 'Restoring…' : <>Restore as new journal <ArrowRight size={15} /></>}</button></div>}</div>}
      {!result && !checking && <div className="checks-explainer"><div><span>01</span><strong>Manifest</strong><small>Version and fields</small></div><div><span>02</span><strong>References</strong><small>Every room and pair</small></div><div><span>03</span><strong>Original files</strong><small>Presence and SHA-256</small></div></div>}
    </section>
    <div className="archive-local-note"><LockKeyhole size={15} /><span><strong>Restore is local, too.</strong> The complete archive is validated before the database transaction. A rejected packet leaves this journal unchanged.</span></div>
  </div>
}

function QualityPage() {
  const evidence = [
    { requirement: 'Keep original media bytes', scenario: 'Export and inspect the actual ZIP entries', check: 'src/data/archive.test.ts · EvidenceArchiveV1', status: 'Covered' },
    { requirement: 'Detect damaged or missing files', scenario: 'Change a photo byte; remove a listed file', check: 'checksum and missing-media cases', status: 'Covered' },
    { requirement: 'Restore safely as a new journal', scenario: 'Verify all records and remap exact pair links', check: 'transactional restore case', status: 'Covered' },
    { requirement: 'Reject incomplete restore without writes', scenario: 'Corrupt packet while an existing journal is present', check: 'unchanged-database case', status: 'Covered' },
    { requirement: 'Run app checks on pull requests', scenario: 'GitHub Actions build and archive suite', check: 'workflow configured; first remote run pending', status: 'Ready' },
    { requirement: 'Test the real deployed user journey', scenario: 'TestSprite plan: upload → reload → export → restore', check: 'connect GitHub trigger after Free plan rollout', status: 'Pending' },
  ]
  return <div className="quality-page"><header className="quality-top"><Link to="/" className="brand-lockup"><span className="brand-mark"><Layers3 size={19} /></span><span className="brand-name">roomtrace<span>QUALITY NOTE · 01</span></span></Link><Link to="/" className="button button-outline quality-back"><ArrowRight size={15} />Back to journal</Link></header><main className="quality-content"><div className="eyebrow"><span className="eyebrow-line" />HOW THE RECORD IS CHECKED</div><h1>Evidence should survive<br />its own inspection.</h1><p className="quality-lede">RoomTrace keeps photos local. Its export can be checked independently against the bytes inside the packet before restoring anything.</p><div className="quality-callout"><div><ShieldCheck size={20} /></div><p><strong>A checksum answers one narrow question:</strong> do these bytes match the checksum recorded in this archive? It does not prove when, where, or by whom a photo was taken.</p></div><div className="quality-table-wrap"><div className="quality-table-title"><div><span className="eyebrow small-eyebrow"><span className="eyebrow-line" />REQUIREMENT → TEST → EVIDENCE</span><h2>What the verification covers.</h2></div><span className="quality-table-stamp"><FileCheck2 size={14} />IMPLEMENTATION TRACE</span></div><div className="quality-table"><div className="quality-head"><span>REQUIREMENT</span><span>SCENARIO</span><span>CHECK IN SOURCE</span><span>STATE</span></div>{evidence.map((row) => <div className="quality-row" key={row.requirement}><div><strong>{row.requirement}</strong></div><div>{row.scenario}</div><div className="quality-code">{row.check}</div><div><span className={`state-pill ${row.status.toLowerCase()}`}>{row.status === 'Covered' ? <Check size={12} /> : <Clock3 size={12} />}{row.status}</span></div></div>)}</div></div><div className="quality-transparency"><div className="transparency-icon"><CircleHelp size={16} /></div><div><strong>Run history is not connected yet.</strong><p>This page maps requirements to source checks. It does not invent PR IDs, commits, or TestSprite results. The TestSprite PR trigger still needs the account integration and its Free plan CI rollout.</p></div></div><div className="quality-method"><span>METHOD</span><p>Version 1 uses a JSON manifest, a strict file list, record reference checks, and SHA-256 over each original file. Restore validates the entire packet before opening a single write transaction.</p></div><footer className="quality-footer"><span>ROOMTRACE · QUALITY NOTE 01</span><span>BUILT FOR INSPECTION, NOT ASSUMPTION</span></footer></main></div>
}
