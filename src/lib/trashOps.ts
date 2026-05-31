import type { SavedTab, TabGroup } from '../types/tabs'
import type { TrashedEntry } from '../types/trash'

function trashEntryId(): string {
  return `tr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createTrashedGroup(group: TabGroup): TrashedEntry {
  return {
    id: trashEntryId(),
    deletedAt: new Date().toISOString(),
    kind: 'group',
    restore: {
      groupId: group.id,
      savedAt: group.savedAt,
      customTitle: group.customTitle,
    },
    group: { ...group },
  }
}

export function createTrashedTab(group: TabGroup, tab: SavedTab): TrashedEntry {
  return {
    id: trashEntryId(),
    deletedAt: new Date().toISOString(),
    kind: 'tab',
    restore: {
      groupId: group.id,
      savedAt: group.savedAt,
      customTitle: group.customTitle,
    },
    group: {
      id: `trash-wrap-${tab.id}`,
      savedAt: group.savedAt,
      customTitle: group.customTitle,
      expanded: true,
      tabs: [tab],
    },
  }
}

export function restoreTrashedEntry(
  groups: TabGroup[],
  entry: TrashedEntry,
): TabGroup[] {
  if (entry.kind === 'group') {
    const withoutDup = groups.filter((g) => g.id !== entry.group.id)
    return [entry.group, ...withoutDup]
  }

  const tab = entry.group.tabs[0]
  if (!tab) return groups

  const idx = groups.findIndex((g) => g.id === entry.restore.groupId)
  if (idx === -1) {
    const newGroup: TabGroup = {
      id: entry.restore.groupId,
      savedAt: entry.restore.savedAt,
      customTitle: entry.restore.customTitle,
      expanded: true,
      tabs: [tab],
    }
    return [newGroup, ...groups]
  }

  const target = groups[idx]
  if (target.tabs.some((t) => t.id === tab.id)) return groups

  return groups.map((g, i) =>
    i === idx ? { ...g, tabs: [tab, ...g.tabs] } : g,
  )
}

export function restoreSingleTabFromTrashedEntry(
  groups: TabGroup[],
  entry: TrashedEntry,
  tabId: string,
): {
  groups: TabGroup[]
  updatedEntry: TrashedEntry | null
} {
  const tab = entry.group.tabs.find((t) => t.id === tabId)
  if (!tab) return { groups, updatedEntry: entry }

  const tabEntry: TrashedEntry = {
    ...entry,
    kind: 'tab',
    group: {
      ...entry.group,
      id: entry.kind === 'tab' ? entry.group.id : `trash-wrap-${tab.id}`,
      tabs: [tab],
    },
  }

  const nextGroups = restoreTrashedEntry(groups, tabEntry)
  const remainingTabs = entry.group.tabs.filter((t) => t.id !== tabId)
  if (remainingTabs.length === 0) {
    return { groups: nextGroups, updatedEntry: null }
  }

  return {
    groups: nextGroups,
    updatedEntry: {
      ...entry,
      group: { ...entry.group, tabs: remainingTabs },
    },
  }
}

export function restoreTrashedEntries(
  groups: TabGroup[],
  entries: TrashedEntry[],
): TabGroup[] {
  return entries.reduce(
    (current, entry) => restoreTrashedEntry(current, entry),
    groups,
  )
}
