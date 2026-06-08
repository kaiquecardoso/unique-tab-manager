import { de, enUS, es, fr, it, ptBR } from "date-fns/locale";
import type { Locale } from "date-fns/locale";
import { DEFAULT_LOCALE, type Messages, type SupportedLocale } from "./types";
import { allMessages } from "./messages";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    (["pt-BR", "en", "es", "it", "de", "fr"] as const).includes(
      value as SupportedLocale,
    )
  );
}

export function detectBrowserLocale(): SupportedLocale {
  const langs = [
    ...(typeof navigator !== "undefined" ? navigator.languages : []),
    typeof navigator !== "undefined" ? navigator.language : "",
  ].filter(Boolean);

  for (const lang of langs) {
    const normalized = lang.toLowerCase();
    if (normalized.startsWith("pt")) return "pt-BR";
    if (normalized.startsWith("es")) return "es";
    if (normalized.startsWith("it")) return "it";
    if (normalized.startsWith("de")) return "de";
    if (normalized.startsWith("fr")) return "fr";
    if (normalized.startsWith("en")) return "en";
  }

  return DEFAULT_LOCALE;
}

export function getMessages(locale: SupportedLocale): Messages {
  return allMessages[locale] ?? allMessages[DEFAULT_LOCALE];
}

export function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

export function t(
  locale: SupportedLocale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const messages = getMessages(locale);
  const template = messages[key] ?? allMessages[DEFAULT_LOCALE][key];
  if (!template) return key;
  return interpolate(template, params);
}

export function plural(
  locale: SupportedLocale,
  keyPrefix: string,
  count: number,
  params?: Record<string, string | number>,
): string {
  const suffix = count === 1 ? "one" : "other";
  return t(locale, `${keyPrefix}.${suffix}`, { ...params, count });
}

export function getIntlLocale(locale: SupportedLocale): string {
  const map: Record<SupportedLocale, string> = {
    "pt-BR": "pt-BR",
    en: "en-US",
    es: "es",
    it: "it",
    de: "de",
    fr: "fr",
  };
  return map[locale];
}

export function getDateFnsLocale(locale: SupportedLocale): Locale {
  const map: Record<SupportedLocale, Locale> = {
    "pt-BR": ptBR,
    en: enUS,
    es,
    it,
    de,
    fr,
  };
  return map[locale];
}

export function formatTabCount(locale: SupportedLocale, count: number): string {
  return plural(locale, "plural.tabCount", count, { count });
}

export function formatRelativeAgo(
  locale: SupportedLocale,
  saved: Date,
): string {
  const sec = Math.round((Date.now() - saved.getTime()) / 1000);
  if (sec < 45) return t(locale, "relativeTime.now");
  const min = Math.floor(sec / 60);
  if (min < 60) return t(locale, "relativeTime.minutesAgo", { min });
  const h = Math.floor(min / 60);
  if (h < 48) return t(locale, "relativeTime.hoursAgo", { h });
  const days = Math.floor(h / 24);
  return t(locale, "relativeTime.daysAgo", { days });
}

export function formatShortDate(locale: SupportedLocale, d: Date): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

export function formatCalendarDate(locale: SupportedLocale, d: Date): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatTimeOnly(locale: SupportedLocale, d: Date): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function formatTabAddedAt(locale: SupportedLocale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export function formatGroupMetaLine(locale: SupportedLocale, d: Date): string {
  return `${formatShortDate(locale, d)} | ${formatTimeOnly(locale, d)} | ${formatRelativeAgo(locale, d)}`;
}

export function formatDisplayDate(locale: SupportedLocale, d: Date): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatSavedAt(
  locale: SupportedLocale,
  iso: string | undefined,
): string {
  if (!iso) return "";
  const tms = Date.parse(iso);
  if (!Number.isFinite(tms)) return "";
  const d = new Date(tms);
  const date = d.toLocaleDateString(getIntlLocale(locale));
  const time = d.toLocaleTimeString(getIntlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return t(locale, "duplicate.savedAt", { date, time });
}
