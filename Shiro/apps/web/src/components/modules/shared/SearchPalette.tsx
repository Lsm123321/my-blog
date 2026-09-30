'use client'

import { AnimatePresence, m } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { useAtomValue, useSetAtom } from 'jotai'

import { searchPaletteAtom } from '~/atoms/search'
import { API_URL } from '~/constants/env'
import { clsxm } from '~/lib/helper'

// 后端 /api/v2/search/posts 返回的最小字段集
interface SearchHit {
  id: string
  title: string
  slug: string
  categorySlug: string
  categoryName: string
  summary: string
  created: string
}

// 全站搜索命令面板：Ctrl/Cmd+K 呼出，输入即搜（300ms 防抖），回车/点击直达文章
export const SearchPalette = () => {
  const open = useAtomValue(searchPaletteAtom)
  const setOpen = useSetAtom(searchPaletteAtom)
  const router = useRouter()

  const [keyword, setKeyword] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // 全局快捷键：Ctrl/Cmd+K 开关面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, setOpen])

  // 打开时重置状态并聚焦输入框
  useEffect(() => {
    if (open) {
      setKeyword('')
      setHits([])
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // 关键词防抖搜索
  useEffect(() => {
    const kw = keyword.trim()
    if (!kw) {
      setHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/search/posts?keyword=${encodeURIComponent(kw)}`)
        const list = res.ok ? ((await res.json()) as SearchHit[]) : []
        setHits(list)
      } catch {
        setHits([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [keyword])

  const goPost = (hit: SearchHit) => {
    setOpen(false)
    router.push(`/posts/${hit.categorySlug}/${hit.slug}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false)
    if (!hits.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % hits.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + hits.length) % hits.length)
    } else if (e.key === 'Enter') {
      goPost(hits[activeIndex])
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <m.div
          className="fixed inset-0 z-[99] flex items-start justify-center bg-black/40 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <m.div
            className="mx-4 w-full max-w-xl overflow-hidden rounded-2xl bg-zinc-50 shadow-2xl ring-1 ring-zinc-900/10 dark:bg-neutral-900 dark:ring-white/10"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-zinc-200 px-4 dark:border-neutral-800">
              <SearchIcon />
              <input
                ref={inputRef}
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value)
                  setActiveIndex(0)
                }}
                onKeyDown={handleKeyDown}
                placeholder="搜索文章…"
                className="w-full bg-transparent py-4 text-base outline-none placeholder:text-zinc-400"
              />
              <kbd className="hidden rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-400 sm:block dark:border-neutral-700">
                ESC
              </kbd>
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-2">
              {!keyword.trim() && (
                <p className="px-4 py-8 text-center text-sm text-zinc-400">
                  输入关键词，按 ↑↓ 选择，Enter 打开
                </p>
              )}
              {keyword.trim() && searching && (
                <p className="px-4 py-8 text-center text-sm text-zinc-400">搜索中…</p>
              )}
              {keyword.trim() && !searching && hits.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-zinc-400">没有找到相关文章</p>
              )}
              {hits.map((hit, i) => (
                <button
                  type="button"
                  key={hit.id}
                  onClick={() => goPost(hit)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={clsxm(
                    'block w-full rounded-xl px-4 py-3 text-left transition-colors',
                    i === activeIndex ? 'bg-zinc-200/70 dark:bg-neutral-800' : '',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <b className="truncate text-sm font-medium">{hit.title}</b>
                    <span className="shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-500 dark:bg-neutral-800 dark:text-zinc-400">
                      {hit.categoryName}
                    </span>
                  </span>
                  {hit.summary && (
                    <span className="mt-1 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {hit.summary}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

const SearchIcon = () => (
  <svg
    className="size-4 shrink-0 text-zinc-400"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)
