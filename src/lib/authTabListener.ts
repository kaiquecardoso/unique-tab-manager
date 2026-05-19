import { AUTH_TOKEN_STORAGE_KEY, setStoredToken } from './api'

const EXTENSION_CALLBACK_PATH = '/auth/extension-callback'

export function registerAuthTabListener(): void {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    const url = changeInfo.url
    if (!url || !url.includes(EXTENSION_CALLBACK_PATH)) return

    let token: string | null = null
    try {
      token = new URL(url).searchParams.get('token')
    } catch {
      return
    }

    if (!token) return

    void (async () => {
      await setStoredToken(token)
      try {
        await chrome.tabs.remove(tabId)
      } catch {
        /* aba já fechada */
      }
      try {
        await chrome.runtime.sendMessage({ type: 'auth-success' })
      } catch {
        /* nenhum listener (ex.: options fechada) */
      }
    })()
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[AUTH_TOKEN_STORAGE_KEY]) return
    try {
      void chrome.runtime.sendMessage({ type: 'auth-success' })
    } catch {
      /* sem listeners */
    }
  })
}
