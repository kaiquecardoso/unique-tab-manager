export function tabUrlsMatch(savedUrl: string, openUrl: string): boolean {
  try {
    return new URL(savedUrl).href === new URL(openUrl).href
  } catch {
    return savedUrl === openUrl
  }
}

export async function findOpenBrowserTab(
  url: string,
): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({})
  const matches = tabs.filter(
    (tab) => typeof tab.url === 'string' && tabUrlsMatch(url, tab.url),
  )
  if (matches.length === 0) return undefined
  return matches.find((tab) => tab.active) ?? matches[0]
}

export async function focusBrowserTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id == null) return
  if (typeof tab.windowId === 'number') {
    await chrome.windows.update(tab.windowId, { focused: true })
  }
  await chrome.tabs.update(tab.id, { active: true })
}
