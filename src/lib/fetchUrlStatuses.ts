export type UrlStatus = {
  saved: boolean
  open: boolean
}

export type UrlStatusMap = Record<string, UrlStatus>

export async function fetchUrlStatuses(urls: string[]): Promise<UrlStatusMap> {
  const unique = [...new Set(urls.filter(Boolean))]
  if (unique.length === 0) return {}

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'check-url-status', urls: unique }, (response) => {
      if (chrome.runtime.lastError || !response || typeof response !== 'object') {
        resolve({})
        return
      }
      resolve(response as UrlStatusMap)
    })
  })
}
