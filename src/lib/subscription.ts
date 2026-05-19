import { getApiUrl, getStoredToken, type PublicUser } from './api'

export type SubscriptionStatus = NonNullable<PublicUser['subscription']>

export async function redeemAccessKey(code: string): Promise<PublicUser> {
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

  const data = (await response.json()) as { message?: string; user?: PublicUser }

  if (!response.ok) {
    throw new Error(data.message ?? 'Não foi possível resgatar a chave.')
  }

  if (!data.user) {
    throw new Error('Resposta inválida do servidor.')
  }

  return data.user
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
