import type { TabGroup } from '../types/tabs'

/** Chave yyyy-MM-dd no fuso local (igual a `CalendarDay.isoDate` do DayPicker). */
export function localDayKeyFromDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

/** Soma abas por dia de salvamento do grupo (`savedAt`). */
export function buildTabsCountByLocalDay(groups: TabGroup[]): {
  map: Map<string, number>
  max: number
} {
  const map = new Map<string, number>()
  for (const g of groups) {
    const key = localDayKeyFromDate(new Date(g.savedAt))
    map.set(key, (map.get(key) ?? 0) + g.tabs.length)
  }
  let max = 0
  for (const v of map.values()) {
    if (v > max) max = v
  }
  return { map, max }
}
