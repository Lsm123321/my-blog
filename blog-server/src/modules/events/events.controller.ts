import { Controller, Sse } from '@nestjs/common'
import { Subject, interval, merge, map, finalize } from 'rxjs'
import type { Observable } from 'rxjs'
import type { MessageEvent } from '@nestjs/common'

import { EventsService } from './events.service'

/**
 * 前台内容更新的 SSE 订阅端点（公开，无需登录）：
 *   GET /api/v2/events
 *
 * 浏览器 EventSource 直连此地址；连接建立后服务端每 25s 发一条心跳
 * （SSE 注释行之外的具名事件不会打扰 onmessage 订阅者），防止中间层
 * 按空闲超时掐断长连接。Caddy/Next 反代均为流式透传，无需额外配置。
 */
@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Sse('events')
  sse(): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>()
    this.events.add(subject)
    // 心跳走具名事件（event: heartbeat），前端只监听默认 message，互不干扰
    const heartbeat = interval(25_000).pipe<MessageEvent>(
      map(() => ({ type: 'heartbeat', data: { ts: Date.now() } })),
    )
    return merge(subject, heartbeat).pipe(
      finalize(() => this.events.remove(subject)), // 客户端断开时清理注册表
    )
  }
}
