import { API_URL } from '~/constants/env'

/**
 * Mineradio 兼容层：/api/audio?url=<上游音频地址>
 * 它的前端统一经此代理拉音频流（防 CORS）。我们只放行自己后端的流接口（防 SSRF），
 * Range/Content-Length/Content-Range 原样透传，seek 语义不受损。
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get('url') || ''
  if (!target.startsWith(`${API_URL}/music/stream/`)) {
    return new Response('forbidden upstream', { status: 403 })
  }
  const range = req.headers.get('range')
  const up = await fetch(target, {
    headers: range ? { range } : undefined,
    cache: 'no-store',
  })
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  })
  for (const k of ['content-type', 'content-length', 'content-range']) {
    const v = up.headers.get(k)
    if (v) headers.set(k, v)
  }
  return new Response(up.body, { status: up.status, headers })
}
