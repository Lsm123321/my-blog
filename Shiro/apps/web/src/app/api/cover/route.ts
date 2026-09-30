import { API_URL } from '~/constants/env'

/**
 * Mineradio 兼容层：/api/cover?url=<图片地址>
 * 它的歌单架/封面管道统一经此代理取图（crossOrigin=anonymous 画进 canvas）。
 * 白名单：网易/QQ 图床 + 我们自己后端的封面代理地址（防 SSRF）。
 */
export const dynamic = 'force-dynamic'

const ALLOW_HOST = /(music\.126\.net|gtimg\.cn|imgcache\.qq\.com)/

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get('url') || ''
  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return new Response('bad url', { status: 400 })
  }
  const allowed =
    parsed.origin === API_URL.replace(/\/$/, '') ||
    parsed.hostname === 'localhost' ||
    ALLOW_HOST.test(parsed.hostname)
  if (!allowed) return new Response('forbidden host', { status: 403 })

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  }
  if (ALLOW_HOST.test(parsed.hostname)) {
    headers.Referer = parsed.hostname.includes('126.net')
      ? 'https://music.163.com/'
      : 'https://y.qq.com/'
  }
  const up = await fetch(target, { headers, cache: 'no-store' })
  if (!up.ok || !up.body) {
    return new Response('cover fetch failed', { status: 404 })
  }
  return new Response(up.body, {
    headers: {
      'Content-Type': up.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=604800',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
