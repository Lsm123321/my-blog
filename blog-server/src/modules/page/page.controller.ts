import { Controller, Get, Param, Query } from '@nestjs/common'

import { PageService } from './page.service'

@Controller()
export class PageController {
  constructor(private readonly service: PageService) {}

  // 自定义单页（关于等）
  @Get('pages/slug/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.service.getBySlug(slug)
  }

  @Get('pages')
  getList(@Query() query: Record<string, any>) {
    return this.service.getList(query)
  }
}
