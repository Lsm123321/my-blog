'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { API_URL } from '~/constants/env'

/**
 * 内容热更新监听（SSE）。
 *
 * 后台管理页每次写操作，后端 /api/v2/events 会推来 content-updated 事件，
 * 这里失效全部 react-query 缓存 + 让 Next 重新拉取当前路由的 RSC——
 * 页面数据随即自动换新，访客无需手动刷新。
 *
 * 关键约束：只做数据层更新，绝不 location.reload()——整页刷新会销毁
 * Mineradio 舞台 iframe 和 window 级 audio 单例，正在播放的音乐会被掐断。
 * queryClient.invalidateQueries / router.refresh 都保留客户端状态与 DOM，
 * 音乐（window.__mrAudio / 常驻 iframe）完全不受影响。
 */
export const ContentUpdateListener: Component = () => {
  const queryClient = useQueryClient()
  const router = useRouter()
  // 后台一次保存常触发多个写请求（如发文章 + 计数），合并 800ms 内的广播为一次刷新
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 同源部署（Caddy 反代）与本地分离开发（后端 CORS 已放行 localhost）都直连后端
    const es = new EventSource(`${API_URL}/events`)

    // 后端发的是具名事件（event: content-updated），onmessage 只收默认 message 类型，必须按名订阅
    es.addEventListener('content-updated', () => {
      if (pendingRef.current) clearTimeout(pendingRef.current)
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null
        // 全量失效：一次管理操作往往牵连多个视图（列表/聚合/侧栏），粗粒度最稳；
        // 管理端变更是低频事件，重取开销可忽略
        void queryClient.invalidateQueries()
        router.refresh()
      }, 800)
    })
    // onerror 无需处理：EventSource 断线后浏览器自动重连

    return () => {
      es.close()
      if (pendingRef.current) clearTimeout(pendingRef.current)
    }
  }, [queryClient, router])

  return null
}
