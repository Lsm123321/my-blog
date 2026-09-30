'use client'

import { useSetAtom } from 'jotai'

import { searchPaletteAtom } from '~/atoms/search'

// 头部搜索入口：点击打开全站搜索命令面板（Ctrl/Cmd+K 同效）
// 注意用真实 <button>：Header 根容器是 pointer-events-none，只对 button/a 恢复交互
export const HeaderSearchButton = () => {
  const setOpen = useSetAtom(searchPaletteAtom)
  return (
    <button
      type="button"
      aria-label="搜索"
      onClick={() => setOpen(true)}
      className="center flex size-10 rounded-full bg-base-100 px-3 text-sm ring-1 ring-zinc-900/5 transition dark:ring-white/10 dark:hover:ring-white/20"
    >
      <svg
        className="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </button>
  )
}
