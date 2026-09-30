'use client'

import { useEffect } from 'react'

import { API_URL } from '~/constants/env'

/**
 * 音乐页：全屏 iframe 加载 /mineradio/（Mineradio 前端拷贝）。
 *
 * 不能用 portal + mounted 两段式——Fast Refresh 保留 state，HMR 后客户端
 * 直接渲染 portal，和服务器 HTML 树形不一致，会引发 useId 水合错位。
 * 所以保持单节点直渲染，水合面为零。
 *
 * 层叠：Shiro 的 main(z-1) 会困住 iframe，页脚(z-1, DOM 靠后)整体压在上面，
 * effect 里把 main 置 z-auto 让 iframe(z-[5]) 浮到页脚之上、顶栏(z-9)之下。
 * data-api-url 供 iframe 内适配脚本读取后端地址。
 */
export const MusicStageFrame: Component = () => {
  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    const prev = main.style.zIndex
    main.style.zIndex = 'auto'
    return () => {
      main.style.zIndex = prev
    }
  }, [])

  return (
    <iframe
      src="/mineradio/index.html"
      title="沉浸式音乐现场"
      data-api-url={API_URL}
      className="fixed inset-0 z-[5] h-full w-full border-0 bg-black"
      allow="autoplay; fullscreen; encrypted-media"
    />
  )
}
