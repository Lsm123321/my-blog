import { Controller, Get, Param, Query } from '@nestjs/common'

import { NoteService } from './note.service'

@Controller()
export class NoteController {
  constructor(private readonly service: NoteService) {}

  // 手记分页列表
  @Get('notes')
  getList(@Query() query: Record<string, any>) {
    return this.service.getList(query)
  }

  // 最新手记（/notes 页重定向用）
  @Get('notes/latest')
  getLatest() {
    return this.service.getLatest()
  }

  // 按编号 nid 取手记（对外 URL 形如 /notes/{nid}）
  @Get('notes/nid/:nid')
  getByNid(
    @Param('nid') nid: string,
    @Query('password') password?: string,
  ) {
    return this.service.getByNid(Number(nid), password)
  }

  // 当前手记前后各 n/2 篇（手记页时间线）
  @Get('notes/list/:noteId')
  listAround(
    @Param('noteId') noteId: string,
    @Query('size') size?: string,
  ) {
    return this.service.listAround(noteId, Number(size) || 10)
  }

  // 按数据库 id 取手记（link-card 预览用）
  @Get('notes/:id')
  getById(@Param('id') id: string) {
    return this.service.getById(id)
  }

  // 手记专栏
  @Get('topics/all')
  getAllTopics() {
    return this.service.getAllTopics()
  }

  @Get('topics/slug/:slug')
  getTopicBySlug(@Param('slug') slug: string) {
    return this.service.getTopicBySlug(slug)
  }

  @Get('topics/:topicId')
  getTopicNotes(
    @Param('topicId') topicId: string,
    @Query() query: Record<string, any>,
  ) {
    return this.service.getTopicNotes(topicId, query)
  }
}
