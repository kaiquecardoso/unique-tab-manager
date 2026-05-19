/** Espelha `BILLING_ENABLED` do backend. Padrão: acesso completo (false). */
export const isBillingEnabled =
  import.meta.env.VITE_BILLING_ENABLED === 'true' ||
  import.meta.env.VITE_BILLING_ENABLED === '1'
