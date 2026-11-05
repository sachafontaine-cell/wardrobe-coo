import { useEffect, useState } from 'preact/hooks'
import { type AppData, type Item, profileOf } from '../model'
import { type CheckState, gaps, missingPhotos } from '../review'
import { pastAverageHigh, seasonNote } from '../weather'
import { prettyDate } from '../dates'
import { Picture } from '../ui'

interface Props {
  data: AppData
  state: CheckState
  onBack: () => void
  onKeep: (id: string) => void
  onDonate: (id: string) => void
  onReplace: (item: Item) => void
  onBestBuy: (prompt: string) => void
  onFitCheck: () => void
  onTakePhoto: (id: string) => void
  onDone: () => void
}

export function ClosetCheck({ data, state, onBack, onKeep, onDonate, onReplace, onBestBuy, onFitCheck, onTakePhoto, onDone }: Props) {
  const [season, setSeason] = useState<string>('')
  const loc = profileOf(data).location
  useEffect(() => {
    if (!state.big) return
    setSeason('Checking the last 30 days…')
    pastAverageHigh(loc.lat, loc.lon).then((t) => setSeason(seasonNote(t))).catch(() => setSeason('Weather history unavailable right now.'))
  }, [state.big])
  const missing = missingPhotos(data.items)
  const g = gaps(data.items)
  const fitDoneRecently = (data.reviews ?? []).some((r) => r.type === 'fit_check' && r.date >= state.reviewDate)

  return (
    <div class="shell">
      <div class="main stack" style={{ gap: 12, paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
        <div class="row">
          <button class="back press" style={{ fontSize: 26 }} onClick={onBack} aria-label="Back">‹</button>
          <div class="grow">
            <h1 class="title">{state.big ? 'Closet review' : 'Closet check'}</h1>
            <div class="muted">{prettyDate(state.reviewDate)} · {state.flags.length ? `${state.flags.length} item${state.flags.length === 1 ? '' : 's'} need a decision` : 'Nothing to decide'}</div>
          </div>
        </div>

        {state.flags.map(({ item, reason }) => (
          <div key={item.id} class="card card-pad stack" style={{ gap: 10, padding: 12 }}>
            <div class="row">
              <Picture id={item.id} hasPhoto={item.hasPhoto} type={item.type} color={item.colorFamily} class="thumb72" />
              <div class="grow">
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div class="muted">{reason}</div>
              </div>
            </div>
            <div class="grid-3">
              <button class="btn btn-secondary btn-sm press" onClick={() => onKeep(item.id)}>Keep</button>
              <button class="btn btn-danger btn-sm press" onClick={() => onDonate(item.id)}>Donate</button>
              <button class="btn btn-primary btn-sm press" onClick={() => onReplace(item)}>Replace</button>
            </div>
          </div>
        ))}

        {state.big && (
          <div class="card card-pad stack" style={{ gap: 12 }}>
            <div class="label">Twice-yearly review</div>
            <div class="stack" style={{ gap: 6 }}>
              <div style={{ fontWeight: 600 }}>1. Best next buy</div>
              <div class="muted">{g.length ? `Gaps: ${g.join('; ')}.` : 'No gaps against your targets.'}</div>
              <button class="btn btn-secondary btn-sm press" onClick={() => onBestBuy(
                `Closet review: what is the single highest-leverage buy right now? Gaps: ${g.join('; ') || 'none'}. Weigh my life mix. Give one exact product with a link.`)}>Find the best next buy</button>
            </div>
            <div class="stack" style={{ gap: 6 }}>
              <div style={{ fontWeight: 600 }}>2. Fit check</div>
              <div class="muted">{fitDoneRecently ? 'Done ✓' : '2 photos, weight and waist. About 2 minutes.'}</div>
              {!fitDoneRecently && <button class="btn btn-secondary btn-sm press" onClick={onFitCheck}>Start fit check</button>}
            </div>
            <div class="stack" style={{ gap: 6 }}>
              <div style={{ fontWeight: 600 }}>3. Season</div>
              <div class="muted">{season}</div>
            </div>
            <div class="stack" style={{ gap: 6 }}>
              <div style={{ fontWeight: 600 }}>4. Missing photos</div>
              {missing.length === 0 ? <div class="muted">Every item has a photo.</div> : missing.map((i) => (
                <div key={i.id} class="row">
                  <span class="grow">{i.name}</span>
                  <button class="link" onClick={() => onTakePhoto(i.id)}>Take photo</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <button class="btn btn-primary press" onClick={onDone}>Done</button>
      </div>
    </div>
  )
}
