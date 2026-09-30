'use client'

import { atom, useAtomValue, useSetAtom } from 'jotai'
import type { FC, PropsWithChildren } from 'react'
import { memo, useEffect } from 'react'

import { jotaiStore } from '~/lib/store'

const currentNoteNidAtom = atom<null | string>(null)
export const CurrentNoteNidProvider: FC<
  {
    nid: string
  } & PropsWithChildren
> = memo(({ nid, children }) => {
  const setNoteId = useSetAtom(currentNoteNidAtom)
  // 不能在渲染期 set（useBeforeMounted 方案会触发 React
  // "Cannot update a component while rendering" 警告），挂载后再写
  useEffect(() => {
    setNoteId(nid)
  }, [nid])

  return children
})
CurrentNoteNidProvider.displayName = 'CurrentNoteIdProvider'

export const useCurrentNoteNid = () => useAtomValue(currentNoteNidAtom)

/**
 * Only used in error page to set current note id
 */
export const setCurrentNoteNid = (noteId: string) => {
  jotaiStore.set(currentNoteNidAtom, noteId)
}
