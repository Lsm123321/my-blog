'use client'

import type { AggregateRoot } from '@mx-space/api-client'
import { atom, useAtomValue } from 'jotai'
import { useHydrateAtoms } from 'jotai/react/utils'
import { selectAtom } from 'jotai/utils'
import type { FC, PropsWithChildren } from 'react'
import { useCallback, useEffect, useRef } from 'react'

import { setWebUrl } from '~/atoms'
import { isDev } from '~/lib/env'
import { jotaiStore } from '~/lib/store'

export type { AggregateRoot }

export const aggregationDataAtom = atom<null | AggregateRoot>(null)
const appConfigAtom = atom<AppConfig | null>(null)

export const AggregationProvider: FC<
  PropsWithChildren<{
    aggregationData: AggregateRoot
    appConfig: AppConfig
  }>
> = ({ children, aggregationData, appConfig }) => {
  // 站点数据是首帧渲染就依赖的（头像/webUrl/主题配置），必须用 hydrate 注水：
  // 渲染期 jotaiStore.set 会触发 React "Cannot update a component while rendering" 警告，
  // 挂载后 useEffect 再写又来不及（首页组件首帧就拿空值崩溃）。hydrate 两头都满足
  useHydrateAtoms(
    [
      [aggregationDataAtom, aggregationData],
      [appConfigAtom, appConfig],
    ],
    { dangerouslyForceHydrate: true },
  )
  useEffect(() => {
    if (aggregationData?.url?.webUrl) setWebUrl(aggregationData.url.webUrl)
  }, [aggregationData])

  const callOnceRef = useRef(false)

  useEffect(() => {
    if (callOnceRef.current) return
    if (!aggregationData?.user) return
    callOnceRef.current = true
  }, [aggregationData?.user])

  return children
}

export const useAggregationSelector = <T,>(
  selector: (atomValue: AggregateRoot) => T,
  deps: any[] = [],
): T | null =>
  useAtomValue(
    // @ts-ignore
    selectAtom(
      aggregationDataAtom,
      useCallback(
        (atomValue) => (!atomValue ? null : selector(atomValue)),
        deps,
      ),
    ),
  )

export const useAppConfigSelector = <T,>(
  selector: (atomValue: AppConfig) => T,
  deps: any[] = [],
): T | null =>
  useAtomValue(
    // @ts-ignore
    selectAtom(
      appConfigAtom,
      useCallback(
        (atomValue) =>
          !atomValue ? null : noThrowFnWrapper(selector)(atomValue),
        deps,
      ),
    ),
  )

export const getAggregationData = () => jotaiStore.get(aggregationDataAtom)

export const getAppConfig = () => jotaiStore.get(appConfigAtom)

const noThrowFnWrapper = <T extends (...args: any[]) => any>(fn: T): T => {
  return ((...args: any[]) => {
    try {
      return fn(...args)
    } catch (e: any) {
      if (isDev) {
        console.error(e)
      }
      return null
    }
  }) as T
}
