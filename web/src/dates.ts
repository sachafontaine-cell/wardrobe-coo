// Local calendar dates as YYYY-MM-DD strings.

export const todayStr = (d: Date = new Date()): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const toUtc = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export const daysBetween = (from: string, to: string): number => Math.round((toUtc(to) - toUtc(from)) / 86400000)

export const addDays = (s: string, n: number): string => {
  const t = new Date(toUtc(s) + n * 86400000)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (s: string): number => new Date(toUtc(s)).getUTCDay()

export const prettyDate = (s: string): string =>
  new Date(toUtc(s)).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
