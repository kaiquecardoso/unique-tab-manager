import { t } from '../i18n/core'
import { loadStoredLocale } from '../i18n/getLocale'
import type { SupportedLocale } from '../i18n/types'
import { isHostnameExcluded, hostnameFromUrl } from './excludedSites'
import { isSocialVideoTabUrl } from './socialVideoHosts'

export const CONTEXT_MENU = {
  OPEN_LIST: 'open-onetab',
  SAVE_WINDOW: 'save-window',
  SAVE_TAB_GROUP: 'save-tab-group',
  SAVE_SELECTED: 'save-selected',
  SAVE_SOCIAL_VIDEO: 'save-social-video',
  SEP_1: 'sep-1',
  SAVE_THIS: 'save-this-tab',
  SAVE_EXCEPT_THIS: 'save-except-this',
  SAVE_LEFT: 'save-left',
  SAVE_RIGHT: 'save-right',
  SAVE_ALL_WINDOWS: 'save-all-windows',
  SEP_2: 'sep-2',
  TOGGLE_EXCLUDE: 'toggle-exclude-site',
  SAVE_LINK: 'save-link-onetab',
} as const

function contextMenuCallback<T>(run: (done: () => void) => T): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      run(() => {
        const message = chrome.runtime.lastError?.message
        if (message) reject(new Error(message))
        else resolve(undefined as T)
      })
    } catch (error) {
      reject(error)
    }
  })
}

function createContextMenu(
  options: chrome.contextMenus.CreateProperties,
): Promise<void> {
  return contextMenuCallback((done) => {
    chrome.contextMenus.create(options, done)
  })
}

function updateContextMenu(
  id: string,
  options: { enabled?: boolean; title?: string },
): Promise<void> {
  return contextMenuCallback((done) => {
    chrome.contextMenus.update(id, options, done)
  })
}

let installPromise: Promise<void> | null = null
let cachedLocale: SupportedLocale | null = null

async function getMenuLocale(): Promise<SupportedLocale> {
  if (!cachedLocale) {
    cachedLocale = await loadStoredLocale()
  }
  return cachedLocale
}

export function invalidateContextMenuLocale(): void {
  cachedLocale = null
}

async function buildContextMenus(locale: SupportedLocale): Promise<void> {
  await contextMenuCallback((done) => chrome.contextMenus.removeAll(done))

  await Promise.all([
    createContextMenu({
      id: CONTEXT_MENU.OPEN_LIST,
      title: t(locale, 'context.openList'),
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.SEP_1,
      type: 'separator',
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.SAVE_WINDOW,
      title: t(locale, 'context.saveWindow'),
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.SAVE_TAB_GROUP,
      title: t(locale, 'context.saveTabGroup'),
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.SAVE_SELECTED,
      title: t(locale, 'context.saveSelected'),
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.SAVE_SOCIAL_VIDEO,
      title: t(locale, 'context.saveSocialVideo'),
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.SEP_2,
      type: 'separator',
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.SAVE_THIS,
      title: t(locale, 'context.saveThis'),
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.SAVE_EXCEPT_THIS,
      title: t(locale, 'context.saveExceptThis'),
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.SAVE_LEFT,
      title: t(locale, 'context.saveLeft'),
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.SAVE_RIGHT,
      title: t(locale, 'context.saveRight'),
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.SAVE_ALL_WINDOWS,
      title: t(locale, 'context.saveAllWindows'),
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: 'sep-3',
      type: 'separator',
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.TOGGLE_EXCLUDE,
      title: t(locale, 'context.excludeSite'),
      contexts: ['action', 'page'],
    }),
    createContextMenu({
      id: CONTEXT_MENU.SAVE_LINK,
      title: t(locale, 'context.saveLink'),
      contexts: ['link'],
    }),
  ])
}

export function installContextMenus(): Promise<void> {
  if (!installPromise) {
    installPromise = (async () => {
      const locale = await getMenuLocale()
      await buildContextMenus(locale)
    })().finally(() => {
      installPromise = null
    })
  }
  return installPromise
}

