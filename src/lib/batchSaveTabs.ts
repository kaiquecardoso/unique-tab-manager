import { calendarDayKey } from './calendarDay'
import { resolveDuplicateBeforeSave } from './duplicateResolution'
import { isUrlExcluded } from './excludedSites'
import { saveGroupsLocally } from './groupsSync'
import { loadGroups } from './groupsStorage'
import { findSavedTabByUrl } from './savedTabLookup'
import type { SavedTab, TabGroup } from '../types/tabs'

function isRestrictedUrl(url: string): boolean {
  const u = url.toLowerCase()
  return (
    u.startsWith('chrome://') ||
    u.startsWith('chrome-extension://') ||
    u.startsWith('edge://') ||
    u.startsWith('about:') ||
    u.startsWith('devtools://') ||
    u.startsWith('view-source:')
  )
}

function normalizeTitle(title: string | undefined): string {
  return title?.trim() || ''
}

function addTabToTodayGroup(groups: TabGroup[], newTab: SavedTab): TabGroup[] {
  const todayKey = calendarDayKey(new Date())
  const existingIndex = groups.findIndex(
    (g) => calendarDayKey(new Date(g.savedAt)) === todayKey,
  )

  if (existingIndex !== -1) {
    const target = groups[existingIndex]
    const updated: TabGroup = {
      ...target,
      expanded: true,
      tabs: [newTab, ...target.tabs],
    }
    const without = groups.filter((_, i) => i !== existingIndex)
    return [updated, ...without]
  }

  const newGroup: TabGroup = {
    id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    expanded: true,
    tabs: [newTab],
  }
  return [newGroup, ...groups]
}

function browserTabToSavedTab(tab: chrome.tabs.Tab): SavedTab | null {
  if (!tab.url || isRestrictedUrl(tab.url)) return null

  return {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: normalizeTitle(tab.title) || tab.url,
    url: tab.url,
    addedAt: new Date().toISOString(),
    tags: [],
  }
}

export type SaveBrowserTabsOptions = {
  closeAfterSave?: boolean
  openListAfterSave?: boolean
  /** Pergunta aba a aba em duplicatas (padrão: true). */
  promptDuplicates?: boolean
}

export type SaveBrowserTabsResult = {
  savedCount: number
  skippedDuplicate: number
  replacedDuplicate: number
  skippedExcluded: number
  skippedRestricted: number
  promptFallback: number
}

export async function saveBrowserTabsToStorage(
  browserTabs: chrome.tabs.Tab[],
  options: SaveBrowserTabsOptions = {},
): Promise<SaveBrowserTabsResult> {
  const {
    closeAfterSave = true,
    openListAfterSave = true,
    promptDuplicates = true,
  } = options
  const sorted = [...browserTabs].sort((a, b) => {
    if (a.windowId !== b.windowId) return (a.windowId ?? 0) - (b.windowId ?? 0)
    return (a.index ?? 0) - (b.index ?? 0)
  })

  let groups = await loadGroups()
  const savedTabIds: number[] = []
  let savedCount = 0
  let skippedDuplicate = 0
  let replacedDuplicate = 0
  let skippedExcluded = 0
  let skippedRestricted = 0
  let promptFallback = 0

  const duplicateTabs = sorted.filter((tab) => {
    if (!tab.url || isRestrictedUrl(tab.url)) return false
    return Boolean(findSavedTabByUrl(groups, tab.url))
  })
  let duplicatePromptIndex = 0
  const duplicatePromptTotal = promptDuplicates ? duplicateTabs.length : 0

  for (let i = 0; i < sorted.length; i += 1) {
    const tab = sorted[i]!
    if (!tab.url || isRestrictedUrl(tab.url)) {
      skippedRestricted += 1
      continue
    }
    if (await isUrlExcluded(tab.url)) {
      skippedExcluded += 1
      continue
    }

    const existing = findSavedTabByUrl(groups, tab.url)
    if (existing) {
      if (!promptDuplicates || typeof tab.id !== 'number') {
        skippedDuplicate += 1
        if (promptDuplicates && typeof tab.id !== 'number') {
          promptFallback += 1
        }
        continue
      }

      duplicatePromptIndex += 1
      const resolved = await resolveDuplicateBeforeSave(
        tab.url,
        tab.id,
        normalizeTitle(tab.title) || tab.url,
        {
          batchMode: duplicatePromptTotal > 1,
          groups,
          progress:
            duplicatePromptTotal > 1
              ? {
                  current: duplicatePromptIndex,
                  total: duplicatePromptTotal,
                }
              : undefined,
        },
      )
      groups = resolved.groups

      if (!resolved.proceed) {
        skippedDuplicate += 1
        continue
      }

      replacedDuplicate += 1
    }

    const saved = browserTabToSavedTab(tab)
    if (!saved) {
      skippedRestricted += 1
      continue
    }

    groups = addTabToTodayGroup(groups, saved)
    savedCount += 1
    if (typeof tab.id === 'number' && closeAfterSave) {
      savedTabIds.push(tab.id)
    }
  }

  if (savedCount > 0) {
    await saveGroupsLocally(groups)
  }

  if (savedTabIds.length > 0) {
    try {
      await chrome.tabs.remove(savedTabIds)
    } catch {
      /* algumas abas podem já ter sido fechadas */
    }
  }

  if (savedCount > 0 && openListAfterSave) {
    await chrome.runtime.openOptionsPage()
  }

  return {
    savedCount,
    skippedDuplicate,
    replacedDuplicate,
    skippedExcluded,
    skippedRestricted,
    promptFallback,
  }
}
