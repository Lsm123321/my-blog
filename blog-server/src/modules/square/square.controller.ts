import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'

import { SquareService } from './square.service'

@Controller()
export class SquareController {
  constructor(private readonly service: SquareService) {}

  // 一言列表
  @Get('says')
  getSays(@Query() query: Record<string, any>) {
    return this.service.getSays(query)
  }

  // 思考列表（游标分页）
  @Get('recently')
  getRecentlyList(@Query() query: Record<string, any>) {
    return this.service.getRecentlyList(query)
  }

  @Get('recently/:id')
  getRecently(@Param('id') id: string) {
    return this.service.getRecently(id)
  }

  // 思考赞/踩（attitude=0 赞 1 踩）
  @Get('recently/attitude/:id')
  attitude(@Param('id') id: string, @Query('attitude') attitude: string) {
    return this.service.attitude(id, attitude === '1')
  }

  // 友链
  @Get('links/all')
  getAllLinks() {
    return this.service.getAllLinks()
  }

  @Get('links/audit')
  linkAuditStatus() {
    return this.service.linkAuditStatus()
  }

  @Post('links/audit')
  applyLink(@Body() body: Record<string, any>) {
    return this.service.applyLink(body)
  }

  // 项目展示
  @Get('projects/all')
  getAllProjects() {
    return this.service.getAllProjects()
  }

  @Get('projects/:id')
  getProject(@Param('id') id: string) {
    return this.service.getProject(id)
  }
}
