import { formatUrlLabel } from './deduplicateTabs'
import { tabUrlKey } from './browserTab'
import { createTrashedTab } from './trashOps'
import type { SavedTab, TabGroup } from '../types/tabs'
import type { TrashedEntry } from '../types/trash'

/** Meses sem abrir na lista antes de poder limpar (abas já marcadas como vistas). */
export const DEFAULT_VIEWED_PRUNE_MONTHS = 2

export type PrunableViewedEntry = {
  tab: SavedTab
  groupId: string
  groupSavedAt: string
  groupCustomTitle?: string
  urlLabel: string
}

function tabAddedAtMs(tab: SavedTab): number {
  const t = Date.parse(tab.addedAt)
  return Number.isFinite(t) ? t : 0
}

export function viewedPruneCutoffMs(
  olderThanMonths = DEFAULT_VIEWED_PRUNE_MONTHS,
): number {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - olderThanMonths)
  cutoff.setHours(0, 0, 0, 0)
  return cutoff.getTime()
}

function isPrunableViewedTab(tab: SavedTab, cutoffMs: number): boolean {
  if (tab.viewed !== true) return false
  if (tab.favorite === true) return false
  const addedMs = tabAddedAtMs(tab)
  if (addedMs <= 0) return false
  return addedMs < cutoffMs
}

function collectPrunable(
  groups: TabGroup[],
  olderThanMonths: number,
): PrunableViewedEntry[] {
  const cutoffMs = viewedPruneCutoffMs(olderThanMonths)
  const items: PrunableViewedEntry[] = []

  for (const group of groups) {
    for (const tab of group.tabs) {
      if (!isPrunableViewedTab(tab, cutoffMs)) continue
      items.push({
        tab,
        groupId: group.id,
        groupSavedAt: group.savedAt,
        groupCustomTitle: group.customTitle,
        urlLabel: formatUrlLabel(tabUrlKey(tab.url)),
      })
    }
  }

  return items.sort((a, b) => tabAddedAtMs(b.tab) - tabAddedAtMs(a.tab))
}

export function countPrunableViewedTabs(
  groups: TabGroup[],
  olderThanMonths = DEFAULT_VIEWED_PRUNE_MONTHS,
): number {
  return collectPrunable(groups, olderThanMonths).length
}

export function listPrunableViewedTabs(
  groups: TabGroup[],
  olderThanMonths = DEFAULT_VIEWED_PRUNE_MONTHS,
): PrunableViewedEntry[] {
  return collectPrunable(groups, olderThanMonths)
}

export function pruneOldViewedTabs(
  groups: TabGroup[],
  olderThanMonths = DEFAULT_VIEWED_PRUNE_MONTHS,
): {
  groups: TabGroup[]
  trashEntries: TrashedEntry[]
  removedCount: number
} {
  const prunable = collectPrunable(groups, olderThanMonths)
  if (prunable.length === 0) {
    return { groups, trashEntries: [], removedCount: 0 }
  }

  const removeTabIds = new Set(prunable.map((e) => e.tab.id))
  const trashEntries: TrashedEntry[] = []

  for (const entry of prunable) {
    const group = groups.find((g) => g.id === entry.groupId)
    if (!group) continue
    trashEntries.push(createTrashedTab(group, entry.tab))
  }

  const nextGroups = groups
    .map((g) => ({
      ...g,
      tabs: g.tabs.filter((t) => !removeTabIds.has(t.id)),
    }))
    .filter((g) => g.tabs.length > 0)

  return {
    groups: nextGroups,
    trashEntries,
    removedCount: removeTabIds.size,
  }
}
