import { API_URL } from '~/constants/env'

/**
 * Mineradio 兼容层：/api/playlist/tracks?id=our-library&limit=&offset=
 * 返回博客音乐库歌单的曲目页。契约：{ tracks, total, hasMore, nextOffset }。
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
  const id = sp.get('id') || ''
  const limit = Math.max(1, Number(sp.get('limit')) || 30)
  const offset = Math.max(0, Number(sp.get('offset')) || 0)
  if (id !== 'our-library') {
    return Response.json({ tracks: [], total: 0, hasMore: false })
  }
  try {
    const res = await fetch(`${API_URL}/music/playlist`, { cache: 'no-store' })
    const json = (await res.json()) as { data?: Track[] }
    const all = (json.data || []).map(mapSong)
    const page = all.slice(offset, offset + limit)
    return Response.json({
      tracks: page,
      total: all.length,
      hasMore: offset + page.length < all.length,
      nextOffset: offset + page.length,
      playlist: { id: 'our-library', name: '博客音乐库', trackCount: all.length },
    })
  } catch {
    return Response.json({ tracks: [], total: 0, hasMore: false })
  }
}
