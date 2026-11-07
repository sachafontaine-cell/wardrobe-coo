import { useEffect, useState } from 'preact/hooks'
import { type AppData, COLOR_BY, type Item, type ItemType, type ReviewEntry, emptyData, profileOf, typeLabel } from './model'
import { type Action, ask } from './ask'
import { systemPrompt } from './ask'
import { checkState, nextReviewDate } from './review'
import { comparePhotos, fitFlags } from './fit'
import { AskSheet, type Msg } from './screens/ask'
import { ClosetCheck } from './screens/check'
import { FitCheck, type FitResult } from './screens/fit'
import { getBlob, putBlob } from './store'
import * as Ops from './ops'
import { deletePhotos, getData, getPhotoBlob, loadFailed, preloadThumbs, putPhoto, replaceAll, update, useData } from './store'
import { addLabel, addPhoto, getDrafts, releaseDeferred, remove as removeDraft, useDraftSummary } from './drafts'
import { processLabel, processPhoto } from './photo'
import { addDays, daysBetween, todayStr } from './dates'
import { getContext, onContextChange, refreshContext, setDay, useContext } from './context'
import { getSettings, setSettings, useSettings } from './settings'
import { uploadBackup } from './google'
import { MODEL_LOGIC, type Tagging, pickModel, tagQueued } from './gemini'
import { Icons, Toast } from './ui'
import { applyUpdate, checkForUpdate, onUpdateReady, setHomeCheck } from './update'
import { Today } from './screens/today'
import { Closet } from './screens/closet'
import { ItemDetail } from './screens/item'
import { Camera } from './screens/camera'
import { Review } from './screens/review'
import { Profile } from './screens/profile'

const VERSION = '0.5.5'

type Tab = 'today' | 'closet' | 'profile'
type Sub = { kind: 'detail'; id: string } | { kind: 'camera'; replaceId?: string } | { kind: 'review' } | { kind: 'ask' } | { kind: 'check'; force?: boolean } | { kind: 'fit' }

/** Daily upkeep and today's pick. Safe to call often. */
export function refreshDay(): string {
  const today = todayStr()
  setDay(today)
  let expired: string[] = []
  update((d) => {
    const m = Ops.dailyMaintenance(d, today)
    expired = m.expired
    return Ops.ensurePick(m.data, today, getContext().cond)
  })
  expired.forEach((id) => deletePhotos(id))
  return today
}

// When fresh weather or calendar arrives, re-pick (only if nothing is logged yet).
onContextChange(() => update((d) => Ops.ensurePick(d, todayStr(), getContext().cond)))

const toDataUrl = (b?: Blob) =>
  b ? new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b) }) : Promise.resolve(undefined)

const labelKey = (id: string, n: number) => `label:${id}:${n}`
async function labelBlobs(item: Item): Promise<Blob[]> {
  const out: Blob[] = []
  for (let n = 0; n < (item.labels ?? 0); n++) { const b = await getBlob(labelKey(item.id, n)); if (b) out.push(b) }
  return out
}

async function backupJson(): Promise<string> {
  const d = getData()
  const photos: Record<string, { full?: string; thumb?: string; labels?: string[] }> = {}
  for (const i of d.items) {
    if (!i.hasPhoto && !i.labels) continue
    const labels = await Promise.all((await labelBlobs(i)).map((b) => toDataUrl(b)))
    photos[i.id] = {
      ...(i.hasPhoto ? { full: await toDataUrl(await getPhotoBlob(i.id, false)), thumb: await toDataUrl(await getPhotoBlob(i.id, true)) } : {}),
      ...(labels.length ? { labels: labels as string[] } : {}),
    }
  }
  // The Google link travels with the backup so a restore reconnects; the Gemini key does not.
  return JSON.stringify({ app: 'wardrobe-coo', v: 1, data: d, photos, google: getSettings().google })
}

