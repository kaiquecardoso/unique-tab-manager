import type { SupportedLocale } from '../types'
import { de } from './de'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'
import { it } from './it'
import { ptBR } from './pt-BR'

export const allMessages: Record<SupportedLocale, typeof ptBR> = {
  'pt-BR': ptBR,
  en,
  es,
  it,
  de,
  fr,
}
