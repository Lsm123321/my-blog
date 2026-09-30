/**
 * Mineradio 兼容兜底：它前端的 100+ 端点里，我们只实现了核心播放链路
 * （/api/song/url、/api/lyric、/api/search、/api/our/playlist）。
 * 其余（多平台登录/收藏/评论/播客/天气…）统一返回空对象——
 * 前端对这些字段都有 falsy 容错（未登录/不可用分支），避免启动流程卡死。
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ ok: true, disabled: 'not-available-in-our-backend' })
}

export async function POST() {
  return Response.json({ ok: true, disabled: 'not-available-in-our-backend' })
}