/** Fills only fields that are still empty. */
function mergeTagging(item: Item, t: Tagging, fromLabel: boolean): Item {
  const out: Item = { ...item }
  const fill = <K extends keyof Item>(k: K, v: Item[K] | undefined) => {
    if (v === undefined) return
    const cur = out[k]
    if (cur === undefined || cur === '' || (Array.isArray(cur) && cur.length === 0)) out[k] = v
  }
  fill('colorFamily', t.colorFamily); fill('exactColor', t.exactColor); fill('pattern', t.pattern); fill('fit', t.fit)
  fill('formality', t.formality); fill('weight', t.weight); fill('season', t.season); fill('contexts', t.contexts); fill('brand', t.brand)
  if (fromLabel) {
    if (t.fabrics?.length) out.fabrics = t.fabrics
    for (const k of ['blend', 'brand', 'size', 'care'] as const) if (t[k]) out[k] = t[k]
  }
  else { fill('fabrics', t.fabrics); fill('blend', t.blend) }
  if (t.paletteFail && !item.paletteFail) { out.paletteFail = true; out.failReason = t.failReason }
  if (t.hero && !item.hero) out.hero = true
  return out
}

const markBackedUp = () => update((d) => ({ ...d, prefs: { ...d.prefs, lastBackup: todayStr(), backupSnoozeUntil: undefined } }))

async function backupToDrive() {
  await uploadBackup(`wardrobe-backup-${todayStr()}.json`, await backupJson())
  markBackedUp()
}

/** With Google connected: back up to Drive weekly, silently. */
let backingUp = false
async function autoBackup() {
  const d = getData()
  if (backingUp || !getSettings().google || !d.items.length) return
  if (d.prefs.lastBackup && daysBetween(d.prefs.lastBackup, todayStr()) < 7) return
  backingUp = true
  try { await backupToDrive() } catch { /* try again next open; the 4-week prompt is the fallback */ }
  backingUp = false
}

