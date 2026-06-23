import {
  extractUrlsFromText,
  linkifyTextElement,
  primaryUrlFromMessageElement,
} from './lib/urlInText'
import {
  KNOWN_LINK_ATTR,
  UNIQUE_TAB_LINK_ATTR,
  refreshKnownLinkMarks,
  setLinkKnownState,
} from './lib/markKnownLinks'
import {
  ensureLivepixClickedLinksLoaded,
  markLivepixLinkClicked,
} from './lib/livepixClickedLinks'
import { t } from './i18n/core'
import { loadStoredLocale } from './i18n/getLocale'
import type { SupportedLocale } from './i18n/types'
import { showRedirectPrompt } from './lib/redirectPrompt'
import { showPageToast } from './lib/pageToast'
import { saveLinkFromPage } from './lib/saveLinkFromPage'
import saveButtonLogoUrl from './assets/logo.png'

/** Integracao com paineis de doacao: LivePix e PixGG (adaptadores abaixo). */

const PROCESSED_ATTR = 'data-unique-tab-donation-save'
const SAVE_BTN_ATTR = 'data-unique-tab-save'
const SAVE_WRAP_ATTR = 'data-unique-tab-save-wrap'
const STYLES_ID = 'unique-tab-donation-panel-styles'

let cachedLocale: SupportedLocale | null = null

async function getLivepixLocale(): Promise<SupportedLocale> {
  if (!cachedLocale) {
    cachedLocale = await loadStoredLocale()
  }
  return cachedLocale
}

function livepixLabels(locale: SupportedLocale) {
  return {
    save: t(locale, 'livepix.saveToUniqueTab'),
    saveLink: t(locale, 'livepix.saveLink'),
    noLink: t(locale, 'livepix.noLink'),
  }
}

type DonationPanelAdapter = {
  id: string
  matchesLocation: () => boolean
  itemSelector: string
  getMessageParagraph: (item: HTMLElement) => HTMLElement | null
  getActionBar: (item: HTMLElement) => HTMLElement | null
  getReferenceControl: (actionBar: HTMLElement) => HTMLElement | null
  mountSaveControl: (
    actionBar: HTMLElement,
    button: HTMLButtonElement,
    reference: HTMLElement | null,
  ) => void
  buttonClassName?: string
}

const DONATION_PANEL_ADAPTERS: DonationPanelAdapter[] = [
  {
    id: 'livepix',
    matchesLocation: () => window.location.hostname === 'dashboard.livepix.gg',
    itemSelector: '.transaction-item',
    getMessageParagraph: (item) => {
      const columns = item.querySelectorAll(':scope > div')
      return columns[1]?.querySelector('p') ?? null
    },
    getActionBar: (item) => {
      const playButton = item.querySelector('button[aria-label="play"]')
      return playButton?.parentElement ?? null
    },
    getReferenceControl: (actionBar) =>
      actionBar.querySelector('button[aria-label="play"]'),
    mountSaveControl: (actionBar, button, reference) => {
      actionBar.insertBefore(button, actionBar.firstChild)
      syncSaveButtonSize(button, reference)
    },
    buttonClassName:
      'MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeLarge css-1di07jz',
  },
  {
    id: 'pixgg',
    matchesLocation: () => {
      const host = window.location.hostname
      return (
        (host === 'pixgg.com' ||
          host === 'www.pixgg.com' ||
          host.endsWith('.pixgg.com')) &&
        window.location.pathname.toLowerCase().includes('painel-de-donates')
      )
    },
    itemSelector: '.messagesContent',
    getMessageParagraph: (item) =>
      item.querySelector('.body-messages p') ??
      item.querySelector('.body-messages'),
    getActionBar: (item) => item.querySelector('.controlerWrapper'),
    getReferenceControl: (actionBar) =>
      actionBar.querySelector('.controlerButton'),
    mountSaveControl: (actionBar, button, reference) => {
      const wrap = document.createElement('div')
      wrap.className = 'controlerButton'
      wrap.setAttribute(SAVE_WRAP_ATTR, 'true')
      wrap.appendChild(button)
      actionBar.insertBefore(wrap, actionBar.firstChild)
      syncSaveButtonSize(button, reference)
    },
  },
]

