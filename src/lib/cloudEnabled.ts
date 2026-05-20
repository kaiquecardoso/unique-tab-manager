/** Nuvem em pausa — padrão offline. Defina VITE_CLOUD_ENABLED=true para reativar. */
export const isCloudEnabled =
  import.meta.env.VITE_CLOUD_ENABLED === 'true' ||
  import.meta.env.VITE_CLOUD_ENABLED === '1'
