'use client'

import { useLocale, useTranslations } from 'next-intl'
import { memo, useTransition } from 'react'

import type { Locale } from '~/i18n/config'
import { usePathname, useRouter } from '~/i18n/navigation'

import { HeaderActionButton } from './HeaderActionButton'

/**
 * 中英文快捷切换按钮
 *
 * 位于 header 右上角（与左上角抽屉按钮对称），复用 HeaderActionButton
 * 的圆形描边风格，与现有导航胶囊融为一体。
 * 按钮文案显示「目标语言」：中文站显示 EN，英文站显示 中。
 * 点击通过 next-intl 路由跳转（自动持久化 NEXT_LOCALE cookie，
 * 服务端内容随路由重新渲染）。
 */
export const LocaleToggleButton = memo(() => {
  const t = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  // ja 站点击直接回到中文（本按钮只做中英快捷切换，ja 可用页脚选择器）
  const nextLocale: Locale = locale === 'zh' ? 'en' : 'zh'
  // 目标语言作为按钮标签，所见即所点
  const label = locale === 'zh' ? 'EN' : '中'

  const handleClick = () => {
    if (isPending) return
    startTransition(() => {
      router.push(pathname, { locale: nextLocale })
    })
  }

  return (
    <HeaderActionButton
      role="button"
      aria-label={t('aria_locale_toggle')}
      title={t('aria_locale_toggle')}
      onClick={handleClick}
      className={isPending ? 'opacity-60' : undefined}
      data-hide-print
    >
      <span className="select-none text-sm font-medium tracking-wide">
        {label}
      </span>
    </HeaderActionButton>
  )
})

LocaleToggleButton.displayName = 'LocaleToggleButton'
