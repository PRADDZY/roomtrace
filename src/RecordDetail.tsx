import { useEffect, useRef, useState } from 'react'
import type { Media, Observation } from './data/models'

export function RecordDetail({ observation, media, onClose }: { observation: Observation; media: Media[]; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(0)
  const [url, setUrl] = useState('')
  const photo = media[selected]
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow; previous?.focus() }
  }, [])
  useEffect(() => {
    if (!photo) return
    const next = URL.createObjectURL(photo.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [photo])
  return <div className="record-modal-backdrop"><div ref={dialog} className="record-modal" role="dialog" aria-modal="true" aria-labelledby="record-detail-title" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
    if (event.key === 'Tab') {
      const elements = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'))
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }}>
    <button className="button button-outline" onClick={onClose}>Close record</button>
    <h2 id="record-detail-title">{observation.title}</h2>
    <p>{observation.room} · {observation.phase} · {new Date(observation.recordedAt).toLocaleString()}</p>
    {observation.phase === 'move-out' && !observation.baselineId && <p>Unpaired historic move-out record</p>}
    <p className="record-full-notes">{observation.notes || 'No note added.'}</p>
    <p>Saved observations are fixed. Add a new observation to record a correction.</p>
    {photo && <><img className="record-original" src={url || undefined} alt={`${photo.fileName} — photo ${selected + 1} of ${media.length}`} /><p>{photo.fileName} · Photo {selected + 1} of {media.length}</p><a className="button button-outline" href={url} download={photo.fileName}>Download original photo</a></>}
    <nav className="record-photo-controls" aria-label="Record photos">{media.map((item, index) => <button key={item.id} className="button button-outline" aria-label={`View photo ${index + 1}: ${item.fileName}`} aria-pressed={selected === index} onClick={() => setSelected(index)}>{index + 1}</button>)}</nav>
  </div></div>
}
