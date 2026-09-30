'use client'

import { m } from 'motion/react'
import { useEffect, useState } from 'react'

import { useCurrentPostDataSelector } from '~/providers/post/CurrentPostDataProvider'
import { clsxm } from '~/lib/helper'

// 打字机每步前进的字符数：一次走 2 字比逐字更接近市面 AI 摘要的节奏
const TYPE_STEP = 2
const TYPE_INTERVAL_MS = 30

// 文章页 AI 摘要卡片：读取后端 GLM 生成的 aiSummary，打字机逐字呈现
// 后台「✨ AI 摘要」按钮生成后，文章刷新即可看到
export const AiSummary = ({ className }: { className?: string }) => {
  const aiSummary = useCurrentPostDataSelector((s) => (s as any)?.aiSummary ?? null) as
    | string
    | null
  const aiSummaryAt = useCurrentPostDataSelector((s) => (s as any)?.aiSummaryAt ?? null) as
    | string
    | null

  const [shown, setShown] = useState(0)
  const typing = !!aiSummary && shown < aiSummary.length

  useEffect(() => {
    setShown(0)
  }, [aiSummary])

  useEffect(() => {
    if (!aiSummary || shown >= aiSummary.length) return
    const timer = setTimeout(
      () => setShown((n) => Math.min(n + TYPE_STEP, aiSummary.length)),
      TYPE_INTERVAL_MS,
    )
    return () => clearTimeout(timer)
  }, [aiSummary, shown])

  if (!aiSummary) return null

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={clsxm(
        'relative overflow-hidden rounded-2xl border border-emerald-500/20',
        'bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent',
        'px-5 py-4',
        className,
      )}
    >
      <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <SparkleIcon />
        AI 摘要
        {aiSummaryAt && (
          <span className="text-xs font-normal text-zinc-400">
            · {relativeTime(aiSummaryAt)}生成
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-neutral-300">
        {aiSummary.slice(0, shown)}
        {typing && (
          <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-[2px] animate-pulse bg-emerald-500" />
        )}
      </p>
      <p className="mt-2 text-xs text-zinc-400 dark:text-neutral-500">
        由 GLM 自动生成，仅供参考
      </p>
    </m.div>
  )
}

const SparkleIcon = () => (
  <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l1.9 5.7a2 2 0 0 0 1.2 1.3L20.9 11l-5.8 2a2 2 0 0 0-1.2 1.2L12 20l-1.9-5.8a2 2 0 0 0-1.2-1.2L3.1 11l5.8-2a2 2 0 0 0 1.2-1.3L12 2z" />
    <path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z" opacity=".6" />
  </svg>
)

// 相对时间："3 分钟前 / 2 小时前 / 5 天前 / 1 个月前"
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return `${Math.floor(day / 30)} 个月前`
}
