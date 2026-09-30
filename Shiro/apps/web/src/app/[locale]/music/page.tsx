import type { Metadata } from 'next'

import { MusicStageFrame } from './MusicStageFrame'

export const metadata: Metadata = {
  title: '音乐',
  description: '沉浸式音乐现场',
}

/**
 * 音乐沉浸页：整页加载 Mineradio 前端（public/mineradio，GPL-3.0）。
 * 数据链路全部走本项目后端：歌单/歌词/流由 /api/our/*、/api/song/url、
 * /api/lyric 适配路由对接 NestJS；启动注入见 mineradio/js/ours-bootstrap.js。
 * （此前的自研沉浸页已删除，最后一份存档见 workspace backup/ 之前已由用户确认移除）
 */
export default function Page() {
  return <MusicStageFrame />
}
