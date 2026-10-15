'use client'

import type { AggregateRoot } from '@mx-space/api-client'
import { atom, useAtomValue } from 'jotai'
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
  // 站点数据是首帧渲染就依赖的（头像/webUrl/主题配置），必须渲染期注水：
  // 挂载后 effect 再写来不及（首页组件首帧就拿空值崩溃）。
  // 只在首帧写：原实现用 useHydrateAtoms + dangerouslyForceHydrate，每次渲染
  // 都写 store——router.refresh() 重渲染时下游组件已挂载，会触发 React
  // "Cannot update a component while rendering" 报错（SSE 热更新必经路径）。
  // 改为：首帧渲染期同步初始化（等价 hydrate），后续 props 变化交给 effect 合法更新
  const hydratedRef = useRef(false)
  if (!hydratedRef.current) {
    hydratedRef.current = true
    jotaiStore.set(aggregationDataAtom, aggregationData)
    jotaiStore.set(appConfigAtom, appConfig)
  }
  // refresh()/上游 props 变化时同步新值到 store：此时走 effect（commit 后），
  // 更新已挂载组件是合法的；store 里已有旧值兜底，晚一拍不会让消费方拿到空值
  useEffect(() => {
    jotaiStore.set(aggregationDataAtom, aggregationData)
    jotaiStore.set(appConfigAtom, appConfig)
  }, [aggregationData, appConfig])

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
