import { Injectable, Logger } from '@nestjs/common'
import { Subject } from 'rxjs'
import type { MessageEvent } from '@nestjs/common'

/**
 * 内容变更广播（SSE）。
 *
 * 后台管理页每次写操作（发文/改手记/收录歌曲/审友链…），拦截器会调
 * broadcast(scope) 把「哪类内容变了」推给所有订阅中的前台页面——前台收到后
 * 失效 react-query 缓存并 router.refresh()，实现免手动刷新。
 * 连接挂在内存 Set 里，进程单实例（单人博客，无横向扩展），断开即清理。
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name)
  private readonly clients = new Set<Subject<MessageEvent>>()

  /** 有多少前台页面正挂在这条事件流上（健康检查/调试用） */
  get clientCount() {
    return this.clients.size
  }

  add(client: Subject<MessageEvent>) {
    this.clients.add(client)
    this.logger.debug(`SSE 客户端接入，当前 ${this.clients.size} 个`)
  }

  remove(client: Subject<MessageEvent>) {
    this.clients.delete(client)
  }

  /** 向所有在线前台页面广播内容变更；scope 为内容类别（posts/notes/music…） */
  broadcast(scope: string) {
    if (!this.clients.size) return
    const payload: MessageEvent = {
      type: 'content-updated',
      data: { scope, ts: Date.now() },
    }
    for (const client of this.clients) client.next(payload)
    this.logger.log(`已广播 content-updated(${scope}) → ${this.clients.size} 个客户端`)
  }
}
