import { Controller, Get, Query } from '@nestjs/common'

import { AggregateService } from './aggregate.service'

@Controller('aggregate')
export class AggregateController {
  constructor(private readonly service: AggregateService) {}

  // 全站硬依赖接口：站点信息 + 主题配置
  @Get()
  getAggregate(@Query('theme') _theme?: string) {
    return this.service.getAggregateRoot()
  }

  // 首页最新内容
  @Get('top')
  getTop(@Query('size') size?: string) {
    return this.service.getTop(Number(size) || 5)
  }

  // 时间线：type=0 文章 / type=1 手记
  @Get('timeline')
  getTimeline(
    @Query('type') type?: string,
    @Query('year') year?: string,
    @Query('sort') sort?: string,
  ) {
    return this.service.getTimeline(
      type === undefined || type === '' ? undefined : Number(type),
      year ? Number(year) : undefined,
    )
  }

  // RSS 数据源
  @Get('feed')
  getFeed() {
    return this.service.getFeed()
  }

  // sitemap 数据源
  @Get('sitemap')
  getSitemap() {
    return this.service.getSitemap()
  }
}
