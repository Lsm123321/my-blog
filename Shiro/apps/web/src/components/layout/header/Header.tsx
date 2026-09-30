import './internal/grid.css'

import { memo } from 'react'

import { ErrorBoundary } from '~/components/common/ErrorBoundary'
import { clsxm } from '~/lib/helper'

import { AnimatedLogo } from './internal/AnimatedLogo'
import {
  HeaderCenterArea,
  HeaderLeftButtonArea,
  HeaderLogoArea,
} from './internal/HeaderArea'
import { HeaderContent } from './internal/HeaderContent'
import { HeaderDataConfigureProvider } from './internal/HeaderDataConfigureProvider'
import { HeaderDrawerButton } from './internal/HeaderDrawerButton'
import { HeaderSearchButton } from './internal/HeaderSearchButton'
import { LocaleToggleButton } from './internal/LocaleToggleButton'
import { UserAuth } from './internal/UserAuth'

export const Header = () => (
  <ErrorBoundary>
    <HeaderDataConfigureProvider>
      <MemoedHeader />
    </HeaderDataConfigureProvider>
  </ErrorBoundary>
)
const MemoedHeader = memo(() => {
  return (
    // pointer-events-none：外层全宽透明条不拦截点击（音乐页 iframe 全屏时，
    // 顶栏透明区域曾把 Mineradio 右上角按钮的点击截走）；交互元素各自恢复 auto
    <div
      className="pointer-events-none fixed top-0 z-[9] h-[4.5rem] w-0 lg:inset-x-0 lg:w-auto [&_button]:pointer-events-auto [&_a]:pointer-events-auto"
      data-hide-print
    >
      <div
        className={clsxm(
          'relative mx-auto w-[calc(100vw-var(--removed-body-scroll-bar-size,0px))] grid h-full min-h-0 max-w-7xl grid-cols-[4.5rem_auto_4.5rem] lg:px-8',
          'header--grid',
        )}
      >
        <HeaderLeftButtonArea>
          <HeaderDrawerButton />
        </HeaderLeftButtonArea>

        <HeaderLogoArea>
          <AnimatedLogo />
        </HeaderLogoArea>

        <HeaderCenterArea>
          <HeaderContent />
        </HeaderCenterArea>

        <div className="flex size-full items-center justify-end gap-2">
          <HeaderSearchButton />
          <LocaleToggleButton />
          <UserAuth />
        </div>
      </div>
    </div>
  )
})

MemoedHeader.displayName = 'MemoedHeader'
