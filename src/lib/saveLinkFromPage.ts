import { t } from '../i18n/core'
import { loadStoredLocale } from '../i18n/getLocale'
import { dismissPageToast, showPageToast } from './pageToast'

export type SaveLinkPayload = {
  url: string
  title?: string
}

export function saveLinkFromPage(payload: SaveLinkPayload): void {
  void loadStoredLocale().then((locale) => {
    chrome.runtime.sendMessage(
      { type: 'save-link', url: payload.url, title: payload.title },
      (response?: { ok?: boolean; skipped?: boolean; title?: string }) => {
        if (chrome.runtime.lastError) {
          showPageToast(
            t(locale, 'toast.linkSaveFailed'),
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
            t(locale, 'toast.linkSaveFailed'),
            true,
            payload.url,
            false,
            payload.title,
          )
          return
        }

        showPageToast(
          t(locale, 'toast.linkSaved'),
          false,
          payload.url,
          false,
          response.title ?? payload.title,
        )
      },
    )
  })
}
