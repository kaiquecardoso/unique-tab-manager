import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import type { Locale } from 'date-fns/locale'
import {
  formatCalendarDate,
  formatDisplayDate,
  formatGroupMetaLine,
  formatRelativeAgo,
  formatShortDate,
  formatTabAddedAt,
  formatTabCount,
  formatTimeOnly,
  getDateFnsLocale,
  getIntlLocale,
  plural,
  t as translate,
} from './core'
import type { SupportedLocale } from './types'

type I18nContextValue = {
  locale: SupportedLocale
  t: (key: string, params?: Record<string, string | number>) => string
  plural: (
    keyPrefix: string,
    count: number,
    params?: Record<string, string | number>,
  ) => string
  formatTabCount: (count: number) => string
  formatRelativeAgo: (saved: Date) => string
  formatShortDate: (d: Date) => string
  formatCalendarDate: (d: Date) => string
  formatTimeOnly: (d: Date) => string
  formatGroupMetaLine: (d: Date) => string
  formatTabAddedAt: (iso: string) => string
  formatDisplayDate: (d: Date) => string
  dateFnsLocale: Locale
  intlLocale: string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({
  locale,
  children,
}: {
  locale: SupportedLocale
  children: ReactNode
}) {
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale],
  )

  const pluralFn = useCallback(
    (
      keyPrefix: string,
      count: number,
      params?: Record<string, string | number>,
    ) => plural(locale, keyPrefix, count, params),
    [locale],
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      t,
      plural: pluralFn,
      formatTabCount: (count) => formatTabCount(locale, count),
      formatRelativeAgo: (saved) => formatRelativeAgo(locale, saved),
      formatShortDate: (d) => formatShortDate(locale, d),
      formatCalendarDate: (d) => formatCalendarDate(locale, d),
      formatTimeOnly: (d) => formatTimeOnly(locale, d),
      formatGroupMetaLine: (d) => formatGroupMetaLine(locale, d),
      formatTabAddedAt: (iso) => formatTabAddedAt(locale, iso),
      formatDisplayDate: (d) => formatDisplayDate(locale, d),
      dateFnsLocale: getDateFnsLocale(locale),
      intlLocale: getIntlLocale(locale),
    }),
    [locale, t, pluralFn],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return ctx
}
