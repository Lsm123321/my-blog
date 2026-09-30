'use client'

import { useTranslations } from 'next-intl'

import { clsxm } from '~/lib/helper'

export type LoadingProps = {
  loadingText?: string
  useDefaultLoadingText?: boolean
}

export const Loading: Component<LoadingProps> = ({
  loadingText,
  className,
  useDefaultLoadingText = false,
}) => {
  const t = useTranslations('common')
  // loading_default 在消息文件里是文案数组，随机取一条；t() 遇数组会报 INVALID_MESSAGE
  const defaultLoadingText = (() => {
    const raw = t.raw('loading_default')
    return Array.isArray(raw) && raw.length
      ? raw[Math.floor(Math.random() * raw.length)]
      : (raw as string)
  })()
  const nextLoadingText = useDefaultLoadingText
    ? defaultLoadingText
    : loadingText
  return (
    <div
      data-hide-print
      className={clsxm('my-20 flex flex-col center', className)}
    >
      <span className="loading loading-ball loading-lg" />
      {!!nextLoadingText && (
        <span className="mt-6 block">{nextLoadingText}</span>
      )}
    </div>
  )
}

export const FullPageLoading = () => (
  <Loading useDefaultLoadingText className="h-[calc(100vh-6.5rem-10rem)]" />
)
