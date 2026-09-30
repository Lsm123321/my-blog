import { Body, Controller, Get, Post } from '@nestjs/common'

import { ActivityService } from './activity.service'

@Controller('activity')
export class ActivityController {
  constructor(private readonly service: ActivityService) {}

  // 首页最近动态
  @Get('recent')
  getRecent() {
    return this.service.getRecentActivities()
  }

  // 首页近一年发布时间轴
  @Get('last-year/publication')
  getLastYearPublication() {
    return this.service.getLastYearPublication()
  }

  // 文章/手记点赞
  @Post('like')
  like(@Body() body: Record<string, any>) {
    return this.service.like(String(body?.type || ''), String(body?.id || ''))
  }

  // 实时阅读室（无 WebSocket 时返回空态）
  @Get('rooms')
  getRooms() {
    return this.service.getRooms()
  }
}
