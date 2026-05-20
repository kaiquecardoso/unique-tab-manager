import { tabUrlKey } from './browserTab'
import { fetchUrlStatuses } from './fetchUrlStatuses'
import {
  ensureLivepixClickedLinksLoaded,
  isLivepixLinkClicked,
} from './livepixClickedLinks'

export const KNOWN_LINK_ATTR = 'data-one-tab-known'
const LINK_SELECTOR = 'a[data-one-tab-link]'

export function setLinkKnownState(anchor: HTMLAnchorElement, known: boolean): void {
  if (known) {
    anchor.setAttribute(KNOWN_LINK_ATTR, 'true')
  } else {
    anchor.removeAttribute(KNOWN_LINK_ATTR)
  }
}

export function isLinkKnown(
  href: string,
  status: { saved: boolean; open: boolean } | undefined,
): boolean {
  return Boolean(status?.saved || status?.open || isLivepixLinkClicked(href))
}

export async function refreshKnownLinkMarks(root: ParentNode = document): Promise<void> {
  await ensureLivepixClickedLinksLoaded()

  const anchors = [...root.querySelectorAll<HTMLAnchorElement>(LINK_SELECTOR)]
  if (anchors.length === 0) return

  const urls = anchors.map((anchor) => anchor.href)
  const statuses = await fetchUrlStatuses(urls)

  for (const anchor of anchors) {
    const key = tabUrlKey(anchor.href)
    setLinkKnownState(anchor, isLinkKnown(anchor.href, statuses[key]))
  }
}
