import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common'
import type { Request } from 'express'

import { CommentService } from './comment.service'

@Controller('comments')
export class CommentController {
  constructor(private readonly service: CommentService) {}

  // 某内容（文章/手记/页面/思考）下的评论分页列表
  @Get('ref/:refId')
  getByRef(@Param('refId') refId: string, @Query() query: Record<string, any>) {
    return this.service.getByRef(refId, query)
  }

  // 楼中楼：某根评论的回复列表（游标分页）
  @Get('thread/:rootCommentId')
  getThread(
    @Param('rootCommentId') rootCommentId: string,
    @Query('cursor') cursor?: string,
    @Query('size') size?: string,
  ) {
    return this.service.getThread(rootCommentId, cursor, Number(size) || 10)
  }

  // 游客发表评论
  @Post(':refId')
  create(
    @Param('refId') refId: string,
    @Body() body: Record<string, any>,
    @Req() req: Request,
  ) {
    return this.service.create(refId, body, req)
  }

  // 游客回复评论
  @Post('reply/:commentId')
  reply(
    @Param('commentId') commentId: string,
    @Body() body: Record<string, any>,
    @Req() req: Request,
  ) {
    return this.service.reply(commentId, body, req)
  }
}
