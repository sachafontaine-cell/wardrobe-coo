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

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

interface ZoomCaps { min: number; max: number; step?: number }

/**
 * In-page camera. The preview shows the camera's whole view (nothing hidden), and the
 * photo saved is exactly that view. Batch mode keeps shooting until Done: "Item" starts
 * a new piece, "Label" adds a label shot (care, size, brand) to the piece just photographed.
 */
export function Camera({ single, items, labels, onShot, onPicked, onDone, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState(false)
  const [flash, setFlash] = useState(0)
  const [kind, setKind] = useState<ShotKind>('item')
  const [note, setNote] = useState('')
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null)
  const [backCams, setBackCams] = useState<string[]>([])
  const [camIdx, setCamIdx] = useState(0)
  const [zoomCaps, setZoomCaps] = useState<ZoomCaps | null>(null)
  const [zoom, setZoom] = useState<number | null>(null)

  // Fit the preview to the camera's own shape inside the available space.
  const fit = () => {
    const v = video.current, b = box.current
    if (!v?.videoWidth || !b) return
    const ar = v.videoWidth / v.videoHeight
    const W = b.clientWidth, H = b.clientHeight
    setFrame(W / H > ar ? { w: H * ar, h: H } : { w: W, h: W / ar })
  }
  useEffect(() => {
    const ro = new ResizeObserver(fit)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const deviceId = backCams[camIdx]
    stream.current?.getTracks().forEach((t) => t.stop())
    navigator.mediaDevices?.getUserMedia({
      video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 4096 }, height: { ideal: 3072 } },
      audio: false,
    })
      .then(async (s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return }
        stream.current = s
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}) }
        const track = s.getVideoTracks()[0]
        // Widest view this lens allows, so you can stand closer.
        const caps = (track?.getCapabilities?.() ?? {}) as { zoom?: ZoomCaps }
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          setZoomCaps(caps.zoom)
          setZoom(caps.zoom.min)
          try { await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet] }) } catch { /* not supported */ }
        } else { setZoomCaps(null); setZoom(null) }
        // Other back lenses (e.g. ultra-wide), listed once permission is granted.
        if (!backCams.length) {
          const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && /back|rear|environment/i.test(d.label))
          if (devs.length > 1) {
            // Current lens first, so listing them doesn't restart the camera.
            const current = track?.getSettings?.().deviceId ?? ''
            const ids = devs.map((d) => d.deviceId)
            setBackCams([current, ...ids.filter((i) => i !== current)].filter(Boolean))
          }
        }
      })
      .catch(() => setError(true))
    if (!navigator.mediaDevices) setError(true)
    return () => { cancelled = true }
  }, [camIdx])

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), [])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 1800)
    return () => clearTimeout(t)
  }, [note])

  const setZoomTo = async (z: number) => {
    const track = stream.current?.getVideoTracks()[0]
    if (!track) return
    try { await track.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] }); setZoom(z) } catch { /* ignore */ }
  }

  // The saved photo is the preview frame itself: same view, same orientation.
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
    const blob = await grabFrame()
    if (!blob) return
    onShot(blob, single ? 'item' : kind)
    if (single) { onDone(); return }
    confirm(kind)
  }

  // Lens control: a 0.5×/1× toggle when the camera can zoom out, else switch between back lenses.
  const wideZoom = zoomCaps && zoomCaps.min < 1 ? zoomCaps.min : null
  const lensButton = wideZoom
    ? <button class="lens press" onClick={() => setZoomTo(zoom === wideZoom ? 1 : wideZoom)} aria-label="Change zoom">{zoom === wideZoom ? '1×' : `${Math.round(wideZoom * 10) / 10}×`}</button>
    : backCams.length > 1
      ? <button class="lens press" onClick={() => setCamIdx((camIdx + 1) % backCams.length)} aria-label="Switch lens">Lens {camIdx + 1}/{backCams.length}</button>
      : null

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

      <div class="viewfinder" ref={box}>
        <div class="vf-frame" style={frame ? { width: frame.w, height: frame.h } : { width: '100%', height: '100%' }}>
          <video ref={video} playsInline muted autoPlay onLoadedMetadata={fit} onResize={fit} />
          {labelMode ? <div class="guide guide-label" style={{ position: 'absolute', left: '10%', top: '50%', transform: 'translateY(-50%)' }} /> : <div class="corners"><i /><i /><i /><i /></div>}
          <div class="tip">{labelMode ? `Fill the frame with the label for item ${items}: size, brand, fibers, care.` : 'Stand over it and fill the frame. Plain surface, daylight.'}</div>
          {note && <div class="cam-note">{note}</div>}
          <div key={flash} class={`flash ${flash ? 'go' : ''}`} />
        </div>
        {error && <div style={{ position: 'absolute', padding: 24, textAlign: 'center', fontSize: 15 }}>Camera is unavailable. You can still pick from your photos.</div>}
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
        <div style={{ width: 80, display: 'flex', justifyContent: 'center' }}>{lensButton}</div>
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
