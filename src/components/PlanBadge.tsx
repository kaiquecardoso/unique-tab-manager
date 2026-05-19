import type { SubscriptionStatus } from '../lib/api'

type PlanBadgeProps = {
  subscription: SubscriptionStatus
}

export function PlanBadge({ subscription }: PlanBadgeProps) {
  const isPro = subscription.cloudEnabled

  return (
    <span
      className={`plan-badge${isPro ? ' plan-badge--pro' : ' plan-badge--free'}`}
      title={isPro ? 'Sincronização na nuvem ativa' : 'Somente armazenamento local'}
    >
      {isPro ? 'Pro' : 'Gratuito'}
    </span>
  )
}