function resolveSaveButtonLogoUrl(): string {
  if (saveButtonLogoUrl.startsWith('chrome-extension://')) return saveButtonLogoUrl
  return chrome.runtime.getURL(saveButtonLogoUrl.replace(/^\//, ''))
}

function getActiveAdapter(): DonationPanelAdapter | undefined {
  return DONATION_PANEL_ADAPTERS.find((adapter) => adapter.matchesLocation())
}

function ensureDonationPanelStyles(): void {
  if (document.getElementById(STYLES_ID)) return

  const style = document.createElement('style')
  style.id = STYLES_ID
  style.textContent = `
    button[${SAVE_BTN_ATTR}] {
      flex: 0 0 auto;
      align-self: center;
      width: 48px;
      height: 48px;
      min-width: 48px;
      min-height: 48px;
      max-width: 48px;
      max-height: 48px;
      padding: 0;
      box-sizing: border-box;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      cursor: pointer;
    }

    button[${SAVE_BTN_ATTR}]::before {
      border-radius: 50% !important;
    }

    button[${SAVE_BTN_ATTR}] img {
      display: block;
      width: 22px;
      height: 22px;
      flex-shrink: 0;
    }

    button[${SAVE_BTN_ATTR}]:disabled {
      cursor: not-allowed;
    }

    [${SAVE_WRAP_ATTR}] button[${SAVE_BTN_ATTR}] {
      width: 40px;
      height: 40px;
      min-width: 40px;
      min-height: 40px;
      max-width: 40px;
      max-height: 40px;
    }

    a[${UNIQUE_TAB_LINK_ATTR}][${KNOWN_LINK_ATTR}] {
      text-decoration: line-through underline !important;
      opacity: 0.72;
    }
  `
  document.head.appendChild(style)
}

function syncSaveButtonSize(
  saveButton: HTMLButtonElement,
  reference: HTMLElement | null,
): void {
  if (!reference) return

  const { width, height } = reference.getBoundingClientRect()
  const size = Math.round(Math.max(width, height))
  if (size <= 0) return

  saveButton.style.width = `${size}px`
  saveButton.style.height = `${size}px`
  saveButton.style.minWidth = `${size}px`
  saveButton.style.minHeight = `${size}px`
  saveButton.style.maxWidth = `${size}px`
  saveButton.style.maxHeight = `${size}px`
}

let refreshMarksTimer: number | undefined

function scheduleRefreshKnownLinks(root?: ParentNode): void {
  window.clearTimeout(refreshMarksTimer)
  refreshMarksTimer = window.setTimeout(() => {
    void refreshKnownLinkMarks(root ?? document)
  }, 150)
}

function createSaveButton(
  adapter: DonationPanelAdapter,
  url: string | undefined,
  title: string | undefined,
  localeLabels: { save: string; saveLink: string; noLink: string },
): HTMLButtonElement {
  ensureDonationPanelStyles()

  const button = document.createElement('button')
  button.type = 'button'
  if (adapter.buttonClassName) button.className = adapter.buttonClassName
  button.setAttribute('aria-label', localeLabels.save)
  button.title = url ? localeLabels.saveLink : localeLabels.noLink
  button.setAttribute(SAVE_BTN_ATTR, 'true')
  button.disabled = !url

  const icon = document.createElement('img')
  icon.src = resolveSaveButtonLogoUrl()
  icon.alt = ''
  icon.width = 22
  icon.height = 22
  icon.style.borderRadius = '4px'
  icon.style.objectFit = 'contain'
  icon.style.opacity = url ? '1' : '0.45'

  button.appendChild(icon)

  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!url) return

    void loadStoredLocale().then((locale) => {
      showPageToast(t(locale, 'toast.savingLink'), false, url, true, title)
      saveLinkFromPage({ url, title })
    })
  })

  return button
}

