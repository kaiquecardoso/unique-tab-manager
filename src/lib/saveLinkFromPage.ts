import { dismissPageToast, showPageToast } from './pageToast'

export type SaveLinkPayload = {
  url: string
  title?: string
}

export function saveLinkFromPage(payload: SaveLinkPayload): void {
  chrome.runtime.sendMessage(
    { type: 'save-link', url: payload.url, title: payload.title },
    (response?: { ok?: boolean; skipped?: boolean; title?: string }) => {
      if (chrome.runtime.lastError) {
        showPageToast(
          'Nao foi possivel salvar o link',
          true,
          payload.url,
          false,
          payload.title,
        )
        return
      }

      if (response?.skipped) {
        dismissPageToast()
        return
      }

      if (!response?.ok) {
        showPageToast(
          'Nao foi possivel salvar o link',
          true,
          payload.url,
          false,
          payload.title,
        )
        return
      }

      showPageToast(
        'Link salvo no OneTab',
        false,
        payload.url,
        false,
        response.title ?? payload.title,
      )
    },
  )
}
