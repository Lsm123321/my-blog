'use client'

import { useTranslations } from 'next-intl'
import type { FC, PropsWithChildren } from 'react'

import { useIsEnableSubscribe, usePresentSubscribeModal } from './hooks'

export const SubscribeTextButton: FC<PropsWithChildren> = ({ children }) => {
  const t = useTranslations('subscribe')
  const canSubscribe = useIsEnableSubscribe()
  const { present } = usePresentSubscribeModal()

  if (!canSubscribe) {
    return null
  }

  return (
    <>
      <span>
        <button onClick={present}>{t('submit')}</button>
      </span>
      {children}
    </>
  )
}
