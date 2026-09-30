'use client'

import type { FC, PropsWithChildren } from 'react'
import { ErrorBoundary as ErrorBoundaryLib } from 'react-error-boundary'

// import { captureException } from '@sentry/nextjs'
import { useTranslations } from 'next-intl'

import { StyledButton } from '../ui/button'

const FallbackComponent = () => {
  const t = useTranslations('common')
  return (
  <div className="center flex w-full flex-col py-6">
    <p>{t('error_boundary_msg')}</p>
    <StyledButton
      onClick={() => {
        window.location.reload()
      }}
    >
      {t('refresh')}
    </StyledButton>
  </div>
  )
}
export const ErrorBoundary: FC<PropsWithChildren> = ({ children }) => (
  <ErrorBoundaryLib
    FallbackComponent={FallbackComponent}
    onError={(e) => {
      console.error(e)

      // TODO  sentry

      // captureException(e)
    }}
  >
    {children}
  </ErrorBoundaryLib>
)