async function processDonationItem(
  adapter: DonationPanelAdapter,
  item: HTMLElement,
): Promise<void> {
  const messageParagraph = adapter.getMessageParagraph(item)
  if (messageParagraph) {
    const linkifyOptions = { accent: adapter.id === 'livepix' }
    linkifyTextElement(messageParagraph, linkifyOptions)
    scheduleRefreshKnownLinks(messageParagraph)
  }

  if (item.getAttribute(PROCESSED_ATTR) === 'true') return

  const messageText = messageParagraph?.textContent ?? ''
  const primaryUrl =
    primaryUrlFromMessageElement(messageParagraph) ??
    extractUrlsFromText(messageText)[0]

  const actionBar = adapter.getActionBar(item)
  if (!actionBar || actionBar.querySelector(`[${SAVE_BTN_ATTR}]`)) return

  const reference = adapter.getReferenceControl(actionBar)
  const title =
    messageText.replace(/\s+/g, ' ').trim().slice(0, 120) || undefined
  const locale = await getLivepixLocale()
  const saveButton = createSaveButton(
    adapter,
    primaryUrl,
    title,
    livepixLabels(locale),
  )
  adapter.mountSaveControl(actionBar, saveButton, reference)
  item.setAttribute(PROCESSED_ATTR, 'true')
}

function scanDonationItems(
  adapter: DonationPanelAdapter,
  root: ParentNode = document,
): void {
  root.querySelectorAll(adapter.itemSelector).forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    void processDonationItem(adapter, node)
  })
  scheduleRefreshKnownLinks(root)
}

function registerLinkClickTracking(): void {
  const root = document.documentElement
  if (root.dataset.uniqueTabLinkClicks === 'true') return
  root.dataset.uniqueTabLinkClicks = 'true'

  const markClickedLink = (url: string, anchor: HTMLAnchorElement): void => {
    void markLivepixLinkClicked(url)
    setLinkKnownState(anchor, true)
  }

  async function navigateUniqueTabLink(
    anchor: HTMLAnchorElement,
    active: boolean,
  ): Promise<void> {
    const url = anchor.href
    if (!url) return

    markClickedLink(url, anchor)

    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'find-open-tab',
        url,
      })) as { tabId?: number } | undefined

      if (typeof response?.tabId === 'number') {
        const confirmed = await showRedirectPrompt()
        if (confirmed) {
          await chrome.runtime.sendMessage({
            type: 'focus-tab',
            tabId: response.tabId,
          })
        }
        return
      }

      await chrome.runtime.sendMessage({
        type: 'open-tab',
        url,
        active,
      })
    } catch {
      /* extensao indisponivel */
    }
  }

  document.addEventListener(
    'mousedown',
    (event) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        `a[${UNIQUE_TAB_LINK_ATTR}]`,
      )
      if (!anchor?.href || event.button !== 1) return
      event.preventDefault()
      event.stopPropagation()
    },
    true,
  )

  document.addEventListener(
    'click',
    (event) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        `a[${UNIQUE_TAB_LINK_ATTR}]`,
      )
      if (!anchor?.href) return
      if (event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()
      void navigateUniqueTabLink(anchor, true)
    },
    true,
  )

  document.addEventListener(
    'auxclick',
    (event) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        `a[${UNIQUE_TAB_LINK_ATTR}]`,
      )
      if (!anchor?.href) return
      if (event.button !== 1) return

      event.preventDefault()
      event.stopPropagation()
      void navigateUniqueTabLink(anchor, false)
    },
    true,
  )
}

function startObserver(adapter: DonationPanelAdapter): void {
  ensureDonationPanelStyles()
  registerLinkClickTracking()

  void ensureLivepixClickedLinksLoaded().then(() => {
    scanDonationItems(adapter)
  })

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false

    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        shouldScan = true
        break
      }
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        shouldScan = true
        break
      }
    }

    if (shouldScan) scanDonationItems(adapter)
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'refresh-url-marks') {
    scheduleRefreshKnownLinks()
  }
})

const activeAdapter = getActiveAdapter()
if (activeAdapter) {
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => startObserver(activeAdapter),
      { once: true },
    )
  } else {
    startObserver(activeAdapter)
  }
}
