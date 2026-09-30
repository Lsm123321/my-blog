import { Injectable } from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'
import { toCategoryModel } from '../../shared/mapper'

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  // 首页「最近发生的事」动态流：四类活动各取最近 5 条合并返回
  async getRecentActivities() {
    // 只看最近 30 天的新发布，太久远的动态没有展示价值
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    const [comments, recentlies, posts, notes] = await Promise.all([
      this.prisma.comment.findMany({
        orderBy: { created: 'desc' },
        take: 5,
      }),
      this.prisma.recently.findMany({ orderBy: { created: 'desc' }, take: 5 }),
      this.prisma.post.findMany({
        where: { created: { gte: since } },
        orderBy: { created: 'desc' },
        take: 5,
        include: { category: true },
      }),
      this.prisma.note.findMany({
        where: { created: { gte: since } },
        orderBy: { created: 'desc' },
        take: 5,
      }),
    ])

    // 评论动态回填目标标题/链接
    const commentActivities: {
      created: Date
      author: string
      text: string
      id: string
      title: string
      slug?: string
      nid?: number
      type: string
      avatar: string
    }[] = []
    for (const c of comments) {
      const target = await this.resolveCommentTarget(c.refType, c.ref)
      if (!target) continue
      commentActivities.push({
        created: c.created,
        author: c.author,
        text: c.text,
        id: c.id,
        title: target.title,
        slug: target.slug,
        nid: target.nid,
        type: c.refType,
        avatar: c.avatar,
      })
    }

    return {
      like: [],
      comment: commentActivities,
      recent: recentlies.map((r) => ({
        id: r.id,
        content: r.content,
        up: r.up,
        down: r.down,
        created: r.created,
      })),
      post: posts.map((p) => ({
        id: p.id,
        created: p.created,
        title: p.title,
        modified: p.modified,
        slug: p.slug,
      })),
      note: notes.map((n) => ({
        id: n.id,
        created: n.created,
        title: n.title,
        modified: n.modified,
        nid: n.nid,
      })),
    }
  }

  // 首页热力图/年度回顾数据：最近一年发布的文章和手记
  async getLastYearPublication() {
    const since = new Date(Date.now() - 365 * 24 * 3600 * 1000)
    const [posts, notes] = await Promise.all([
      this.prisma.post.findMany({
        where: { created: { gte: since } },
        orderBy: { created: 'desc' },
        include: { category: true },
      }),
      this.prisma.note.findMany({
        where: { created: { gte: since } },
        orderBy: { created: 'desc' },
      }),
    ])

    return {
      posts: posts.map((p) => ({
        id: p.id,
        created: p.created,
        title: p.title,
        slug: p.slug,
        categoryId: p.categoryId,
        category: toCategoryModel(p.category),
      })),
      notes: notes.map((n) => ({
        id: n.id,
        created: n.created,
        title: n.title,
        mood: n.mood ?? '',
        weather: n.weather ?? '',
        nid: n.nid,
        bookmark: n.bookmark,
      })),
    }
  }

  // 点赞：直接自增不记访客，个人博客场景防刷意义不大，够用
  async like(type: string, id: string) {
    if (type === 'post') {
      await this.prisma.post.update({ where: { id }, data: { likeCount: { increment: 1 } } })
    } else if (type === 'note') {
      await this.prisma.note.update({ where: { id }, data: { likeCount: { increment: 1 } } })
    }
    return {}
  }

  // mx-space 前端会请求 /rooms 渲染"在线房间"，本站没有聊天室，返回空结构占位避免前端报错
  getRooms() {
    return {
      rooms: [],
      roomCount: {},
      objects: { posts: [], notes: [], pages: [] },
    }
  }

  // 评论是多态关联（refType 指向 posts/notes/pages/recentlies），逐类查回目标标题用于动态展示
  private async resolveCommentTarget(
    refType: string,
    ref: string,
  ): Promise<{ title: string; slug?: string; nid?: number } | null> {
    switch (refType) {
      case 'posts': {
        const p = await this.prisma.post.findUnique({
          where: { id: ref },
          include: { category: true },
        })
        return p ? { title: p.title, slug: `${p.category.slug}/${p.slug}` } : null
      }
      case 'notes': {
        const n = await this.prisma.note.findUnique({ where: { id: ref } })
        return n ? { title: n.title, nid: n.nid } : null
      }
      case 'pages': {
        const pg = await this.prisma.page.findUnique({ where: { id: ref } })
        return pg ? { title: pg.title, slug: pg.slug } : null
      }
      case 'recentlies': {
        const r = await this.prisma.recently.findUnique({ where: { id: ref } })
        return r ? { title: r.content.slice(0, 30) } : null
      }
      default:
        return null
    }
  }
}
