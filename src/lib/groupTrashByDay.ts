import type { TrashedEntry } from '../types/trash'

/** Chave de dia local (YYYY-MM-DD) para agrupar itens da lixeira. */
export function trashDayKey(savedAtIso: string): string {
  const d = new Date(savedAtIso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export type TrashDayGroup = {
  dayKey: string
  savedAt: string
  customTitle?: string
  entries: TrashedEntry[]
}

export function groupTrashEntriesBySavedDay(
  entries: TrashedEntry[],
): TrashDayGroup[] {
  const map = new Map<string, TrashedEntry[]>()

  for (const entry of entries) {
    const key = trashDayKey(entry.restore.savedAt)
    const list = map.get(key) ?? []
    list.push(entry)
    map.set(key, list)
  }

  return [...map.entries()]
    .map(([dayKey, dayEntries]) => {
      const sorted = [...dayEntries].sort(
        (a, b) =>
          new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
      )
      const first = sorted[0]
      return {
        dayKey,
        savedAt: first.restore.savedAt,
        customTitle: first.restore.customTitle,
        entries: sorted,
      }
    })
    .sort(
      (a, b) =>
        new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    )
}

export function trashDayTabCount(day: TrashDayGroup): number {
  return day.entries.reduce((n, e) => n + e.group.tabs.length, 0)
}

export function trashDayLatestDeletedAt(day: TrashDayGroup): Date {
  const ms = day.entries.reduce(
    (max, e) => Math.max(max, new Date(e.deletedAt).getTime()),
    0,
  )
  return new Date(ms)
}

export function isTrashDayExpanded(day: TrashDayGroup): boolean {
  return day.entries.some((e) => e.group.expanded)
}
