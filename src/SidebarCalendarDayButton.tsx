import { useEffect, useRef } from 'react'
import type { DayButtonProps } from 'react-day-picker'
import { useI18n } from './i18n/context'
import {
  dotTierFromViewedPercent,
  type DayViewedStats,
  viewedPercent,
} from './lib/tabsPerCalendarDay'

export function createSidebarCalendarDayButton(
  viewedByDay: Map<string, DayViewedStats>,
) {
  return function SidebarCalendarDayButton(props: DayButtonProps) {
    const { day, modifiers, children, ...buttonProps } = props
    const ref = useRef<HTMLButtonElement>(null)
    const { t } = useI18n()

    useEffect(() => {
      if (modifiers.focused) ref.current?.focus()
    }, [modifiers.focused])

    const stats = viewedByDay.get(day.isoDate)
    const total = stats?.total ?? 0
    const viewed = stats?.viewed ?? 0
    const percent = stats ? viewedPercent(stats) : 0
    const tier = total > 0 ? dotTierFromViewedPercent(percent) : null

    return (
      <button ref={ref} {...buttonProps} type="button">
        <span className="sidebar-cal-day-inner">
          <span className="sidebar-cal-day-label">{children}</span>
          {tier ? (
            <span
              className={`sidebar-cal-dot sidebar-cal-dot--${tier}`}
              aria-hidden
              title={t('calendar.viewedTooltip', {
                viewed,
                total,
                percent: percent.toFixed(percent % 1 === 0 ? 0 : 1),
                tier: t(`calendar.tier.${tier}`),
              })}
            />
          ) : null}
        </span>
      </button>
    )
  }
}
