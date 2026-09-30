import { API_URL } from '~/constants/env'

/**
 * Mineradio 兼容层：/api/listen/report（访客听歌上报）
 * 它的听歌统计每播完一首就 POST 一次，payload.song 里有歌曲标识。
 * 我们只接收本后台歌单的曲目（trackId 非纯数字），转发到后端播放排行计数；
 * 旧快照恢复的 netease 数字 id 歌曲直接忽略（它们无法在我们后端解析）。
 */
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      song?: { id?: string; name?: string; artist?: string }
    }
    const song = body?.song || {}
    const id = String(song.id || '')
    // 有效曲目：id 非空且不是纯数字（纯数字 = netease 平台 id，本项目后端无此曲目）
    if (!id || /^\d+$/.test(id)) return Response.json({ ok: false })
    const upstream = await fetch(`${API_URL}/music/play/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: song.name, artist: song.artist }),
      cache: 'no-store',
    })
    return Response.json({ ok: upstream.ok })
  } catch {
    return Response.json({ ok: false })
  }
}
