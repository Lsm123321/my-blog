import { API_URL } from '~/constants/env'

// Mineradio 前端引导脚本用：把 NestJS 后台歌单映射成它 server.js mapSongRecord 的
// 规范形状（artist/album 是扁平字符串、封面字段为 cover——形状错会导致卡片显示
// [object Object] 与队列面板异常）
export const dynamic = 'force-dynamic'

type Track = {
  id: string
  name: string
  artist: string
  album: string
  cover: string
}

const HOTLINK = /(music\.126\.net|gtimg\.cn|imgcache\.qq\.com)/

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/music/playlist`, { cache: 'no-store' })
    const json = (await res.json()) as { data?: Track[] }
    const list = json.data || []
    return Response.json(
      list.map((t) => {
        const artist = t.artist || '未知歌手'
        const cover =
          t.cover && HOTLINK.test(t.cover)
            ? `${API_URL}/music/cover?url=${encodeURIComponent(t.cover)}`
            : t.cover
        return {
          provider: 'netease',
          source: 'netease',
          type: 'song',
          id: t.id,
          name: t.name,
          artist,
          artists: [{ id: '', name: artist }],
          album: t.album || '',
          cover,
          duration: 0,
        }
      }),
    )
  } catch {
    return Response.json([])
  }
}
