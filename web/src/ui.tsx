import type { ComponentChildren } from 'preact'
import { CREST_PATH, CREST_VIEWBOX } from './crest'
import { COLOR_BY, type ColorFamily, type ItemType, type Opt } from './model'
import { usePhoto } from './store'

export const Crest = ({ size = 36 }: { size?: number }) => (
  <svg class="crest" style={{ width: size, height: size }} viewBox={CREST_VIEWBOX} role="img" aria-label="Fontaine family crest">
    <path d={CREST_PATH} fill="var(--gold)" fill-rule="evenodd" />
  </svg>
)

const SHAPES: Record<string, string> = {
  TOP: 'M30 22 L42 16 Q50 24 58 16 L70 22 L82 34 L72 42 L67 37 L67 84 L33 84 L33 37 L28 42 L18 34 Z',
  PANT: 'M32 10 L68 10 L73 90 L56 90 L50 38 L44 90 L27 90 Z',
  SHORT: 'M28 20 L72 20 L76 66 L55 66 L50 42 L45 66 L24 66 Z',
  SHOE: 'M12 64 Q14 46 30 46 L46 48 Q56 57 72 57 Q88 59 90 70 L90 78 L12 78 Z',
  LAYER: 'M30 14 L42 10 L50 20 L58 10 L70 14 L88 64 L76 68 L68 40 L68 92 L32 92 L32 40 L24 68 L12 64 Z',
  OTHER: 'M30 30 L70 30 L70 70 L30 70 Z',
}
const shapeFor = (t?: ItemType) =>
  t === 'PANT' || t === 'SUIT' ? SHAPES.PANT : t === 'SHORT' ? SHAPES.SHORT : t === 'SHOE' ? SHAPES.SHOE : t === 'LAYER' ? SHAPES.LAYER :
  t === 'ACCESSORY' || !t ? SHAPES.OTHER : SHAPES.TOP

/** Photo from the phone's storage, or a colored silhouette when there is none. */
export function Picture({ id, hasPhoto, type, color, full = false, rev = 0, class: cls = '', src }: {
  id?: string; hasPhoto?: boolean; type?: ItemType; color?: ColorFamily; full?: boolean; rev?: number; class?: string; src?: string
}) {
  const url = usePhoto(id && rev >= 0 ? id : undefined, !full, !!hasPhoto && !src)
  const shown = src ?? url
  return (
    <div class={`pic ${cls}`}>
      {shown ? <img src={shown} alt="" decoding="async" draggable={false} /> : (
        <svg viewBox="0 0 100 100" aria-hidden="true"><path d={shapeFor(type)} fill={color ? COLOR_BY[color].swatch : '#A3A8AE'} /></svg>
      )}
    </div>
  )
}

export function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return <button class={`chip press ${on ? 'on' : ''}`} onClick={onClick}>{label}</button>
}

export function Chips<C extends string>({ options, selected, onToggle }: { options: readonly Opt<C>[]; selected: readonly string[]; onToggle: (c: C) => void }) {
  return <div class="chips">{options.map((o) => <Chip key={o.code} label={o.label} on={selected.includes(o.code)} onClick={() => onToggle(o.code)} />)}</div>
}

export function Sheet({ title, onClose, children, foot }: { title: string; onClose: () => void; children: ComponentChildren; foot?: ComponentChildren }) {
  return (
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class="sheet">
        <div class="sheet-head">
          <div class="grabber" />
          <div class="row"><h2 class="title grow">{title}</h2><button class="press" style={{ fontSize: 22, width: 44, height: 44 }} onClick={onClose} aria-label="Close">✕</button></div>
        </div>
        <div class="sheet-body">{children}</div>
        {foot && <div class="sheet-foot">{foot}</div>}
      </div>
    </div>
  )
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>
)
export const Icons = {
  today: icon('M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'),
  closet: icon('M10 5a2 2 0 1 1 2 2v1L3 15h18l-9-7'),
  profile: icon('M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6'),
  filters: icon('M4 6h16M7 12h10M10 18h4'),
  photos: icon('M4 5h16v14H4z M4 15l4-4 4 4 3-3 5 5 M15 9h.01'),
}

/** "3 new items to review": opens the review queue. */
export function ReviewBanner({ text, onOpen }: { text: string; onOpen: () => void }) {
  return (
    <div class="banner">
      <button class="press" onClick={onOpen}><span>{text}</span><span class="open" style={{ paddingRight: 10 }}>Review ›</span></button>
    </div>
  )
}

export function Toast({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return <div class="toast"><span>{text}</span>{action && <button onClick={onAction}>{action}</button>}</div>
}
