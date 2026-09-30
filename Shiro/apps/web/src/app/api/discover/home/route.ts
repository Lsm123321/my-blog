import { API_URL } from '~/constants/env'

/**
 * Mineradio 兼容层：/api/discover/home（Home 仪表盘「每日推荐」数据源）
 * 原 server 版依赖网易云登录；本项目无账户体系，恒以「已登录」返回，
 * dailySongs = 我们后台歌单按「当日日期种子」洗牌（每日推荐 = 每天不同顺序），
 * playlists = 我们的博客音乐库歌单。
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

const LIBRARY_PLAYLIST = {
  provider: 'netease',
  source: 'netease',
  type: 'playlist',
  id: 'our-library',
  name: '博客音乐库',
  cover: '',
  trackCount: 0,
  playCount: 0,
  creator: { nickname: '站长' },
}

// 当日日期种子洗牌：同一天顺序稳定，跨天变化（「每日」推荐的语义）
function dailyShuffle<T>(list: T[]): T[] {
  const day = Math.floor(Date.now() / 86400000)
  const out = list.slice()
  let seed = day % 2147483647
  if (seed <= 0) seed += 2147483646
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/music/playlist`, { cache: 'no-store' })
    const json = (await res.json()) as { data?: Track[] }
    const all = json.data || []
    const songs = dailyShuffle(all).map(mapSong)
    return Response.json({
      loggedIn: true,
      user: { userId: 'our', nickname: '站长', avatar: '' },
      dailySongs: songs,
      dailySongTotal: songs.length,
      dailySongsComplete: true,
      // 故意留空：前端 fallback 到 userPlaylists（内置歌单 + 博客音乐库），
      // 使平台推荐弹窗与音乐库面板展示同一份歌单目录
      playlists: [],
      podcasts: [],
      mode: 'member',
      updatedAt: Date.now(),
    })
  } catch {
    return Response.json({
      loggedIn: false,
      user: null,
      dailySongs: [],
      dailySongTotal: 0,
      dailySongsComplete: true,
      playlists: [],
      podcasts: [],
      mode: 'starter',
      updatedAt: Date.now(),
    })
  }
}
