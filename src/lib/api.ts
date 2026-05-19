export const AUTH_TOKEN_STORAGE_KEY = 'oneTabAuthTokenV1'

export type AuthProvider = 'google' | 'twitch'

export type PublicUser = {
  id: string
  email: string
  name: string
  photo: string | null
  provider: string
  createdAt: string
}

const DEFAULT_API_URL = 'http://localhost:3000'

export function getApiUrl(): string {
  const url = import.meta.env.VITE_API_URL
  return (typeof url === 'string' && url.length > 0 ? url : DEFAULT_API_URL).replace(
    /\/$/,
    '',
  )
}

export function getOAuthStartUrl(provider: AuthProvider): string {
  return `${getApiUrl()}/auth/extension/${provider}`
}

export async function getStoredToken(): Promise<string | null> {
  const record = await chrome.storage.local.get(AUTH_TOKEN_STORAGE_KEY)
  const token = record[AUTH_TOKEN_STORAGE_KEY]
  return typeof token === 'string' && token.length > 0 ? token : null
}

export async function setStoredToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [AUTH_TOKEN_STORAGE_KEY]: token })
}

export async function clearStoredToken(): Promise<void> {
  await chrome.storage.local.remove(AUTH_TOKEN_STORAGE_KEY)
}

export async function fetchCurrentUser(): Promise<PublicUser | null> {
  const token = await getStoredToken()
  if (!token) return null

  const response = await fetch(`${getApiUrl()}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (response.status === 401) {
    await clearStoredToken()
    return null
  }

  if (!response.ok) {
    throw new Error('Não foi possível carregar a sessão.')
  }

  const data = (await response.json()) as { user: PublicUser }
  return data.user
}
