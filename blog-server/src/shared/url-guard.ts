// 音乐外链安全校验：服务端 302 跳转前必须过这道闸
// 只放行已知音乐域名的 http/https 地址，防止上游响应被污染后把用户引去任意/内网地址（SSRF）
const ALLOWED_HOST_RE = [/^(.+\.)?qq\.com$/, /^(.+\.)?music\.126\.net$/, /^music\.163\.com$/]

// 常见内网/环回地址段直接拒绝（域名白名单本身已挡住 IP 字面量，这里是双保险）
const PRIVATE_HOST_RE =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i

export function isSafeMusicUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const host = u.hostname.toLowerCase()
    if (PRIVATE_HOST_RE.test(host)) return false
    return ALLOWED_HOST_RE.some((re) => re.test(host))
  } catch {
    return false
  }
}
