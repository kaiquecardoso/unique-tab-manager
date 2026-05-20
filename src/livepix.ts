import { extractUrlsFromText, linkifyTextElement } from './lib/urlInText'
import {
  KNOWN_LINK_ATTR,
  refreshKnownLinkMarks,
  setLinkKnownState,
} from './lib/markKnownLinks'
import {
  ensureLivepixClickedLinksLoaded,
  markLivepixLinkClicked,
} from './lib/livepixClickedLinks'
import { showPageToast } from './lib/pageToast'
import { saveLinkFromPage } from './lib/saveLinkFromPage'

const PROCESSED_ATTR = 'data-one-tab-livepix'
const SAVE_BTN_ATTR = 'data-one-tab-save'
const STYLES_ID = 'one-tab-livepix-styles'
const LOGO_URL = chrome.runtime.getURL('src/assets/logo.png')

function ensureLivePixButtonStyles(): void {
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

    a[data-one-tab-link][${KNOWN_LINK_ATTR}] {
      text-decoration: line-through underline !important;
      opacity: 0.72;
    }
  `
  document.head.appendChild(style)
}

function syncSaveButtonSize(
  saveButton: HTMLButtonElement,
  referenceButton: HTMLButtonElement | null,
): void {
  if (!referenceButton) return

  const { width, height } = referenceButton.getBoundingClientRect()
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

function isLivePixDashboard(): boolean {
  return window.location.hostname === 'dashboard.livepix.gg'
}

function getMessageParagraph(item: Element): HTMLElement | null {
  const columns = item.querySelectorAll(':scope > div')
  const messageColumn = columns[1]
  return messageColumn?.querySelector('p') ?? null
}

function getActionBar(item: Element): HTMLElement | null {
  const playButton = item.querySelector('button[aria-label="play"]')
  return playButton?.parentElement ?? null
}

function createSaveButton(
  url: string | undefined,
  title: string | undefined,
  referenceButton: HTMLButtonElement | null,
): HTMLButtonElement {
  ensureLivePixButtonStyles()

  const button = document.createElement('button')
  button.type = 'button'
  button.className =
    'MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeLarge css-1di07jz'
  button.setAttribute('aria-label', 'Salvar no OneTab')
  button.title = url ? 'Salvar link no OneTab' : 'Nenhum link na mensagem'
  button.setAttribute(SAVE_BTN_ATTR, 'true')
  button.disabled = !url
  syncSaveButtonSize(button, referenceButton)

  const icon = document.createElement('img')
  icon.src = LOGO_URL
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

    showPageToast('Salvando link', false, url, true, title)
    saveLinkFromPage({ url, title })
  })

  return button
}

function processTransactionItem(item: HTMLElement): void {
  if (item.getAttribute(PROCESSED_ATTR) === 'true') return
  item.setAttribute(PROCESSED_ATTR, 'true')

  const messageParagraph = getMessageParagraph(item)
  if (messageParagraph) {
    linkifyTextElement(messageParagraph)
    scheduleRefreshKnownLinks(messageParagraph)
  }

  const messageText = messageParagraph?.textContent ?? ''
  const urls = extractUrlsFromText(messageText)
  const primaryUrl = urls[0]

  const actionBar = getActionBar(item)
  if (!actionBar || actionBar.querySelector(`[${SAVE_BTN_ATTR}]`)) return

  const referenceButton = actionBar.querySelector<HTMLButtonElement>(
    'button[aria-label="play"]',
  )
  const title =
    messageText.replace(/\s+/g, ' ').trim().slice(0, 120) || undefined
  const saveButton = createSaveButton(primaryUrl, title, referenceButton)
  actionBar.insertBefore(saveButton, actionBar.firstChild)
  syncSaveButtonSize(saveButton, referenceButton)
}

function scanTransactionItems(root: ParentNode = document): void {
  root.querySelectorAll('.transaction-item').forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    processTransactionItem(node)
  })
  scheduleRefreshKnownLinks(root)
}

function registerLinkClickTracking(): void {
  const root = document.documentElement
  if (root.dataset.oneTabLinkClicks === 'true') return
  root.dataset.oneTabLinkClicks = 'true'

  const markClickedLink = (event: MouseEvent): void => {
    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>(
      'a[data-one-tab-link]',
    )
    if (!anchor?.href) return

    const isPrimaryClick = event.type === 'click' && event.button === 0
    const isMiddleClick =
      (event.type === 'auxclick' && event.button === 1) ||
      (event.type === 'mousedown' && event.button === 1)

    if (!isPrimaryClick && !isMiddleClick) return

    void markLivepixLinkClicked(anchor.href)
    setLinkKnownState(anchor, true)
  }

  document.addEventListener('click', markClickedLink, true)
  document.addEventListener('auxclick', markClickedLink, true)
  document.addEventListener('mousedown', markClickedLink, true)
}

function startObserver(): void {
  ensureLivePixButtonStyles()
  registerLinkClickTracking()

  void ensureLivepixClickedLinksLoaded().then(() => {
    scanTransactionItems()
  })

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false

    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        shouldScan = true
        break
      }
    }

    if (shouldScan) scanTransactionItems()
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'refresh-url-marks') {
    scheduleRefreshKnownLinks()
  }
})

if (isLivePixDashboard()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true })
  } else {
    startObserver()
  }
}
