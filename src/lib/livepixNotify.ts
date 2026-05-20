import { GROUPS_STORAGE_KEY } from './groupsStorage'

const LIVEPIX_CLICKED_KEY = 'oneTabLivepixClickedUrls'

const DONATION_PANEL_URL_PATTERNS = [
  'https://dashboard.livepix.gg/*',
  'https://pixgg.com/*',
]

export async function notifyLivePixRefreshUrlMarks(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: DONATION_PANEL_URL_PATTERNS })

  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null) return
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'refresh-url-marks' })
      } catch {
        // Pagina sem content script injetado.
      }
    }),
  )
}

export function registerLivePixUrlMarkListeners(): void {
  const refresh = () => void notifyLivePixRefreshUrlMarks()

  chrome.tabs.onCreated.addListener(refresh)
  chrome.tabs.onRemoved.addListener(refresh)
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'complete') refresh()
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes[GROUPS_STORAGE_KEY] || changes[LIVEPIX_CLICKED_KEY]) refresh()
  })
}
