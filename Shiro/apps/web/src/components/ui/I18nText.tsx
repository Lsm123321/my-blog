'use client'

import { useTranslations } from 'next-intl'

/**
 * 通用 i18n 文本节点：用于无法调用 hook 的位置
 * （class 组件 render、插件对象的 JSX 字段等）。
 * 从 RSC 引用时 props 均可序列化，安全。
 */
export const I18nText = ({
  ns,
  k,
  values,
}: {
  ns: string
  k: string
  values?: Record<string, any>
}) => {
  const t = useTranslations(ns)
  return <>{t(k as any, values)}</>
}
