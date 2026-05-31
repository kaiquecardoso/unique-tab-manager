import { formatUrlLabel } from './deduplicateTabs'
import { tabUrlKey } from './browserTab'
import { createTrashedTab } from './trashOps'
import type { SavedTab, TabGroup } from '../types/tabs'
import type { TrashedEntry } from '../types/trash'

export type ViewedTabEntry = {
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

function collectViewedTabs(groups: TabGroup[]): ViewedTabEntry[] {
  const items: ViewedTabEntry[] = []

  for (const group of groups) {
    for (const tab of group.tabs) {
      if (tab.viewed !== true) continue
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

export function countViewedTabs(groups: TabGroup[]): number {
  return collectViewedTabs(groups).length
}

export function listViewedTabs(groups: TabGroup[]): ViewedTabEntry[] {
  return collectViewedTabs(groups)
}

export function moveViewedTabsToTrash(groups: TabGroup[]): {
  groups: TabGroup[]
  trashEntries: TrashedEntry[]
  removedCount: number
} {
  const viewed = collectViewedTabs(groups)
  if (viewed.length === 0) {
    return { groups, trashEntries: [], removedCount: 0 }
  }

  const removeTabIds = new Set(viewed.map((e) => e.tab.id))
  const trashEntries: TrashedEntry[] = []

  for (const entry of viewed) {
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
    removedCount: trashEntries.length,
  }
}