export async function updateContextMenuAvailability(
  tab?: chrome.tabs.Tab,
): Promise<void> {
  const locale = await getMenuLocale()
  await installContextMenus()

  const windowId = tab?.windowId
  const tabId = tab?.id
  const hasTab = typeof windowId === 'number' && typeof tabId === 'number'

  let windowTabs: chrome.tabs.Tab[] = []
  let highlightedCount = 0
  let hasTabGroup = false
  let hasLeft = false
  let hasRight = false
  let hasSocialVideoTabs = false

  if (hasTab && tab) {
    windowTabs = await chrome.tabs.query({ windowId })
    hasSocialVideoTabs = windowTabs.some(
      (t) => typeof t.url === 'string' && isSocialVideoTabUrl(t.url),
    )
    highlightedCount = windowTabs.filter((t) => t.highlighted).length
    hasTabGroup = typeof tab.groupId === 'number' && tab.groupId !== -1
    const index = tab.index ?? 0
    hasLeft = windowTabs.some((t) => (t.index ?? 0) < index)
    hasRight = windowTabs.some((t) => (t.index ?? 0) > index)
  }

  const updates: Promise<void>[] = [
    updateContextMenu(CONTEXT_MENU.SAVE_TAB_GROUP, {
      enabled: hasTab && hasTabGroup,
    }),
    updateContextMenu(CONTEXT_MENU.SAVE_SELECTED, {
      enabled: hasTab && highlightedCount >= 2,
    }),
    updateContextMenu(CONTEXT_MENU.SAVE_SOCIAL_VIDEO, {
      enabled: hasTab && hasSocialVideoTabs,
    }),
    updateContextMenu(CONTEXT_MENU.SAVE_LEFT, {
      enabled: hasTab && hasLeft,
    }),
    updateContextMenu(CONTEXT_MENU.SAVE_RIGHT, {
      enabled: hasTab && hasRight,
    }),
    updateContextMenu(CONTEXT_MENU.SAVE_THIS, {
      enabled: hasTab,
    }),
    updateContextMenu(CONTEXT_MENU.SAVE_EXCEPT_THIS, {
      enabled: hasTab && windowTabs.length > 1,
    }),
    updateContextMenu(CONTEXT_MENU.SAVE_WINDOW, {
      enabled: hasTab && windowTabs.length > 0,
    }),
    updateContextMenu(CONTEXT_MENU.SAVE_ALL_WINDOWS, {
      enabled: true,
    }),
  ]

  const host = tab?.url ? hostnameFromUrl(tab.url) : null
  if (host) {
    const excluded = await isHostnameExcluded(host)
    updates.push(
      updateContextMenu(CONTEXT_MENU.TOGGLE_EXCLUDE, {
        title: excluded
          ? t(locale, 'context.allowSite')
          : t(locale, 'context.excludeSite'),
        enabled: true,
      }),
    )
  } else {
    updates.push(
      updateContextMenu(CONTEXT_MENU.TOGGLE_EXCLUDE, {
        enabled: false,
      }),
    )
  }

  await Promise.all(updates.map((p) => p.catch(() => undefined)))
}

export function registerContextMenuRefreshListeners(): void {
  const refresh = (tabId?: number) => {
    void (async () => {
      if (typeof tabId === 'number') {
        const tab = await chrome.tabs.get(tabId).catch(() => undefined)
        await updateContextMenuAvailability(tab)
        return
      }
      const [active] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      await updateContextMenuAvailability(active)
    })()
  }

  chrome.tabs.onActivated.addListener((activeInfo) => refresh(activeInfo.tabId))
  chrome.tabs.onHighlighted.addListener((info) => {
    if (info.tabIds.length > 0) refresh(info.tabIds[info.tabIds.length - 1])
  })
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.groupId !== undefined) {
      refresh(tab.id)
    }
  })

  const contextMenusWithShown = chrome.contextMenus as typeof chrome.contextMenus & {
    onShown?: {
      addListener: (
        callback: (info: unknown, shownTab?: chrome.tabs.Tab) => void,
      ) => void
    }
  }
  if (contextMenusWithShown.onShown) {
    contextMenusWithShown.onShown.addListener((_info, shownTab) => {
      void updateContextMenuAvailability(shownTab)
    })
  }

  void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    void updateContextMenuAvailability(tab)
  })
}
