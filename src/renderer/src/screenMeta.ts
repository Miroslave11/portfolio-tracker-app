import {
  BarChart3,
  Coins,
  Landmark,
  LayoutDashboard,
  ListOrdered,
  Newspaper,
  PieChart,
  Settings as SettingsIcon,
  Target,
  TrendingUp,
  type LucideIcon
} from 'lucide-react'
import type { ScreenId } from './store'

export interface ScreenMeta {
  id: ScreenId
  label: string
  title: string
  icon: LucideIcon
  /** Přírůstek, ve kterém obrazovka dostane obsah. */
  increment: string
  planned: string[]
}

export const SCREEN_META: readonly ScreenMeta[] = [
  {
    id: 'overview',
    label: 'Přehled',
    title: 'Přehled',
    icon: LayoutDashboard,
    increment: 'P4',
    planned: [
      'Hodnota portfolia, vloženo, zisk, změna za den',
      'Graf hodnoty vs. vloženého kapitálu',
      'Pozice a poslední obchody'
    ]
  },
  {
    id: 'summary',
    label: 'Shrnutí',
    title: 'Shrnutí portfolia',
    icon: Newspaper,
    increment: 'P24',
    planned: []
  },
  {
    id: 'performance',
    label: 'Výkon',
    title: 'Výkon',
    icon: TrendingUp,
    increment: 'P5',
    planned: [
      'TTWROR, IRR p.a., absolutní zisk',
      'Období 1M / 3M / YTD / 1R / 3R / 5R / Max / roky / vlastní',
      'Tabulka výkonu po letech'
    ]
  },
  {
    id: 'allocation',
    label: 'Alokace',
    title: 'Alokace',
    icon: PieChart,
    increment: 'P6',
    planned: ['Podle indexu, ETF (sloučeno přes ISIN) a brokera', 'Koláč + tabulka']
  },
  {
    id: 'investments',
    label: 'Investice',
    title: 'Měsíční investice',
    icon: BarChart3,
    increment: 'P7',
    planned: ['Sloupcový graf po měsících podle brokera', 'Průměr a roční součty']
  },
  {
    id: 'transactions',
    label: 'Obchody',
    title: 'Obchody',
    icon: ListOrdered,
    increment: 'P2 / P8',
    planned: ['Tabulka všech transakcí', 'Filtry, řazení, aktuální zisk u nákupu']
  },
  {
    id: 'taxes',
    label: 'Daně',
    title: 'Daně',
    icon: Landmark,
    increment: 'P13 / P14',
    planned: ['Realizovaný zisk (FIFO)', 'Časový test 3 roky']
  },
  {
    id: 'securities',
    label: 'ETF a kurzy',
    title: 'ETF a kurzy',
    icon: Coins,
    increment: 'P3',
    planned: []
  },
  {
    id: 'goal',
    label: 'Cíl',
    title: 'Cíl portfolia',
    icon: Target,
    increment: 'P11',
    planned: ['Postup k cíli', 'Projekce a odhad data dosažení']
  },
  {
    id: 'settings',
    label: 'Nastavení',
    title: 'Nastavení',
    icon: SettingsIcon,
    increment: 'P1',
    planned: []
  }
]

export function screenMeta(id: ScreenId): ScreenMeta {
  return SCREEN_META.find((s) => s.id === id) ?? SCREEN_META[0]
}
