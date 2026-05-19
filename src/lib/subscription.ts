import {
  clearStoredToken,
  getApiUrl,
  getStoredToken,
  type PublicUser,
  type SubscriptionStatus,
} from './api'

export type { SubscriptionStatus }

export const FREE_SUBSCRIPTION: SubscriptionStatus = {
  plan: 'free',
  proExpiresAt: null,
  isLifetime: false,
  cloudEnabled: false,
}

export async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
  const token = await getStoredToken()
  if (!token) return FREE_SUBSCRIPTION

  const response = await fetch(`${getApiUrl()}/subscription`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (response.status === 401) {
    await clearStoredToken()
    return FREE_SUBSCRIPTION
  }

  if (!response.ok) {
    throw new Error('Não foi possível carregar o plano.')
  }

  const data = (await response.json()) as
    | SubscriptionStatus
    | { subscription: SubscriptionStatus }

  if ('subscription' in data && data.subscription) {
    return data.subscription
  }

  return data as SubscriptionStatus
}

export type RedeemAccessKeyResult = {
  user: PublicUser
  subscription: SubscriptionStatus
}

export async function redeemAccessKey(code: string): Promise<RedeemAccessKeyResult> {
  const token = await getStoredToken()
  if (!token) {
    throw new Error('Faça login antes de resgatar uma chave.')
  }

  const response = await fetch(`${getApiUrl()}/subscription/redeem`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  })

  const data = (await response.json()) as {
    message?: string
    user?: PublicUser
    subscription?: SubscriptionStatus
  }

  if (!response.ok) {
    throw new Error(data.message ?? 'Não foi possível resgatar a chave.')
  }

  if (!data.user) {
    throw new Error('Resposta inválida do servidor.')
  }

  const subscription =
    data.subscription ?? (await fetchSubscriptionStatus())

  return { user: data.user, subscription }
}

export function formatSubscriptionLabel(subscription: SubscriptionStatus): string {
  if (!subscription.cloudEnabled) {
    return 'Gratuito (somente local)'
  }
  if (subscription.isLifetime) {
    return 'Pro — vitalício'
  }
  if (subscription.proExpiresAt) {
    const date = new Date(subscription.proExpiresAt).toLocaleDateString('pt-BR')
    return `Pro até ${date}`
  }
  return 'Pro'
}

export function hasCloudAccess(
  subscription: SubscriptionStatus | null | undefined,
): boolean {
  return subscription?.cloudEnabled === true
}
