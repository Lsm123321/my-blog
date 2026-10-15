import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Request, Response } from 'express'
import { tap } from 'rxjs'
import type { Observable } from 'rxjs'

import { EventsService } from './events.service'

/**
 * 后台写操作 → 前台自动刷新的桥。
 *
 * 拦截所有 /admin 的 POST/PUT/PATCH/DELETE：响应成功（< 400）后按 URL 第一段
 * 归类出内容 scope 并广播给前台 SSE 订阅者。前台收到后失效 react-query 缓存
 * 并 router.refresh()——数据层更新，绝不整页 reload，正在播放的音乐不受影响。
 *
 * 排除项（写请求但不产生内容变更）：
 *   login / password   认证类
 *   upload             纯文件上传（入库是后续 addLocal 等接口，届时会广播）
 *   download-zip       打包下载
 */
const EXCLUDED = new Set(['login', 'password', 'upload', 'download-zip'])
// URL 第一段 → 前台内容类别；未列出的（says/recentlies/links/projects）归 misc
const SCOPE_MAP: Record<string, string> = {
  posts: 'posts',
  categories: 'posts',
  notes: 'notes',
  pages: 'pages',
  comments: 'comments',
  music: 'music',
}

@Injectable()
export class AdminBroadcastInterceptor implements NestInterceptor {
  constructor(private readonly events: EventsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()

    // 非后台写请求直接放行（全局拦截器会路过所有请求，先快速短路）
    if (!req.path.startsWith('/api/v2/admin')) return next.handle()
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next.handle()

    const scope = this.scopeOf(req.path)
    if (!scope) return next.handle()

    return next.handle().pipe(
      // 只有无异常地走到响应（HTTP 层状态 < 400）才算变更成功
      tap(() => {
        if (res.statusCode < 400) this.events.broadcast(scope)
      }),
    )
  }

  /** /api/v2/admin/<seg>/... → 内容类别；命中排除项返回 null */
  private scopeOf(path: string): string | null {
    const m = path.match(/^\/api\/v2\/admin\/([a-z-]+)/)
    if (!m) return null
    const seg = m[1]
    if (EXCLUDED.has(seg)) return null
    return SCOPE_MAP[seg] || 'misc'
  }
}
