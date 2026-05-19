import { getOAuthStartUrl } from './api'

const POPUP_WIDTH = 480
const POPUP_HEIGHT = 640

let activeOAuthWindowId: number | null = null

export function registerOAuthPopupTracking(): void {
  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === activeOAuthWindowId) {
      activeOAuthWindowId = null
    }
  })
}

export async function openOAuthPopup(): Promise<void> {
  if (activeOAuthWindowId !== null) {
    try {
      await chrome.windows.get(activeOAuthWindowId)
      await chrome.windows.update(activeOAuthWindowId, { focused: true })
      return
    } catch {
      activeOAuthWindowId = null
    }
  }

  const win = await chrome.windows.create({
    url: getOAuthStartUrl(),
    type: 'popup',
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    focused: true,
  })

  if (win?.id !== undefined) {
    activeOAuthWindowId = win.id
  }
}
