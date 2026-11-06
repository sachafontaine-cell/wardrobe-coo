import { useEffect, useRef, useState } from 'preact/hooks'
import { Icons } from '../ui'

export type ShotKind = 'item' | 'label'

interface Props {
  single: boolean
  items: number
  labels: number
  onShot: (b: Blob, kind: ShotKind) => void
  onPicked: (files: File[], kind: ShotKind) => void
  onDone: () => void
  onClose: () => void
}

declare class ImageCapture { constructor(track: MediaStreamTrack); takePhoto(): Promise<Blob> }

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/**
 * In-page camera. Batch mode keeps shooting until Done: "Item" starts a new piece,
 * "Label" adds a label shot (care, size, brand) to the piece just photographed.
 */
export function Camera({ single, items, labels, onShot, onPicked, onDone, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const capturer = useRef<ImageCapture | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState(false)
  const [flash, setFlash] = useState(0)
  const [kind, setKind] = useState<ShotKind>('item')
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 2560 } }, audio: false })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return }
        stream.current = s
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}) }
        const track = s.getVideoTracks()[0]
        if (typeof (window as any).ImageCapture === 'function' && track) capturer.current = new ImageCapture(track)
      })
      .catch(() => setError(true))
    if (!navigator.mediaDevices) setError(true)
    return () => { cancelled = true; stream.current?.getTracks().forEach((t) => t.stop()) }
  }, [])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 1800)
    return () => clearTimeout(t)
  }, [note])

  const grabFrame = async (): Promise<Blob | null> => {
    const v = video.current
    if (!v || !v.videoWidth) return null
    const c = new OffscreenCanvas(v.videoWidth, v.videoHeight)
    c.getContext('2d')!.drawImage(v, 0, 0)
    return c.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
  }

  const confirm = (k: ShotKind, n = 1) =>
    setNote(k === 'label' ? `${n > 1 ? `${n} labels` : 'Label'} added to item ${items}` : `Item ${items + n} added${n === 1 ? '. Snap its label next?' : ''}`)

  const shoot = async () => {
    setFlash((n) => n + 1)
    let blob: Blob | null = null
    try { blob = capturer.current ? await capturer.current.takePhoto() : null } catch { blob = null }
    if (!blob) blob = await grabFrame()
    if (!blob) return
    onShot(blob, single ? 'item' : kind)
    if (single) { onDone(); return }
    confirm(kind)
  }

  const labelMode = !single && kind === 'label'
  return (
    <div class="cam">
      <div class="row">
        <button class="press" style={{ fontSize: 22, width: 44, height: 44, color: '#F7F3EA' }} onClick={onClose} aria-label="Close">✕</button>
        <div class="grow" style={{ textAlign: 'center', fontSize: 15, fontWeight: 500 }}>
          {single ? 'Replace photo' : `${plural(items, 'item')}${labels ? ` · ${plural(labels, 'label')}` : ''}`}
        </div>
        {single ? <div style={{ width: 64 }} /> : <button class="done press" disabled={items === 0} onClick={onDone}>Done</button>}
      </div>

      <div class="viewfinder">
        <video ref={video} playsInline muted autoPlay />
        {error && <div style={{ position: 'relative', padding: 24, textAlign: 'center', fontSize: 15 }}>Camera is unavailable. You can still pick from your photos.</div>}
        <div class={`guide ${labelMode ? 'guide-label' : ''}`} />
        <div class="tip">{labelMode ? `Fill the frame with the label for item ${items}: size, brand, fibers, care.` : 'Lay flat on a plain surface, fill the frame, daylight.'}</div>
        {note && <div class="cam-note">{note}</div>}
        <div key={flash} class={`flash ${flash ? 'go' : ''}`} />
      </div>

      {!single && (
        <div class="seg" role="tablist" aria-label="What are you photographing?">
          <button role="tab" aria-selected={kind === 'item'} class={kind === 'item' ? 'on' : ''} onClick={() => setKind('item')}>Item</button>
          <button role="tab" aria-selected={kind === 'label'} class={kind === 'label' ? 'on' : ''} disabled={items === 0} onClick={() => setKind('label')}>Label</button>
        </div>
      )}

      <div class="row" style={{ justifyContent: 'space-between', padding: '0 12px' }}>
        <div style={{ width: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <button class="press" onClick={() => fileRef.current?.click()} aria-label="Pick from your photos"
            style={{ width: 56, height: 56, borderRadius: 12, border: '2px solid #F7F3EA', color: '#F7F3EA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 26, height: 26, display: 'inline-flex' }}>{Icons.photos}</span>
          </button>
          <span style={{ fontSize: 12, color: '#C9C3B6' }}>Your photos</span>
        </div>
        <button class={`shutter ${labelMode ? 'shutter-label' : ''}`} disabled={error} onClick={shoot} aria-label={labelMode ? 'Take label photo' : 'Take photo'}><span /></button>
        <div style={{ width: 80 }} />
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple={!single} hidden onChange={(e) => {
        const files = Array.from((e.target as HTMLInputElement).files ?? [])
        ;(e.target as HTMLInputElement).value = ''
        if (!files.length) return
        onPicked(files, single ? 'item' : kind)
        if (single) onDone()
        else confirm(kind, files.length)
      }} />
    </div>
  )
}
