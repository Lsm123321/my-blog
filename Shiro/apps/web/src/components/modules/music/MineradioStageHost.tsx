'use client'

import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef } from 'react'

import { mineradioSeenAtom } from './MusicProvider'
import { API_URL } from '~/constants/env'
import { usePathname } from '~/i18n/navigation'

/**
 * Mineradio 舞台宿主：iframe 从 /music 路由页提升为全局常驻组件。
 *
 * 此前 iframe 挂在路由页里，切到别的页面路由卸载组件 → iframe 销毁 →
 * 里面的 audio 跟着死，音乐被迫中断。现在进入过一次 /music 后 iframe
 * 永不卸载：在 /music 时全屏可见可交互；其他路由只做视觉隐藏
 * （visibility:hidden 不会卸载文档，audio 照常播放），由全局迷你条遥控。
 *
 * 未进过 /music 前不渲染 iframe：Mineradio 是重型场景（Three.js + 数十个
 * 模块），首访博客的其他页面不该为它付出加载成本。
 *
 * 保持单节点直渲染（不用 portal）：Fast Refresh 保留 state，portal 会造成
 * 客户端/服务端树形不一致引发 useId 水合错位（同前任 MusicStageFrame 的教训）。
 */
export const MineradioStageHost: Component = () => {
  const pathname = usePathname()
  const seen = useAtomValue(mineradioSeenAtom)
  const setSeen = useSetAtom(mineradioSeenAtom)
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  const visible = pathname.startsWith('/music')

  useEffect(() => {
    if (visible) setSeen(true)
  }, [visible, setSeen])

  // 层叠纠偏（沿袭 MusicStageFrame）：Shiro 的 main(z-1) 会困住 iframe，
  // 可见时把 main 置 z-auto 让 iframe(z-[5]) 浮到页脚之上、顶栏(z-9)之下；
  // 离开 /music 时还原，避免影响其他页面的层叠上下文
  useEffect(() => {
    if (!visible || !seen) return
    const main = document.querySelector('main')
    if (!main) return
    const prev = main.style.zIndex
    main.style.zIndex = 'auto'
    return () => {
      main.style.zIndex = prev
    }
  }, [visible, seen])

  if (!seen) return null

  return (
    <iframe
      ref={(el) => {
        frameRef.current = el
        // iframe 实例暴露到 window：迷你条桥接（读 playQueue/audio、调 nextTrack 等）
        // 全走这个引用，dev HMR / StrictMode 重挂也不会丢
        ;(window as any).__mineradioFrame = el
      }}
      src="/mineradio/index.html"
      title="沉浸式音乐现场"
      data-api-url={API_URL}
      className="fixed inset-0 z-[5] h-full w-full border-0 bg-black"
      style={{
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
      }}
      allow="autoplay; fullscreen; encrypted-media"
    />
  )
}

