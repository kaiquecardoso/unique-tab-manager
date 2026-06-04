import { saveBrowserTabsToStorage } from './batchSaveTabs'
import { CONTEXT_MENU } from './contextMenuSetup'
import { toggleExcludedHostname } from './excludedSites'
import { isSocialVideoTabUrl } from './socialVideoHosts'

function isSavableTab(tab: chrome.tabs.Tab): boolean {
  return typeof tab.id === 'number' && typeof tab.url === 'string' && tab.url.length > 0
}

async function tabsInWindow(windowId: number): Promise<chrome.tabs.Tab[]> {
  return chrome.tabs.query({ windowId })
}

export async function handleContextMenuClick(
  menuItemId: string,
  tab?: chrome.tabs.Tab,
): Promise<void> {
  if (menuItemId === CONTEXT_MENU.OPEN_LIST) {
    await chrome.runtime.openOptionsPage()
    return
  }

  if (menuItemId === CONTEXT_MENU.TOGGLE_EXCLUDE) {
    if (!tab?.url) return
    await toggleExcludedHostname(tab.url)
    return
  }

  if (!tab?.windowId || tab.id == null) return

  let targets: chrome.tabs.Tab[] = []

  switch (menuItemId) {
    case CONTEXT_MENU.SAVE_THIS:
      targets = [tab]
      break
    case CONTEXT_MENU.SAVE_WINDOW:
      targets = await tabsInWindow(tab.windowId)
      break
    case CONTEXT_MENU.SAVE_TAB_GROUP:
      if (typeof tab.groupId === 'number' && tab.groupId !== -1) {
        targets = await chrome.tabs.query({ groupId: tab.groupId })
      }
      break
    case CONTEXT_MENU.SAVE_SELECTED: {
      const windowTabs = await tabsInWindow(tab.windowId)
      targets = windowTabs.filter((t) => t.highlighted)
      break
    }
    case CONTEXT_MENU.SAVE_SOCIAL_VIDEO: {
      const windowTabs = await tabsInWindow(tab.windowId)
      targets = windowTabs.filter(
        (t) => typeof t.url === 'string' && isSocialVideoTabUrl(t.url),
      )
      break
    }
    case CONTEXT_MENU.SAVE_EXCEPT_THIS: {
      const windowTabs = await tabsInWindow(tab.windowId)
      targets = windowTabs.filter((t) => t.id !== tab.id)
      break
    }
    case CONTEXT_MENU.SAVE_LEFT: {
      const windowTabs = await tabsInWindow(tab.windowId)
      const index = tab.index ?? 0
      targets = windowTabs.filter((t) => (t.index ?? 0) < index)
      break
    }
    case CONTEXT_MENU.SAVE_RIGHT: {
      const windowTabs = await tabsInWindow(tab.windowId)
      const index = tab.index ?? 0
      targets = windowTabs.filter((t) => (t.index ?? 0) > index)
      break
    }
    case CONTEXT_MENU.SAVE_ALL_WINDOWS:
      targets = await chrome.tabs.query({})
      break
    default:
      return
  }

  const savable = targets.filter(isSavableTab)
  if (savable.length === 0) return

  await saveBrowserTabsToStorage(savable, {
    closeAfterSave: true,
    openListAfterSave: menuItemId === CONTEXT_MENU.SAVE_THIS,
  })
}
