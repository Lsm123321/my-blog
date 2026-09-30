import { API_URL } from '~/constants/env'

/**
 * Mineradio 兼容层：/api/search?keywords=&limit=&offset=
 * 数据源 = 我们后台歌单（name/artist/album 关键词过滤），不再搜网易云。
 * 歌曲形状对齐它 server.js 的 mapSongRecord（artist/album 扁平字符串、cover 字段）。
 */
export const dynamic = 'force-dynamic'

type Track = {
  id: string
  name: string
  artist: string
  album: string
  cover: string
}

const HOTLINK = /(music\.126\.net|gtimg\.cn|imgcache\.qq\.com)/

const mapSong = (t: Track) => {
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
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const kw = (sp.get('keywords') || '').trim().toLowerCase()
  const limit = Math.min(50, Math.max(1, Number(sp.get('limit')) || 20))
  const offset = Math.max(0, Number(sp.get('offset')) || 0)
  try {
    const res = await fetch(`${API_URL}/music/playlist`, { cache: 'no-store' })
    const json = (await res.json()) as { data?: Track[] }
    const all = json.data || []
    const filtered = kw
      ? all.filter(
          (t) =>
            t.name.toLowerCase().includes(kw) ||
            t.artist.toLowerCase().includes(kw) ||
            t.album.toLowerCase().includes(kw),
        )
      : all
    const page = filtered.slice(offset, offset + limit).map(mapSong)
    return Response.json({
      songs: page,
      offset,
      limit,
      nextOffset: offset + page.length,
      hasMore: offset + page.length < filtered.length,
    })
  } catch {
    return Response.json({ songs: [], offset, limit, hasMore: false })
  }
}
