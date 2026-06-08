export const SUPPORTED_LOCALES = [
  'pt-BR',
  'en',
  'es',
  'it',
  'de',
  'fr',
] as const

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: SupportedLocale = 'pt-BR'

export type Messages = Record<string, string>
