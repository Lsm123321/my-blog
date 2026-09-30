import { Body, Controller, Get, Post, Query } from '@nestjs/common'

import { MiscService } from './misc.service'

@Controller()
export class MiscController {
  constructor(private readonly service: MiscService) {}

  // 阅读计数上报
  @Post('ack')
  ack(@Body() body: Record<string, any>) {
    return this.service.ack(body)
  }

  // 全站点赞：GET 取数量，POST +1
  @Get('like_this')
  getSiteLikes() {
    return this.service.getSiteLikes()
  }

  @Post('like_this')
  addSiteLike() {
    return this.service.addSiteLike()
  }

  // 校时
  @Get('server-time')
  serverTime() {
    const now = Date.now()
    return { t2: now, t3: Date.now() }
  }

  // 站内搜索
  @Get('search/algolia')
  search(@Query('keyword') keyword: string) {
    return this.service.search(String(keyword || ''))
  }

  // 订阅（未启用邮件服务，返回关闭态）
  @Get('subscribe/status')
  subscribeStatus() {
    return { enable: false }
  }

  @Post('subscribe')
  subscribe() {
    return {}
  }

  // 站长实时状态（未接入 ProcessReporter，返回空态）
  @Get('serverless/shiro/status')
  ownerStatus() {
    return null
  }

  @Get('fn/shiro/status')
  ownerStatusFn() {
    return null
  }

  @Get('options/url')
  optionsUrl() {
    const webUrl = process.env.WEB_URL || 'http://localhost:2323'
    return { data: { adminUrl: `${webUrl}/admin`, webUrl, serverUrl: webUrl, wsUrl: '' } }
  }
}
