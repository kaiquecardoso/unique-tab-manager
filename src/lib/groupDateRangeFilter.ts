import type { DateRange } from 'react-day-picker'
import type { TabGroup } from '../types/tabs'

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/** Usa `savedAt` do grupo; intervalo inclusivo. Só `from`: desde essa data. Só `to`: até essa data. */
export function groupSavedInDateRange(
  g: TabGroup,
  range: DateRange | undefined,
): boolean {
  if (!range?.from && !range?.to) return true
  const saved = new Date(g.savedAt).getTime()
  if (range.from && range.to) {
    return (
      saved >= startOfLocalDay(range.from).getTime() &&
      saved <= endOfLocalDay(range.to).getTime()
    )
  }
  if (range.from) {
    return saved >= startOfLocalDay(range.from).getTime()
  }
  if (range.to) {
    return saved <= endOfLocalDay(range.to).getTime()
  }
  return true
}
