'use client'

import { DialogContent, DialogPortal, Root } from '@radix-ui/react-dialog'
import { AnimatePresence, m } from 'motion/react'
import { useTranslations } from 'next-intl'
import type { FC, PropsWithChildren } from 'react'
import { createContext, use, useEffect, useRef, useState } from 'react'

import { isOwnerLogged } from '~/atoms/hooks/owner'
import { ModalOverlay } from '~/components/ui/modal/stacked/overlay'

const BanCopyContext = createContext(false)

export const useIsInBanCopyContext = () => use(BanCopyContext)

export const BanCopyWrapper: FC<PropsWithChildren> = (props) => {
  const t = useTranslations('post')
  const [showCopyWarn, setShowCopyWarn] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) {
      return
    }
    const $el = ref.current
    $el.oncopy = (e) => {
      if (isOwnerLogged()) {
        return
      }
      e.preventDefault()
      setShowCopyWarn(true)
    }

    return () => {
      $el.oncopy = null
    }
  }, [])

  useEffect(() => {
    if (showCopyWarn) {
      const id = setTimeout(() => {
        setShowCopyWarn(false)
      }, 2000)
      return () => {
        clearTimeout(id)
      }
    }
  }, [showCopyWarn])
  return (
    <BanCopyContext value={true}>
      <div ref={ref}>{props.children}</div>
      <Root open>
        <AnimatePresence>
          {showCopyWarn && (
            <DialogPortal>
              <ModalOverlay />
              <DialogContent asChild>
                <m.div
                  className="center fixed inset-0 z-[999] flex flex-col gap-4"
                  exit={{
                    opacity: 0,
                  }}
                  onClick={() => {
                    setShowCopyWarn(false)
                  }}
                >
                  <div className="pointer-events-none mt-0 text-3xl font-medium text-red-400 dark:text-orange-500">
                    {t('ban_copy_title')}
                  </div>
                  <div className="pointer-events-none my-3 text-lg text-neutral-900/80 dark:text-zinc-100/80">
                    <p>{t('ban_copy_body')}</p>
                  </div>
                </m.div>
              </DialogContent>
            </DialogPortal>
          )}
        </AnimatePresence>
      </Root>
    </BanCopyContext>
  )
}
