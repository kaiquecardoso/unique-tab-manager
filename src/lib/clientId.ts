export const CLIENT_ID_STORAGE_KEY = 'oneTabClientIdV1'

export async function getClientId(): Promise<string> {
  const record = await chrome.storage.local.get(CLIENT_ID_STORAGE_KEY)
  const existing = record[CLIENT_ID_STORAGE_KEY]
  if (typeof existing === 'string' && existing.length > 0) {
    return existing
  }

  const id = crypto.randomUUID()
  await chrome.storage.local.set({ [CLIENT_ID_STORAGE_KEY]: id })
  return id
}
