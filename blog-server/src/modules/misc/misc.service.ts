import { Injectable } from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'

const SITE_LIKE_KEY = 'site_like'

@Injectable()
export class MiscService {
  constructor(private readonly prisma: PrismaService) {}

  // type='read' 时给文章/手记阅读数 +1
  async ack(body: Record<string, any>) {
    if (body?.type !== 'read') return {}
    const payload = body.payload || {}
    const { type, id } = payload as { type?: string; id?: string }
    if (!id) return {}

    if (type === 'post') {
      await this.prisma.post
        .update({ where: { id }, data: { readCount: { increment: 1 } } })
        .catch(() => null)
    } else if (type === 'note') {
      await this.prisma.note
        .update({ where: { id }, data: { readCount: { increment: 1 } } })
        .catch(() => null)
    }
    return {}
  }

  // 全站点赞 = 内容点赞总数 + 独立计数器
  async getSiteLikes() {
    const [postLikes, noteLikes] = await Promise.all([
      this.prisma.post.aggregate({ _sum: { likeCount: true } }),
      this.prisma.note.aggregate({ _sum: { likeCount: true } }),
    ])
    const extra = await this.getSettingNumber(SITE_LIKE_KEY)
    return (postLikes._sum.likeCount ?? 0) + (noteLikes._sum.likeCount ?? 0) + extra
  }

  async addSiteLike() {
    const next = (await this.getSettingNumber(SITE_LIKE_KEY)) + 1
    await this.prisma.setting.upsert({
      where: { key: SITE_LIKE_KEY },
      create: { key: SITE_LIKE_KEY, value: String(next) },
      update: { value: String(next) },
    })
    return this.getSiteLikes()
  }

  // 旧版全站搜索（文章+手记一起出）。后台搜索面板用的是 /search/posts，这个保留给兼容调用
  async search(keyword: string) {
    const kw = keyword.trim()
    if (!kw) return { data: [] }

    const contains = { contains: kw }
    const [posts, notes] = await Promise.all([
      this.prisma.post.findMany({
        where: { OR: [{ title: contains }, { text: contains }, { summary: contains }] },
        take: 20,
        include: { category: true },
      }),
      this.prisma.note.findMany({
        where: { OR: [{ title: contains }, { text: contains }] },
        take: 20,
      }),
    ])

    return {
      data: [
        ...posts.map((p) => ({
          type: 'post',
          id: p.id,
          title: p.title,
          slug: p.slug,
          category: { id: p.category.id, name: p.category.name, slug: p.category.slug },
        })),
        ...notes.map((n) => ({
          type: 'note',
          id: n.id,
          title: n.title,
          nid: n.nid,
        })),
      ],
    }
  }

  private async getSettingNumber(key: string): Promise<number> {
    const row = await this.prisma.setting.findUnique({ where: { key } })
    const n = Number(row?.value)
    return Number.isFinite(n) ? n : 0
  }
}
