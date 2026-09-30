'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { apiClient } from '~/lib/request'

// LRC 解析：[mm:ss.xx] → { time, text }，一行多时间戳会展开为多条
export const parseLrc = (lrc: string): { time: number; text: string }[] =>
  (lrc || '')
    .split('\n')
    .flatMap((line) => {
      const times = [...line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)]
      const text = line.replace(/\[[^\]]*\]/g, '').trim()
      if (!times.length || !text) return []
      return times.map((t) => ({
        time: +t[1] * 60 + +t[2] + (+`0.${t[3] || 0}` || 0),
        text,
      }))
    })
    .sort((a, b) => a.time - b.time)

// 歌词随曲目拉取（后台接口带懒加载自愈，缓存住即可）
export const useLyricQuery = (trackId?: string) => {
  const { data: lrcText } = useQuery({
    queryKey: ['music-lyric', trackId],
    queryFn: () =>
      trackId
        ? apiClient.proxy.music
            .lyric(trackId)
            .get<{ lrc: string }>()
            .then((r) => r?.lrc || '')
        : Promise.resolve(''),
    enabled: !!trackId,
    staleTime: Infinity,
  })
  return useMemo(() => parseLrc(lrcText || ''), [lrcText])
}

// 二分查找当前进度对应的歌词行下标（-1 表示尚未到第一行）
export const findActiveLyricIndex = (
  lyrics: { time: number }[],
  current: number,
): number => {
  let lo = 0
  let hi = lyrics.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lyrics[mid].time <= current) lo = mid + 1
    else hi = mid - 1
  }
  return hi
}

// ---- 歌词校准（MineRadio lyric-timing-popover 同款）：逐曲 ±0.1s 微调，localStorage 持久化 ----
const LYRIC_OFFSET_KEY = 'music-lyric-offsets'
const clampOffset = (v: number) => Math.min(9.9, Math.max(-9.9, Math.round(v * 10) / 10))

export const getLyricOffset = (trackId?: string): number => {
  if (!trackId || typeof window === 'undefined') return 0
  try {
    const map = JSON.parse(localStorage.getItem(LYRIC_OFFSET_KEY) || '{}') as Record<string, number>
    return clampOffset(+map[trackId] || 0)
  } catch {
    return 0
  }
}

export const setLyricOffset = (trackId: string, offset: number) => {
  if (typeof window === 'undefined') return
  try {
    const map = JSON.parse(localStorage.getItem(LYRIC_OFFSET_KEY) || '{}') as Record<string, number>
    const v = clampOffset(offset)
    // 归零即清除，避免 map 无限膨胀
    if (v === 0) delete map[trackId]
    else map[trackId] = v
    localStorage.setItem(LYRIC_OFFSET_KEY, JSON.stringify(map))
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级为会话内校准
  }
}

// 校准值 hook：换曲自动读取对应校准，正值 = 歌词提前显示
export const useLyricOffset = (trackId?: string) => {
  const [offset, setState] = useState(0)
  useEffect(() => setState(getLyricOffset(trackId)), [trackId])
  const update = useCallback(
    (v: number) => {
      const next = clampOffset(v)
      if (trackId) setLyricOffset(trackId, next)
      setState(next)
    },
    [trackId],
  )
  return [offset, update] as const
}

export const fmtTime = (t: number) => {
  if (!Number.isFinite(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
