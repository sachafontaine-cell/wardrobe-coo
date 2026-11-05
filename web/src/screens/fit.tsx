import { useRef, useState } from 'preact/hooks'
import type { Item } from '../model'
import { Picture } from '../ui'

export type FitResult = 'FITS' | 'LOOSE' | 'TIGHT'

interface Props {
  prev?: { weightLb?: number; waistIn?: number; date: string }
  onBack: () => void
  /** Saves measurements and photos; returns items worth trying on, with why. */
  onCheck: (input: { weightLb?: number; waistIn?: number; front?: File; side?: File }) => Promise<{ items: Item[]; note: string }>
  onFinish: (results: Record<string, FitResult>) => void
}

export function FitCheck({ prev, onBack, onCheck, onFinish }: Props) {
  const [front, setFront] = useState<File>()
  const [side, setSide] = useState<File>()
  const [weight, setWeight] = useState('')
  const [waist, setWaist] = useState('')
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<{ items: Item[]; note: string } | null>(null)
  const [res, setRes] = useState<Record<string, FitResult>>({})
  const frontRef = useRef<HTMLInputElement>(null)
  const sideRef = useRef<HTMLInputElement>(null)

  const check = async () => {
    setBusy(true)
    const r = await onCheck({ weightLb: weight ? Number(weight) : undefined, waistIn: waist ? Number(waist) : undefined, front, side })
    setFound(r)
    setBusy(false)
  }

  const slot = (label: string, file: File | undefined, ref: { current: HTMLInputElement | null }) => (
    <button class="photo-slot press" onClick={() => ref.current?.click()}>
      {file ? <img src={URL.createObjectURL(file)} alt="" /> : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg><span>{label}</span></>}
    </button>
  )

  return (
    <div class="shell">
      <div class="main stack" style={{ gap: 12, paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
        <div class="row">
          <button class="back press" style={{ fontSize: 26 }} onClick={onBack} aria-label="Back">‹</button>
          <div class="grow">
            <h1 class="title">Fit check</h1>
            <div class="muted">{prev ? `Last: ${[prev.weightLb && `${prev.weightLb} lb`, prev.waistIn && `${prev.waistIn}″ waist`].filter(Boolean).join(', ') || 'photos only'}` : 'About 2 minutes'}</div>
          </div>
        </div>

        {!found ? (
          <>
            <div class="card card-pad stack" style={{ gap: 10 }}>
              <div style={{ fontWeight: 600 }}>1 · Two photos, fitted clothes</div>
              <div class="grid-2">{slot('Front', front, frontRef)}{slot('Side', side, sideRef)}</div>
              <div class="muted">Use the 3-second timer. Full body, arms relaxed. Optional but helps.</div>
              <input ref={frontRef} type="file" accept="image/*" hidden onChange={(e) => setFront((e.target as HTMLInputElement).files?.[0])} />
              <input ref={sideRef} type="file" accept="image/*" hidden onChange={(e) => setSide((e.target as HTMLInputElement).files?.[0])} />
            </div>

            <div class="card card-pad stack" style={{ gap: 10 }}>
              <div style={{ fontWeight: 600 }}>2 · Weight and waist</div>
              <div class="grid-2">
                <label class="stack" style={{ gap: 4 }}><span class="muted">Weight (lb)</span>
                  <input class="field" type="number" inputMode="decimal" value={weight} onInput={(e) => setWeight((e.target as HTMLInputElement).value)} /></label>
                <label class="stack" style={{ gap: 4 }}><span class="muted">Waist (in)</span>
                  <input class="field" type="number" inputMode="decimal" step="0.5" value={waist} onInput={(e) => setWaist((e.target as HTMLInputElement).value)} /></label>
              </div>
              <div class="row waist-guide">
                <svg width="86" height="120" viewBox="0 0 120 168" role="img" aria-label="Tape around the waist where your pants sit">
                  <circle cx="60" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="3" />
                  <path d="M60 33 L60 40 M30 44 Q60 36 90 44 L84 104 Q83 118 86 132 L76 164 M34 132 Q37 118 36 104 L30 44 M44 164 L34 132" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M30 46 L18 100 M90 46 L102 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                  <ellipse cx="60" cy="108" rx="27" ry="6" fill="none" stroke="#C48A12" stroke-width="3.5" stroke-dasharray="6 4" />
                </svg>
                <ol class="steps" style={{ fontSize: 14, gap: 4 }}>
                  <li>Tape where your pants sit, just below the belly button.</li>
                  <li>Level all the way round.</li>
                  <li>Snug, not tight. Breathe out, read.</li>
                </ol>
              </div>
            </div>
            <button class="btn btn-primary press" disabled={busy || (!weight && !waist && !front)} onClick={check}>{busy ? 'Checking…' : 'Check my fit'}</button>
          </>
        ) : (
          <>
            <div class="card card-pad stack" style={{ gap: 6 }}>
              <div>{found.note}</div>
            </div>
            {found.items.length > 0 && (
              <div class="card card-pad stack" style={{ gap: 12 }}>
                <div style={{ fontWeight: 600 }}>3 · Try these on</div>
                {found.items.map((i) => (
                  <div key={i.id} class="stack" style={{ gap: 8 }}>
                    <div class="row"><Picture id={i.id} hasPhoto={i.hasPhoto} type={i.type} color={i.colorFamily} class="thumb48" /><span class="grow">{i.name}</span></div>
                    <div class="grid-3">
                      {(['FITS', 'LOOSE', 'TIGHT'] as FitResult[]).map((r) => (
                        <button key={r} class={`chip press ${res[i.id] === r ? 'on' : ''}`} onClick={() => setRes({ ...res, [i.id]: r })}>{r === 'FITS' ? 'Fits' : r === 'LOOSE' ? 'Loose' : 'Tight'}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button class="btn btn-primary press" onClick={() => onFinish(res)}>Done</button>
          </>
        )}
      </div>
    </div>
  )
}
