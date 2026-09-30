import { API_URL } from '~/constants/env'

/**
 * Mineradio 兼容层：/api/lyric?id=<trackId>
 * 契约：{ lyric: LRC文本, tlyric, yrc, ... }（原版 server.js 同名端点形状）
 * 我们后端 /music/lyric/:id 返回 { lrc }，LRC 文本可能内嵌翻译（按需透传）
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return Response.json({ error: 'missing id', lyric: '' }, { status: 400 })
  try {
    const res = await fetch(`${API_URL}/music/lyric/${id}`, { cache: 'no-store' })
    const json = (await res.json()) as { lrc?: string }
    return Response.json({
      lyric: json.lrc || '',
      tlyric: '',
      yrc: '',
      ytlrc: '',
      romalrc: '',
      yromalrc: '',
      source: 'our-backend',
    })
  } catch {
    return Response.json({ lyric: '', tlyric: '', source: 'our-backend' })
  }
}
