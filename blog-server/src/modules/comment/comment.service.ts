import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Request } from 'express'

import { PrismaService } from '../../prisma/prisma.service'
import { paginate, pageArgs } from '../../shared/pagination'
import { avatarFor, toCommentModel } from '../../shared/mapper'

const REF_TYPES = ['posts', 'notes', 'pages', 'recentlies'] as const
type RefType = (typeof REF_TYPES)[number]

// 前端传的 refId 是裸内容 id（也可能带 `type:` 前缀），按 id 反查归属确定 refType
@Injectable()
export class CommentService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveRef(rawRefId: string): Promise<{ refType: RefType; ref: string }> {
    const id = String(rawRefId).includes(':')
      ? String(rawRefId).slice(String(rawRefId).indexOf(':') + 1)
      : String(rawRefId)
    if (!id) throw new BadRequestException(`无效的评论目标: ${rawRefId}`)

    const [post, note, page, recently] = await Promise.all([
      this.prisma.post.findUnique({ where: { id } }),
      this.prisma.note.findUnique({ where: { id } }),
      this.prisma.page.findUnique({ where: { id } }),
      this.prisma.recently.findUnique({ where: { id } }),
    ])
    if (post) return { refType: 'posts', ref: id }
    if (note) return { refType: 'notes', ref: id }
    if (page) return { refType: 'pages', ref: id }
    if (recently) return { refType: 'recentlies', ref: id }
    throw new NotFoundException(`评论目标不存在: ${id}`)
  }

  async getByRef(rawRefId: string, query: Record<string, any>) {
    const { ref } = await this.resolveRef(rawRefId)
    const { page, size, skip, take } = pageArgs(query, 10)

    const where = { ref, parentCommentId: null, isWhispers: false }
    const [roots, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: [{ pin: 'desc' }, { created: 'desc' }],
        skip,
        take,
      }),
      this.prisma.comment.count({ where }),
    ])

    // 根评论的回复一并带出（replyWindow threshold 放宽为 size*2，够个人博客用）
    const rootIds = roots.map((r) => r.id)
    const replies = rootIds.length
      ? await this.prisma.comment.findMany({
          where: { rootCommentId: { in: rootIds }, isWhispers: false },
          orderBy: { created: 'asc' },
        })
      : []

    const data = roots.map((root) => {
      const children = replies.filter((c) => c.rootCommentId === root.id)
      return {
        ...toCommentModel(root),
        replyCount: children.length,
        latestReplyAt: children.length
          ? children[children.length - 1].created
          : null,
        replies: children.map((c) => toCommentModel(c)),
        replyWindow: {
          total: children.length,
          returned: children.length,
          threshold: size * 2,
          hasHidden: false,
          hiddenCount: 0,
        },
      }
    })

    return paginate(data, total, page, size)
  }

  // 楼中楼分页：游标用最后一条的 created，前端"查看更多回复"往下翻
  async getThread(rootCommentId: string, cursor?: string, size = 10) {
    const root = await this.prisma.comment.findUnique({ where: { id: rootCommentId } })
    if (!root) throw new NotFoundException('评论不存在')

    const where = {
      rootCommentId,
      isWhispers: false,
      ...(cursor ? { created: { gt: new Date(cursor) } } : {}),
    }
    const replies = await this.prisma.comment.findMany({
      where,
      orderBy: { created: 'asc' },
      take: size,
    })

    const total = await this.prisma.comment.count({
      where: { rootCommentId, isWhispers: false },
    })
    const returned = replies.length
    const last = replies[replies.length - 1]

    return {
      replies: replies.map((c) => toCommentModel(c)),
      nextCursor: last ? last.created.toISOString() : undefined,
      remaining: Math.max(total - returned, 0),
      done: !last || total <= returned,
    }
  }

  async create(rawRefId: string, body: Record<string, any>, req: Request) {
    const { refType, ref } = await this.resolveRef(rawRefId)
    this.assertContent(body)

    const comment = await this.prisma.comment.create({
      data: {
        refType,
        ref,
        author: String(body.author).slice(0, 40),
        mail: body.mail ? String(body.mail).slice(0, 100) : null,
        url: body.url ? String(body.url).slice(0, 200) : null,
        text: String(body.text).slice(0, 2000),
        avatar: body.avatar || avatarFor(body.mail),
        source: body.source ? String(body.source).slice(0, 200) : null,
        isWhispers: !!body.isWhispers,
        ip: this.clientIp(req),
        agent: (req.headers['user-agent'] as string) || null,
      },
    })
    return toCommentModel(comment)
  }

  async reply(commentId: string, body: Record<string, any>, req: Request) {
    const parent = await this.prisma.comment.findUnique({ where: { id: commentId } })
    if (!parent) throw new NotFoundException('回复的评论不存在')
    this.assertContent(body)

    const comment = await this.prisma.comment.create({
      data: {
        refType: parent.refType,
        ref: parent.ref,
        author: String(body.author).slice(0, 40),
        mail: body.mail ? String(body.mail).slice(0, 100) : null,
        url: body.url ? String(body.url).slice(0, 200) : null,
        text: String(body.text).slice(0, 2000),
        avatar: body.avatar || avatarFor(body.mail),
        source: body.source ? String(body.source).slice(0, 200) : null,
        parentCommentId: parent.id,
        rootCommentId: parent.rootCommentId || parent.id,
        ip: this.clientIp(req),
        agent: (req.headers['user-agent'] as string) || null,
      },
    })
    return toCommentModel(comment)
  }

  // 每个字段都截断上限：游客输入是不可信的，防超长内容刷库
  private assertContent(body: Record<string, any>) {
    if (!body?.text || !String(body.text).trim()) {
      throw new BadRequestException('评论内容不能为空')
    }
    if (!body?.author || !String(body.author).trim()) {
      throw new BadRequestException('请填写昵称')
    }
  }

  // Nginx 等反代会把真实 IP 放在 x-forwarded-for，取第一个（最原始的客户端）
  private clientIp(req: Request): string | null {
    const fwd = req.headers['x-forwarded-for']
    if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim()
    return req.ip ?? null
  }
}
