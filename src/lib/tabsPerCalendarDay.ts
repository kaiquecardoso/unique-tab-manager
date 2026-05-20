import type { TabGroup } from '../types/tabs'

/** Chave yyyy-MM-dd no fuso local (igual a `CalendarDay.isoDate` do DayPicker). */
export function localDayKeyFromDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

export type DayViewedStats = {
  total: number
  viewed: number
}

/** Abas vistas vs total por dia de salvamento do grupo (`savedAt`). */
export function buildDayViewedStatsByLocalDay(
  groups: TabGroup[],
): Map<string, DayViewedStats> {
  const map = new Map<string, DayViewedStats>()
  for (const g of groups) {
    const key = localDayKeyFromDate(new Date(g.savedAt))
    const entry = map.get(key) ?? { total: 0, viewed: 0 }
    for (const tab of g.tabs) {
      entry.total += 1
      if (tab.viewed) entry.viewed += 1
    }
    map.set(key, entry)
  }
  return map
}

export function viewedPercent(stats: DayViewedStats): number {
  if (stats.total <= 0) return 0
  return (stats.viewed / stats.total) * 100
}

export type CalendarDotTier = 'red' | 'yellow' | 'green'

/** Menos de 50% vermelho; de 50% até antes de 100% amarelo; 100% verde. */
export function dotTierFromViewedPercent(percent: number): CalendarDotTier {
  if (percent >= 100) return 'green'
  if (percent >= 50) return 'yellow'
  return 'red'
}
