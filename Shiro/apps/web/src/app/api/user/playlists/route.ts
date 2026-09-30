import { API_URL } from '~/constants/env'

/**
 * Mineradio 兼容层：/api/user/playlists（音乐库面板「我的歌单」页签数据源）
 * 本项目无平台账户，恒返回一个歌单：博客音乐库（id=our-library）。
 */
export const dynamic = 'force-dynamic'

type Track = { id: string; name: string; artist: string; album: string; cover: string }

const HOTLINK = /(music\.126\.net|gtimg\.cn|imgcache\.qq\.com)/

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const limit = Math.max(1, Number(sp.get('limit')) || 48)
  const offset = Math.max(0, Number(sp.get('offset')) || 0)
  try {
    const res = await fetch(`${API_URL}/music/playlist`, { cache: 'no-store' })
    const json = (await res.json()) as { data?: Track[] }
    const count = (json.data || []).length
    const firstCover = (json.data || []).find((t) => t.cover)?.cover || ''
    const cover =
      firstCover && HOTLINK.test(firstCover)
        ? `${API_URL}/music/cover?url=${encodeURIComponent(firstCover)}`
        : firstCover
    const playlist = {
      provider: 'netease',
      source: 'netease',
      type: 'playlist',
      id: 'our-library',
      name: '博客音乐库',
      cover,
      trackCount: count,
      playCount: 0,
      creator: '站长',
      subscribed: false,
    }
    // 分页契约：只有一页
    const page = offset === 0 ? [playlist] : []
    return Response.json({
      loggedIn: true,
      userId: 'our',
      playlists: page.slice(0, limit),
      total: 1,
      offset,
      limit,
      nextOffset: offset + page.length,
      hasMore: false,
      partial: true,
    })
  } catch {
    return Response.json({ loggedIn: false, playlists: [] })
  }
}
