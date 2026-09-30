import { API_URL } from '~/constants/env'

/**
 * Mineradio 兼容层：/api/song/url?id=<trackId>&quality=...
 * 它的前端拿 data.url 作为播放地址——直接指向我们 NestJS 的流接口
 * （本地文件 res.sendFile，网易源实时 302 解析，每次请求都是新地址）
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const id = sp.get('id') || ''
  if (!id) return Response.json({ error: 'missing id', url: '' }, { status: 400 })
  return Response.json({
    url: `${API_URL}/music/stream/${id}`,
    // 回显请求音质：前端用 resolved===requested 判定「音质降级」，回显即不误报
    level: sp.get('quality') || 'exhigh',
    source: 'our-backend',
    sourceMatch: true,
    loggedIn: false,
    freeTrialInfo: null,
  })
}