export function App() {
  const data = useData()
  const pending = useDraftSummary()
  // Counts at the moment the camera opened, so it shows this session's shots only.
  const [camBase, setCamBase] = useState({ count: 0, labels: 0 })
  const ctx = useContext()
  const settings = useSettings()
  const [today, setToday] = useState(todayStr())
  const [tab, setTab] = useState<Tab>('today')
  const [stack, setStack] = useState<Sub[]>([])
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<{ text: string; action?: string; run?: () => void; sticky?: boolean } | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [askBusy, setAskBusy] = useState(false)
  const [prefill, setPrefill] = useState<string | undefined>()
  const top = stack[stack.length - 1]
  const screen = [...stack].reverse().find((s) => s.kind !== 'ask')
  const askOpen = top?.kind === 'ask'
  const cond = ctx.cond
  const check = checkState(data, today)

  // Home-screen shortcuts: ?ask=1, ?add=1, ?tab=closet
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    if (q.get('tab') === 'closet') setTab('closet')
    if (q.get('add')) startAdd()
    else if (q.get('ask')) openAsk()
    if (q.toString()) history.replaceState(history.state, '', location.pathname)
  }, [])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setToday(refreshDay())
      refreshContext().then(autoBackup)
    }
    document.addEventListener('visibilitychange', onVisible)
    preloadThumbs(getData().items.filter((i) => i.hasPhoto && i.status === 'ACTIVE').map((i) => i.id))
    // Saved keys: switch to the current model choice (newest stable Flash).
    const s = getSettings()
    if (s.geminiKey && s.modelLogic !== MODEL_LOGIC) pickModel(s.geminiKey).then((m) => setSettings({ geminiModel: m, modelLogic: MODEL_LOGIC })).catch(() => {})
    refreshContext().then(autoBackup)
    // One-time fit update you asked for: Tailored, slight break, mid-high rise.
    if (!getData().prefs.fitV2) update((d) => ({ ...d, profile: { ...profileOf(d), fitOverall: 'Tailored', pantBreak: 'Slight', rise: 'Mid-high' }, prefs: { ...d.prefs, fitV2: true } }))
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Phone back button / gesture closes the top screen.
  useEffect(() => {
    const onPop = () => setStack((s) => s.slice(0, -1))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // A new version is ready: offer it now; it also applies itself next time you leave the app.
  setHomeCheck(() => stack.length === 0)
  useEffect(() => onUpdateReady(() => setToast({ text: 'New version ready', action: 'Reload', run: applyUpdate, sticky: true })), [])

  useEffect(() => {
    if (!toast || toast.sticky) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const push = (s: Sub) => { history.pushState({ d: stack.length + 1 }, ''); setStack((st) => [...st, s]) }
  const pop = () => history.back()
  const replaceTop = (s: Sub) => setStack((st) => [...st.slice(0, -1), s])
  const goSetup = () => { const depth = stack.length; if (depth) { setStack([]); history.go(-depth) } setTab('profile') }

  const startAdd = () => {
    const d = getDrafts()
    setCamBase({ count: d.length, labels: d.reduce((n, x) => n + x.labels.length + x.labelsPending, 0) })
    push({ kind: 'camera' })
  }
  const toReview = pending.count ? {
    text: `${pending.count} new item${pending.count === 1 ? '' : 's'} to review${pending.tagging ? ` · ${pending.tagging} tagging` : ''}`,
    onOpen: () => push({ kind: 'review' }),
  } : undefined
  const openAsk = (text?: string) => { setPrefill(text); if (top?.kind !== 'ask') push({ kind: 'ask' }) }
  const addReview = (e: ReviewEntry) => update((d) => ({ ...d, reviews: [...(d.reviews ?? []), e].slice(-200) }))

  // ---- Ask ----
  const applyAction = (a: Action): { text: string; undo?: () => void } | undefined => {
    const d = getData()
    const day = todayStr()
    const name = (id: string) => d.items.find((i) => i.id === id)?.name ?? id
    if (a.type === 'donate') {
      update((x) => Ops.ensurePick(Ops.donate(x, a.id, day), day, getContext().cond))
      return { text: `Donated ${name(a.id)}`, undo: () => update((x) => Ops.ensurePick(Ops.restore(x, a.id), day, getContext().cond)) }
    }
    if (a.type === 'condition') {
      const before = d.items.find((i) => i.id === a.id)?.condition
      update((x) => ({ ...x, items: x.items.map((i) => (i.id === a.id ? { ...i, condition: a.value } : i)) }))
      return { text: `Marked ${name(a.id)} as ${a.value.toLowerCase()}`, undo: () => update((x) => ({ ...x, items: x.items.map((i) => (i.id === a.id && before ? { ...i, condition: before } : i)) })) }
    }
    if (a.type === 'tonight') {
      update((x) => ({ ...x, prefs: { ...x.prefs, tonight: { date: day, text: a.text } } }))
      return { text: 'Added tonight\'s change to Today', undo: () => update((x) => ({ ...x, prefs: { ...x.prefs, tonight: undefined } })) }
    }
    if (a.type === 'add') {
      const types: ItemType[] = ['POLO', 'TEE', 'SHIRT', 'PANT', 'SHORT', 'LAYER', 'SUIT', 'SHOE', 'SWIM', 'WORKOUT', 'ACCESSORY']
      if (!types.includes(a.item.type)) return undefined
      const id = Ops.nextId(d.items, a.item.type)
      const it: Item = {
        id, name: a.item.name, type: a.item.type, contexts: a.item.contexts ?? [], fabrics: [], hero: false, paletteFail: false,
        colorFamily: a.item.colorFamily as Item['colorFamily'], formality: a.item.formality as Item['formality'], weight: a.item.weight as Item['weight'],
        condition: 'GOOD', status: 'ACTIVE', hasPhoto: false, added: day, eligibleDaysUnworn: 0,
      }
      update((x) => Ops.ensurePick({ ...x, items: [...x.items, it] }, day, getContext().cond))
      return { text: `Added ${it.name} (${id}). Add a photo from Closet.`, undo: () => update((x) => ({ ...x, items: x.items.filter((i) => i.id !== id) })) }
    }
    return undefined
  }

  const sendAsk = async (text: string) => {
    const s = getSettings()
    if (!s.geminiKey || !s.geminiModel) return
    const next: Msg[] = [...msgs, { role: 'user', text }]
    setMsgs(next); setAskBusy(true); setPrefill(undefined)
    const d = getData()
    const day = todayStr()
    const shown = Ops.shownOutfit(d, day)
    const sys = systemPrompt(d, {
      date: day, weather: getContext().weatherLine, occasion: Ops.occasionFor(d, day, getContext().cond),
      plan: [getContext().plan.detail, getContext().plan.evening && `evening: ${getContext().plan.evening!.title} ${getContext().plan.evening!.time}`].filter(Boolean).join('; '),
      outfit: shown ? [shown.topId, shown.bottomId, shown.shoeId, ...(shown.layerId ? [shown.layerId] : [])] : [],
    })
    try {
      const ans = await ask(s.geminiKey, s.geminiModel, sys, next.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text })), new Set(d.items.map((i) => i.id)))
      const notes = ans.actions.map(applyAction).filter(Boolean) as Msg['notes']
      setMsgs([...next, { role: 'model', text: ans.text, notes, sources: ans.sources }])
    } catch (e) {
      setMsgs([...next, { role: 'model', text: (e as Error).message || "Couldn't reach Gemini.", error: true }])
    }
    setAskBusy(false)
  }

  // ---- Closet check ----
  const keepItem = (id: string) => {
    const until = nextReviewDate(todayStr())
    update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, keptUntil: until } : i)) }))
    addReview({ date: todayStr(), type: check.big ? 'big_review' : 'closet_check', itemId: id, action: 'keep' })
  }
  const donateFromCheck = (id: string) => {
    update((d) => Ops.ensurePick(Ops.donate(d, id, todayStr()), todayStr(), getContext().cond))
    addReview({ date: todayStr(), type: check.big ? 'big_review' : 'closet_check', itemId: id, action: 'donate' })
  }
  const replaceFromCheck = (item: Item) => {
    const until = nextReviewDate(todayStr())
    update((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, keptUntil: until } : i)) }))
    addReview({ date: todayStr(), type: check.big ? 'big_review' : 'closet_check', itemId: item.id, action: 'replace' })
    openAsk(`Find one specific replacement for [[${item.id}]] ${item.name}, with a link. I'll donate the old one when it arrives.`)
  }
  const finishCheck = () => {
    update((d) => ({ ...d, prefs: { ...d.prefs, reviewsDone: [...new Set([...(d.prefs.reviewsDone ?? []), check.reviewDate])].slice(-12), checkSnoozeUntil: undefined } }))
    pop()
  }

  // ---- Fit check ----
  const runFit = async (input: { weightLb?: number; waistIn?: number; front?: File; side?: File }) => {
    const s = getSettings()
    let photo
    const before = await getBlob('fit-front')
    if (input.front && before && s.geminiKey && s.geminiModel) {
      try { photo = await comparePhotos(s.geminiKey, s.geminiModel, before, input.front) } catch { photo = undefined }
    }
    const result = fitFlags(getData(), input.weightLb, input.waistIn, photo)
    const day = todayStr()
    if (input.front) await putBlob('fit-front', input.front)
    if (input.side) await putBlob('fit-side', input.side)
    update((d) => {
      const p = profileOf(d)
      return {
        ...d,
        profile: {
          ...p, updated: day,
          weightLb: input.weightLb ?? p.weightLb, waist: input.waistIn ?? p.waist,
          fitHistory: [...p.fitHistory, { date: day, weightLb: input.weightLb, waistIn: input.waistIn }].slice(-20),
        },
      }
    })
    addReview({ date: day, type: 'fit_check', action: 'note', notes: result.note })
    return result
  }
  const finishFit = (res: Record<string, FitResult>) => {
    const month = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    update((d) => ({ ...d, items: d.items.map((i) => (res[i.id] ? { ...i, fitNote: res[i.id] === 'FITS' ? undefined : `${res[i.id] === 'LOOSE' ? 'Loose' : 'Tight'} · ${month}` } : i)) }))
    Object.entries(res).forEach(([id, r]) => addReview({ date: todayStr(), type: 'fit_check', itemId: id, action: 'fit', notes: r }))
    const n = Object.values(res).filter((r) => r !== 'FITS').length
    pop()
    if (n) setToast({ text: `${n} item${n === 1 ? '' : 's'} marked. Alter or replace from Closet.` })
  }

  /** Looks right: these drafts join the closet. */
  const saveDrafts = async (keys: string[]) => {
    const ready = getDrafts().filter((d) => keys.includes(d.key) && d.photo && d.type)
    const added: Item[] = []
    const taken: string[] = []
    const day = todayStr()
    for (const d of ready) {
      const id = Ops.nextId(getData().items, d.type!, taken)
      taken.push(id)
      await putPhoto(id, d.photo!.full, d.photo!.thumb)
      await Promise.all(d.labels.map((l, n) => putBlob(labelKey(id, n), l.blob)))
      const color = d.colorFamily && d.colorFamily !== 'OTHER' ? COLOR_BY[d.colorFamily].label + ' ' : ''
      added.push({
        id, name: d.name.trim() || (color + typeLabel(d.type!).toLowerCase()).replace(/^./, (c) => c.toUpperCase()),
        type: d.type!, contexts: d.contexts, weight: d.weight, formality: d.formality, colorFamily: d.colorFamily, exactColor: d.exactColor,
        pattern: d.pattern, fabrics: d.fabrics, blend: d.blend, brand: d.brand, size: d.size, care: d.care, labels: d.labels.length || undefined, fit: d.fit, season: d.season,
        hero: d.hero, paletteFail: d.paletteFail, failReason: d.paletteFail ? d.failReason : undefined,
        condition: 'GOOD', status: 'ACTIVE', hasPhoto: true, added: day, eligibleDaysUnworn: 0,
      })
    }
    update((dt) => Ops.ensurePick({ ...dt, items: [...dt.items, ...added] }, day, getContext().cond))
    ready.forEach((d) => removeDraft(d.key))
    const msg = `Saved ${added.length === 1 ? added[0].name : `${added.length} items`} to your closet`
    if (!getDrafts().length) {
      const depth = stack.length
      setStack([])
      history.go(-depth)
      setTab('closet')
    }
    setToast({ text: msg })
  }

  const replacePhoto = async (id: string, blob: Blob) => {
    const p = await processPhoto(blob)
    await putPhoto(id, p.full, p.thumb)
    update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, hasPhoto: true } : i)) }))
  }

  /** Re-tag a saved item from its photo, or from a care label photo. Fills empty fields only. */
  /** Saves a label photo with the item, then re-reads all its labels if Gemini is connected. */
  const addItemLabel = async (id: string, file: File, onStatus?: (s: string) => void): Promise<string> => {
    const item = getData().items.find((i) => i.id === id)
    if (!item) return ''
    const n = item.labels ?? 0
    try { await putBlob(labelKey(id, n), await processLabel(file)) } catch { return "Couldn't read that photo." }
    update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, labels: n + 1 } : i)) }))
    return getSettings().geminiKey ? retag(id, onStatus) : 'Label saved.'
  }

  const retag = async (id: string, onStatus?: (s: string) => void): Promise<string> => {
    const s = getSettings()
    if (!s.geminiKey || !s.geminiModel) { goSetup(); return '' }
    const item = getData().items.find((i) => i.id === id)
    const photo = await getPhotoBlob(id, false)
    if (!photo || !item) return 'Add a photo first.'
    try {
      const labels = await labelBlobs(item)
      const t = await tagQueued(s.geminiKey, s.geminiModel, photo, labels, profileOf(getData()), { onStatus })
      update((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? mergeTagging(i, t, labels.length > 0) : i)) }))
      return labels.length ? 'Read from the labels: fibers, size, brand and care.' : 'Filled in the empty fields.'
    } catch (e) {
      return `Couldn't tag: ${(e as Error).message}`
    }
  }

  // ---- Backups ----

  const shareBackup = async (file: File) => {
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Wardrobe backup' }) } catch (e) { if ((e as Error).name === 'AbortError') return; throw e }
    } else {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(file); a.download = file.name; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    }
    markBackedUp()
    setToast({ text: 'Closet backed up' })
  }
  const backupFile = async () => new File([await backupJson()], `wardrobe-backup-${todayStr()}.json`, { type: 'application/json' })
  const exportBackup = async () => shareBackup(await backupFile())


  // Without Google: every 4 weeks, offer a one-tap backup right after OK. The file is
  // prepared ahead so "Back up" opens the share sheet instantly.
  const backupDue = data.items.length > 0 && !!Ops.loggedToday(data, today) &&
    (!data.prefs.lastBackup || daysBetween(data.prefs.lastBackup, today) >= 28) &&
    (!data.prefs.backupSnoozeUntil || data.prefs.backupSnoozeUntil <= today)
  const [prepared, setPrepared] = useState<File | null>(null)
  useEffect(() => {
    if (!backupDue || settings.google) return
    let live = true
    backupFile().then((f) => { if (live) setPrepared(f) })
    return () => { live = false }
  }, [backupDue, !!settings.google])

  const importBackup = async (f: File): Promise<string> => {
    try {
      const j = JSON.parse(await f.text())
      if (j.app !== 'wardrobe-coo' || !j.data?.items) return "That file isn't a Wardrobe backup."
      for (const [id, p] of Object.entries<{ full?: string; thumb?: string; labels?: string[] }>(j.photos ?? {})) {
        if (p.full && p.thumb) await putPhoto(id, await (await fetch(p.full)).blob(), await (await fetch(p.thumb)).blob())
        for (const [n, url] of (p.labels ?? []).entries()) await putBlob(labelKey(id, n), await (await fetch(url)).blob())
      }
      replaceAll({ ...emptyData(), ...j.data } as AppData)
      if (j.google && !getSettings().google) setSettings({ google: j.google })
      setToday(refreshDay())
      refreshContext(true)
      return `Restored ${j.data.items.length} items.`
    } catch {
      return "Couldn't read that file."
    }
  }

  // ---- Sub screens ----
  const askSheet = askOpen ? (
    <AskSheet msgs={msgs} busy={askBusy} items={new Map(data.items.map((i) => [i.id, i]))} prefill={prefill} canAsk={!!settings.geminiKey}
      onSend={sendAsk} onClose={pop} onSetup={goSetup} onOpenItem={(id) => push({ kind: 'detail', id })} />
  ) : null

  if (screen?.kind === 'camera') {
    const top = screen
    const single = !!top.replaceId
    return <Camera single={single} items={Math.max(0, pending.count - camBase.count)} labels={Math.max(0, pending.labels - camBase.labels)}
      onShot={(b, kind) => (single ? replacePhoto(top.replaceId!, b) : kind === 'label' ? addLabel(b) : addPhoto(b, true))}
      onPicked={(files, kind) => (single ? replacePhoto(top.replaceId!, files[0]) : files.forEach((f) => (kind === 'label' ? addLabel(f) : addPhoto(f, true))))}
      onDone={() => {
        if (single) { pop(); return }
        releaseDeferred()
        if (stack[stack.length - 2]?.kind === 'review') pop()
        else replaceTop({ kind: 'review' })
      }}
      onClose={() => { releaseDeferred(); pop() }} />
  }
  if (screen?.kind === 'check') {
    return <>
      <ClosetCheck data={data} state={check} onBack={pop} onKeep={keepItem} onDonate={donateFromCheck} onReplace={replaceFromCheck}
        onBestBuy={(t) => openAsk(t)} onFitCheck={() => push({ kind: 'fit' })} onTakePhoto={(id) => push({ kind: 'camera', replaceId: id })} onDone={finishCheck} />
      {askSheet}
    </>
  }
  if (screen?.kind === 'fit') {
    const p = profileOf(data)
    const last = p.fitHistory[p.fitHistory.length - 1]
    return <FitCheck prev={last ?? (p.weightLb || p.waist ? { date: '', weightLb: p.weightLb, waistIn: p.waist } : undefined)} onBack={pop} onCheck={runFit} onFinish={finishFit} />
  }
  if (screen?.kind === 'review') {
    return <>
      <Review existing={data.items} onAddMore={startAdd} onSave={saveDrafts} onBack={pop} onSetup={goSetup} />
      {toast && <Toast text={toast.text} action={toast.action} onAction={() => { toast.run?.(); setToast(null) }} />}
    </>
  }
  if (screen?.kind === 'detail') {
    const top = screen
    const item = data.items.find((i) => i.id === top.id)
    if (!item) { setTimeout(pop, 0); return null }
    return (
      <div class="shell">
        <ItemDetail item={item} onBack={pop} canTag={!!settings.geminiKey}
          onChange={(i) => update((d) => Ops.ensurePick({ ...d, items: d.items.map((x) => (x.id === i.id ? i : x)) }, today, cond))}
          onDonate={() => {
            if (item.status === 'DONATED') { update((d) => Ops.restore(d, item.id)); return }
            update((d) => Ops.ensurePick(Ops.donate(d, item.id, today), today, cond))
            pop()
            setToast({ text: `Donated ${item.name}`, action: 'Undo', run: () => update((d) => Ops.ensurePick(Ops.restore(d, item.id), today, cond)) })
          }}
          onTakePhoto={() => push({ kind: 'camera', replaceId: item.id })}
          onPickedPhoto={(f) => replacePhoto(item.id, f)}
          onRetag={(cb) => retag(item.id, cb)} onAddLabel={(f, cb) => addItemLabel(item.id, f, cb)}
          labelUrl={(n) => getBlob(labelKey(item.id, n)).then((b) => (b ? URL.createObjectURL(b) : undefined))}
          onFindReplacement={() => openAsk(`Find one specific replacement for [[${item.id}]] ${item.name}, with a link.`)} />
      </div>
    )
  }

  // ---- Tabs ----
  const showSetup = !settings.setupHidden && (!settings.geminiKey || !settings.google)
  return (
    <div class="shell">
      {tab === 'today' && <Today data={data} today={today} ctx={ctx} loadFailed={loadFailed}
        showSetup={showSetup} onSetup={goSetup} onHideSetup={() => setSettings({ setupHidden: true })}
        onOk={() => update((d) => Ops.ok(d, today))}
        onUndo={() => update((d) => Ops.undo(d, today))}
        onSwap={() => update((d) => Ops.swapOutfit(d, today))}
        onSwapTile={(s) => update((d) => Ops.swapTile(d, today, s, cond))}
        onOccasion={(o) => update((d) => Ops.ensurePick(Ops.setOccasion(d, today, o), today, cond))}
        onAdd={startAdd} toReview={toReview}
        tonight={data.prefs.tonight?.date === today ? data.prefs.tonight.text : undefined}
        check={check.showBanner ? { text: `${check.big ? 'Closet review' : 'Closet check'} · ${check.flags.length} item${check.flags.length === 1 ? '' : 's'}`, onOpen: () => push({ kind: 'check' }), onHide: () => update((d) => ({ ...d, prefs: { ...d.prefs, checkSnoozeUntil: addDays(today, 5) } })) } : undefined}
        backup={backupDue && !settings.google ? {
          lastBackup: data.prefs.lastBackup,
          onYes: () => { (prepared ? shareBackup(prepared) : exportBackup()).catch(() => setToast({ text: "Backup didn't finish. Try again from Profile." })) },
          onLater: () => update((d) => ({ ...d, prefs: { ...d.prefs, backupSnoozeUntil: addDays(today, 3) } })),
        } : undefined} />}
      {tab === 'closet' && <Closet data={data} today={today} query={query} setQuery={setQuery}
        onOpen={(id) => push({ kind: 'detail', id })} onAdd={startAdd} toReview={toReview}
        onFilters={(f) => update((d) => ({ ...d, prefs: { ...d.prefs, closetFilters: f } }))}
        onSort={(s) => update((d) => ({ ...d, prefs: { ...d.prefs, closetSort: s } }))} />}
      {tab === 'profile' && <Profile data={data} version={VERSION} onCheckUpdate={checkForUpdate} onExport={exportBackup} onImport={importBackup} today={today}
        onBackupNow={backupToDrive} onConnected={() => { refreshContext(true).then(autoBackup) }}
        onProfile={(p) => {
          const moved = p.location.lat !== profileOf(getData()).location.lat
          update((d) => ({ ...d, profile: { ...p, updated: todayStr() } }))
          if (moved) refreshContext(true)
        }}
        onRunCheck={() => push({ kind: 'check', force: true })} onFitCheck={() => push({ kind: 'fit' })} />}
      {tab !== 'profile' && <button class="fab press" aria-label="Ask" onClick={() => openAsk()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
      </button>}
      {askSheet}
      {toast && <Toast text={toast.text} action={toast.action} onAction={() => { toast.run?.(); setToast(null) }} />}
      <nav class="tabbar">
        {(['today', 'closet', 'profile'] as Tab[]).map((t) => (
          <button key={t} class={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {Icons[t]}<span>{t === 'today' ? 'Today' : t === 'closet' ? 'Closet' : 'Profile'}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
