import { formatUrlLabel } from './deduplicateTabs'
import { tabUrlKey } from './browserTab'
import { isTabFavorite } from './groupsStorage'
import { createTrashedTab } from './trashOps'
import type { SavedTab, TabGroup } from '../types/tabs'
import type { TrashedEntry } from '../types/trash'

export type PrunableTabEntry = {
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

/** Limite exclusivo no dia seguinte — inclui abas salvas no dia escolhido e anteriores. */
export function pruneBeforeDateCutoffMs(beforeDate: Date): number {
  const nextDay = new Date(beforeDate)
  nextDay.setHours(0, 0, 0, 0)
  nextDay.setDate(nextDay.getDate() + 1)
  return nextDay.getTime()
}

function isTabBeforeDate(tab: SavedTab, exclusiveEndMs: number): boolean {
  const addedMs = tabAddedAtMs(tab)
  if (addedMs <= 0) return false
  return addedMs < exclusiveEndMs
}

function collectTabsBeforeDate(
  groups: TabGroup[],
  beforeDate: Date,
): PrunableTabEntry[] {
  const exclusiveEndMs = pruneBeforeDateCutoffMs(beforeDate)
  const items: PrunableTabEntry[] = []

  for (const group of groups) {
    for (const tab of group.tabs) {
      if (!isTabBeforeDate(tab, exclusiveEndMs)) continue
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

export function createPrunableTabEntry(
  group: TabGroup,
  tab: SavedTab,
): PrunableTabEntry {
  return {
    tab,
    groupId: group.id,
    groupSavedAt: group.savedAt,
    groupCustomTitle: group.customTitle,
    urlLabel: formatUrlLabel(tabUrlKey(tab.url)),
  }
}

export function splitTabsBeforeDate(
  groups: TabGroup[],
  beforeDate: Date | undefined,
): {
  autoMove: PrunableTabEntry[]
  favoritePrompt: PrunableTabEntry[]
} {
  if (!beforeDate) {
    return { autoMove: [], favoritePrompt: [] }
  }
  const all = collectTabsBeforeDate(groups, beforeDate)
  return {
    autoMove: all.filter((entry) => !isTabFavorite(entry.tab)),
    favoritePrompt: all.filter((entry) => isTabFavorite(entry.tab)),
  }
}

export function countTabsBeforeDate(
  groups: TabGroup[],
  beforeDate: Date | undefined,
): number {
  if (!beforeDate) return 0
  return collectTabsBeforeDate(groups, beforeDate).length
}

export function listTabsBeforeDate(
  groups: TabGroup[],
  beforeDate: Date | undefined,
): PrunableTabEntry[] {
  if (!beforeDate) return []
  return collectTabsBeforeDate(groups, beforeDate)
}

function buildTrashFromEntries(
  groups: TabGroup[],
  entries: PrunableTabEntry[],
): {
  groups: TabGroup[]
  trashEntries: TrashedEntry[]
  removedCount: number
} {
  if (entries.length === 0) {
    return { groups, trashEntries: [], removedCount: 0 }
  }

  const removeTabIds = new Set(entries.map((e) => e.tab.id))
  const trashEntries: TrashedEntry[] = []

  for (const entry of entries) {
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

export function applyPruneEntriesToTrash(
  groups: TabGroup[],
  entries: PrunableTabEntry[],
): {
  groups: TabGroup[]
  trashEntries: TrashedEntry[]
  removedCount: number
} {
  return buildTrashFromEntries(groups, entries)
}

export function applyPruneTabEntryToTrash(
  groups: TabGroup[],
  entry: PrunableTabEntry,
): {
  groups: TabGroup[]
  trashEntry: TrashedEntry | null
} {
  const group = groups.find((g) => g.id === entry.groupId)
  if (!group) {
    return { groups, trashEntry: null }
  }

  const trashEntry = createTrashedTab(group, entry.tab)
  const nextGroups = groups
    .map((g) =>
      g.id !== entry.groupId
        ? g
        : { ...g, tabs: g.tabs.filter((t) => t.id !== entry.tab.id) },
    )
    .filter((g) => g.tabs.length > 0)

  return { groups: nextGroups, trashEntry }
}

export function moveTabsBeforeDateToTrash(
  groups: TabGroup[],
  beforeDate: Date,
): {
  groups: TabGroup[]
  trashEntries: TrashedEntry[]
  removedCount: number
} {
  const { autoMove } = splitTabsBeforeDate(groups, beforeDate)
  return buildTrashFromEntries(groups, autoMove)
}
