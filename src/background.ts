import { loadGroups, saveGroups } from './lib/groupsStorage'
import { calendarDayKey } from './lib/calendarDay'
import type { SavedTab, TabGroup } from './types/tabs'

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

async function saveCurrentTabToStorage(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !tab.url || isRestrictedUrl(tab.url)) return

  const now = new Date().toISOString()
  const newTab: SavedTab = {
    id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: tab.title?.trim() || 'Sem título',
    url: tab.url,
    addedAt: now,
  }

  const groups = await loadGroups()
  const todayKey = calendarDayKey(new Date())
  const existingIndex = groups.findIndex(
    (g) => calendarDayKey(new Date(g.savedAt)) === todayKey,
  )

  let nextGroups: TabGroup[]

  if (existingIndex !== -1) {
    const target = groups[existingIndex]
    const updated: TabGroup = {
      ...target,
      expanded: true,
      tabs: [newTab, ...target.tabs],
    }
    const without = groups.filter((_, i) => i !== existingIndex)
    nextGroups = [updated, ...without]
  } else {
    const newGroup: TabGroup = {
      id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      expanded: true,
      tabs: [newTab],
    }
    nextGroups = [newGroup, ...groups]
  }

  await saveGroups(nextGroups)
  await chrome.tabs.remove(tab.id)
  await chrome.runtime.openOptionsPage()
}

async function refreshContextMenus(): Promise<void> {
  await chrome.contextMenus.removeAll()
  chrome.contextMenus.create({
    id: 'open-onetab',
    title: 'Abrir lista de abas salvas',
    contexts: ['action'],
  })
}

chrome.runtime.onInstalled.addListener(() => {
  void refreshContextMenus()
})

void refreshContextMenus()

chrome.action.onClicked.addListener(() => {
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab) await saveCurrentTabToStorage(tab)
  })()
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== 'open-onetab') return
  void chrome.runtime.openOptionsPage()
})
