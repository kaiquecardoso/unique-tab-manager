import { tabUrlKey } from './browserTab'
import { normalizeAllGroups } from './groupsStorage'
import type { SavedTab, TabGroup } from '../types/tabs'
import type { TrashedEntry } from '../types/trash'

export type GroupsExportPayload = {
  app?: string
  version?: number
  exportedAt?: string
  groups?: unknown
}

export type ImportPreview = {
  importedGroupCount: number
  importedTabCount: number
  currentTabCount: number
  newTabCount: number
  duplicateTabCount: number
}

export function parseGroupsFromExportPayload(parsed: unknown): TabGroup[] {
  const rawGroups = Array.isArray(parsed)
    ? parsed
    : (parsed as GroupsExportPayload | null)?.groups
  return normalizeAllGroups(rawGroups).filter((g) => g.tabs.length > 0)
}

export function buildImportPreview(
  current: TabGroup[],
  imported: TabGroup[],
): ImportPreview {
  const currentKeys = new Set<string>()
  for (const group of current) {
    for (const tab of group.tabs) {
      currentKeys.add(tabUrlKey(tab.url))
    }
  }

  let importedTabCount = 0
  let duplicateTabCount = 0
  for (const group of imported) {
    for (const tab of group.tabs) {
      importedTabCount += 1
      if (currentKeys.has(tabUrlKey(tab.url))) {
        duplicateTabCount += 1
      }
    }
  }

  return {
    importedGroupCount: imported.length,
    importedTabCount,
    currentTabCount: current.reduce((total, group) => total + group.tabs.length, 0),
    newTabCount: importedTabCount - duplicateTabCount,
    duplicateTabCount,
  }
}

export function applyImportReplace(imported: TabGroup[]): TabGroup[] {
  return imported
}

/** Mantém a lista atual e adiciona abas cujo link ainda não está salvo. */
export function applyImportAddMissing(
  current: TabGroup[],
  imported: TabGroup[],
): TabGroup[] {
  const existingUrls = new Set<string>()
  for (const group of current) {
    for (const tab of group.tabs) {
      existingUrls.add(tabUrlKey(tab.url))
    }
  }

  const groupById = new Map(
    current.map((group) => [group.id, { ...group, tabs: [...group.tabs] }]),
  )

  for (const importedGroup of imported) {
    const tabsToAdd: SavedTab[] = []
    for (const tab of importedGroup.tabs) {
      const key = tabUrlKey(tab.url)
      if (existingUrls.has(key)) continue
      existingUrls.add(key)
      tabsToAdd.push(tab)
    }
    if (tabsToAdd.length === 0) continue

    const existing = groupById.get(importedGroup.id)
    if (existing) {
      groupById.set(importedGroup.id, {
        ...existing,
        tabs: [...tabsToAdd, ...existing.tabs],
      })
    } else {
      groupById.set(importedGroup.id, {
        ...importedGroup,
        tabs: tabsToAdd,
      })
    }
  }

  return [...groupById.values()].filter((group) => group.tabs.length > 0)
}

export function collectTrashUrlKeys(trash: TrashedEntry[]): Set<string> {
  const keys = new Set<string>()
  for (const entry of trash) {
    for (const tab of entry.group.tabs) {
      keys.add(tabUrlKey(tab.url))
    }
  }
  return keys
}

export function findImportTrashOverlap(
  imported: TabGroup[],
  trash: TrashedEntry[],
): { urlKeys: Set<string>; tabCount: number } {
  const trashKeys = collectTrashUrlKeys(trash)
  const urlKeys = new Set<string>()
  for (const group of imported) {
    for (const tab of group.tabs) {
      const key = tabUrlKey(tab.url)
      if (trashKeys.has(key)) urlKeys.add(key)
    }
  }
  return { urlKeys, tabCount: urlKeys.size }
}

export function filterImportedGroupsByUrls(
  imported: TabGroup[],
  excludeUrlKeys: Set<string>,
): TabGroup[] {
  return imported
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => !excludeUrlKeys.has(tabUrlKey(tab.url))),
    }))
    .filter((group) => group.tabs.length > 0)
}

export function removeTabsFromTrashByUrlKeys(
  trash: TrashedEntry[],
  urlKeys: Set<string>,
): TrashedEntry[] {
  if (urlKeys.size === 0) return trash

  const next: TrashedEntry[] = []
  for (const entry of trash) {
    const remainingTabs = entry.group.tabs.filter(
      (tab) => !urlKeys.has(tabUrlKey(tab.url)),
    )
    if (remainingTabs.length === 0) continue
    if (remainingTabs.length === entry.group.tabs.length) {
      next.push(entry)
      continue
    }
    next.push({
      ...entry,
      group: { ...entry.group, tabs: remainingTabs },
    })
  }
  return next
}
