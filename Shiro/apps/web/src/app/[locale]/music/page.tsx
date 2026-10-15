import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '音乐',
  description: '沉浸式音乐现场',
}

/**
 * 音乐沉浸页：舞台本体已提升为全局常驻的 MineradioStageHost（挂 Root），
 * iframe 不再随本路由卸载——切到其他页面音乐不断播，由全局迷你条遥控。
 * 本页只保留路由入口与元信息，渲染交给 Host。
 */
export default function Page() {
  return null
}
