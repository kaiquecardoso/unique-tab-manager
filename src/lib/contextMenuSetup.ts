import { isHostnameExcluded, hostnameFromUrl } from './excludedSites'

export const CONTEXT_MENU = {
  OPEN_LIST: 'open-onetab',
  SAVE_WINDOW: 'save-window',
  SAVE_TAB_GROUP: 'save-tab-group',
  SAVE_SELECTED: 'save-selected',
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

export async function installContextMenus(): Promise<void> {
  await chrome.contextMenus.removeAll()

  chrome.contextMenus.create({
    id: CONTEXT_MENU.OPEN_LIST,
    title: 'Abrir One Tab Manager',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: CONTEXT_MENU.SEP_1,
    type: 'separator',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: CONTEXT_MENU.SAVE_WINDOW,
    title: 'Enviar todas as guias desta janela',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: CONTEXT_MENU.SAVE_TAB_GROUP,
    title: 'Enviar todas as guias deste grupo de guias',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: CONTEXT_MENU.SAVE_SELECTED,
    title: 'Enviar as guias selecionadas',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: CONTEXT_MENU.SEP_2,
    type: 'separator',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: CONTEXT_MENU.SAVE_THIS,
    title: 'Enviar somente esta guia',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: CONTEXT_MENU.SAVE_EXCEPT_THIS,
    title: 'Enviar todas as guias, exceto esta',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: CONTEXT_MENU.SAVE_LEFT,
    title: 'Enviar as guias à esquerda',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: CONTEXT_MENU.SAVE_RIGHT,
    title: 'Enviar as guias à direita',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: CONTEXT_MENU.SAVE_ALL_WINDOWS,
    title: 'Enviar todas as guias de todas as janelas',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: 'sep-3',
    type: 'separator',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: CONTEXT_MENU.TOGGLE_EXCLUDE,
    title: 'Excluir este site do One Tab Manager',
    contexts: ['action', 'page'],
  })
  chrome.contextMenus.create({
    id: CONTEXT_MENU.SAVE_LINK,
    title: 'Salvar link no One Tab Manager',
    contexts: ['link'],
  })
}

export async function updateContextMenuAvailability(
  tab?: chrome.tabs.Tab,
): Promise<void> {
  const windowId = tab?.windowId
  const tabId = tab?.id
  const hasTab = typeof windowId === 'number' && typeof tabId === 'number'

  let windowTabs: chrome.tabs.Tab[] = []
  let highlightedCount = 0
  let hasTabGroup = false
  let hasLeft = false
  let hasRight = false

  if (hasTab && tab) {
    windowTabs = await chrome.tabs.query({ windowId })
    highlightedCount = windowTabs.filter((t) => t.highlighted).length
    hasTabGroup = typeof tab.groupId === 'number' && tab.groupId !== -1
    const index = tab.index ?? 0
    hasLeft = windowTabs.some((t) => (t.index ?? 0) < index)
    hasRight = windowTabs.some((t) => (t.index ?? 0) > index)
  }

  const updates: Promise<void>[] = [
    chrome.contextMenus.update(CONTEXT_MENU.SAVE_TAB_GROUP, {
      enabled: hasTab && hasTabGroup,
    }),
    chrome.contextMenus.update(CONTEXT_MENU.SAVE_SELECTED, {
      enabled: hasTab && highlightedCount >= 2,
    }),
    chrome.contextMenus.update(CONTEXT_MENU.SAVE_LEFT, {
      enabled: hasTab && hasLeft,
    }),
    chrome.contextMenus.update(CONTEXT_MENU.SAVE_RIGHT, {
      enabled: hasTab && hasRight,
    }),
    chrome.contextMenus.update(CONTEXT_MENU.SAVE_THIS, {
      enabled: hasTab,
    }),
    chrome.contextMenus.update(CONTEXT_MENU.SAVE_EXCEPT_THIS, {
      enabled: hasTab && windowTabs.length > 1,
    }),
    chrome.contextMenus.update(CONTEXT_MENU.SAVE_WINDOW, {
      enabled: hasTab && windowTabs.length > 0,
    }),
    chrome.contextMenus.update(CONTEXT_MENU.SAVE_ALL_WINDOWS, {
      enabled: true,
    }),
  ]

  const host = tab?.url ? hostnameFromUrl(tab.url) : null
  if (host) {
    const excluded = await isHostnameExcluded(host)
    updates.push(
      chrome.contextMenus.update(CONTEXT_MENU.TOGGLE_EXCLUDE, {
        title: excluded
          ? 'Permitir este site no One Tab Manager'
          : 'Excluir este site do One Tab Manager',
        enabled: true,
      }),
    )
  } else {
    updates.push(
      chrome.contextMenus.update(CONTEXT_MENU.TOGGLE_EXCLUDE, {
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
