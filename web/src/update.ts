// Updates without restarting the phone. An installed web app stays in memory, so it never
// reloads on its own. Here: check for a new version whenever the app is opened (and every
// 30 min while open). When one is ready, it's applied the moment you leave the home screen
// of the app (invisible to you), or right away if you tap "Reload".
type Listener = () => void
let ready = false
let isHome = () => true
const listeners = new Set<Listener>()

export const updateReady = () => ready
export function onUpdateReady(l: Listener) { listeners.add(l); return () => { listeners.delete(l) } }
export function setHomeCheck(fn: () => boolean) { isHome = fn }
export const applyUpdate = () => location.reload()

export async function checkForUpdate(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
    return !!(reg?.installing || reg?.waiting) || ready
  } catch { return ready }
}

export function startUpdates() {
  const sw = navigator.serviceWorker
  if (!sw) return
  const hadController = !!sw.controller
  sw.addEventListener('controllerchange', () => {
    if (!hadController || ready) return // first install, not an update
    ready = true
    if (document.visibilityState === 'hidden' && isHome()) applyUpdate()
    else listeners.forEach((l) => l())
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate()
    else if (ready && isHome()) applyUpdate()
  })
  setInterval(() => { if (document.visibilityState === 'visible') checkForUpdate() }, 30 * 60000)
  checkForUpdate()
}
