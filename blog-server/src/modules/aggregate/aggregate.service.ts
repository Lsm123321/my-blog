import { Injectable } from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'
import { toCategoryModel, toNoteModel, toPostModel, toSayModel } from '../../shared/mapper'

@Injectable()
export class AggregateService {
  constructor(private readonly prisma: PrismaService) {}

  private webUrl() {
    return process.env.WEB_URL || 'http://localhost:2323'
  }

  // 站点 KV 配置读取
  async getSetting<T>(key: string): Promise<T | null> {
    const row = await this.prisma.setting.findUnique({ where: { key } })
    if (!row) return null
    try {
      return JSON.parse(row.value) as T
    } catch {
      return null
    }
  }

  // Shiro 首屏聚合数据：站点信息 + 分类 + 页面导航 + SEO 配置，前端所有页面都先请求它
  async getAggregateRoot() {
    const [owner, categories, pages, latestNote, seoSetting, themeSetting] =
      await Promise.all([
      this.prisma.owner.findFirst(),
      this.prisma.category.findMany({
        where: { type: 0 },
        include: { _count: { select: { posts: true } } },
      }),
      this.prisma.page.findMany({ orderBy: { order: 'asc' } }),
      this.prisma.note.findFirst({ orderBy: { nid: 'desc' } }),
      this.getSetting<SeoSetting>('seo'),
      this.getSetting<Record<string, any>>('theme'),
    ])

    const webUrl = this.webUrl()

    return {
      // theme 配置：Shiro 前端会与默认主题 deepMerge（favicon/页脚/强调色等）
      ...(themeSetting ? { theme: themeSetting } : {}),
      user: owner
        ? {
            id: owner.id,
            name: owner.name,
            username: owner.username,
            introduce: owner.introduce,
            mail: owner.mail,
            url: owner.url,
            avatar: owner.avatar,
            socialIds: this.safeParseJSON(owner.socialIds, {}),
            created: owner.created,
            modified: owner.modified,
            v: 0,
            lastLoginTime: owner.modified,
            postID: '',
          }
        : {
            id: 'owner',
            name: 'Blog Owner',
            username: 'admin',
            introduce: '',
            mail: '',
            url: webUrl,
            avatar: '',
            socialIds: {},
            created: new Date(),
            modified: new Date(),
            v: 0,
            lastLoginTime: new Date(),
            postID: '',
          },
      seo: {
        title: seoSetting?.title ?? owner?.name ?? 'Blog',
        description: seoSetting?.description ?? '',
        icon: seoSetting?.icon ?? '/favicon.ico',
        keywords: seoSetting?.keywords ?? [],
      },
      url: {
        webUrl,
        adminUrl: `${webUrl}/admin`,
        serverUrl: webUrl,
        wsUrl: '',
      },
      categories: categories.map((c) => toCategoryModel(c, c._count.posts)),
      pageMeta: pages.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        order: p.order,
      })),
      latestNoteId: latestNote
        ? { id: latestNote.id, nid: latestNote.nid }
        : { id: '', nid: 0 },
    }
  }

  // 首页「最近更新」三栏数据：文章按置顶优先，和手记/一言一起取最新 size 条
  async getTop(size: number) {
    const [posts, notes, says] = await Promise.all([
      this.prisma.post.findMany({
        orderBy: [{ pin: 'desc' }, { pinOrder: 'asc' }, { created: 'desc' }],
        take: size,
        include: { category: true, tags: { include: { tag: true } } },
      }),
      this.prisma.note.findMany({ orderBy: { nid: 'desc' }, take: size }),
      this.prisma.say.findMany({ orderBy: { created: 'desc' }, take: size }),
    ])

    return {
      posts: posts.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        created: p.created,
        categoryId: p.categoryId,
        category: toCategoryModel(p.category),
        images: [],
      })),
      notes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        created: n.created,
        nid: n.nid,
        images: [],
      })),
      says: says.map((s) => toSayModel(s)),
    }
  }

  // 时光机页面：文章+手记混排的时间线，type 区分只看哪类，year 支持按年归档筛选
  async getTimeline(type?: number, year?: number) {
    const createdFilter = this.yearFilter(year)
    const wantPosts = type === undefined || type === 0
    const wantNotes = type === undefined || type === 1

    const [posts, notes] = await Promise.all([
      wantPosts
        ? this.prisma.post.findMany({
            where: createdFilter,
            orderBy: { created: 'desc' },
            include: { category: true },
          })
        : Promise.resolve([]),
      wantNotes
        ? this.prisma.note.findMany({ where: createdFilter, orderBy: { nid: 'desc' } })
        : Promise.resolve([]),
    ])

    // 前端消费格式为 {data: TimelineData}
    return {
      data: {
        posts: wantPosts
          ? posts.map((p) => ({
              id: p.id,
              title: p.title,
              slug: p.slug,
              created: p.created,
              modified: p.modified,
              category: toCategoryModel(p.category),
              categoryId: p.categoryId,
              url: `/posts/${p.category.slug}/${p.slug}`,
            }))
          : undefined,
        notes: wantNotes
          ? notes.map((n) => ({
              id: n.id,
              nid: n.nid,
              title: n.title,
              weather: n.weather,
              mood: n.mood,
              created: n.created,
              modified: n.modified,
              bookmark: n.bookmark,
            }))
          : undefined,
      },
    }
  }

  // RSS 数据源：文章 + 手记按时间合并，link 为绝对 URL（前端直接用作 <a href>）
  async getFeed() {
    const owner = await this.prisma.owner.findFirst()
    const [posts, notes] = await Promise.all([
      this.prisma.post.findMany({
        orderBy: { created: 'desc' },
        take: 20,
        include: { category: true },
      }),
      this.prisma.note.findMany({ orderBy: { created: 'desc' }, take: 20 }),
    ])

    const webUrl = this.webUrl()
    const postItems = posts.map((p) => ({
      created: p.created,
      modified: p.modified,
      link: `${webUrl}/posts/${p.category.slug}/${p.slug}`,
      title: p.title,
      text: p.text,
      id: p.id,
      images: [],
    }))
    const noteItems = notes.map((n) => ({
      created: n.created,
      modified: n.modified,
      link: `${webUrl}/notes/${n.nid}`,
      title: n.title,
      text: n.text,
      id: n.id,
      images: [],
    }))

    const data = [...postItems, ...noteItems].sort(
      (a, b) => b.created.getTime() - a.created.getTime(),
    )

    return {
      title: owner?.name ?? 'Blog',
      url: webUrl,
      author: owner?.name ?? 'Blog Owner',
      description: '',
      data,
    }
  }

  // sitemap 数据源：全量文章/手记/页面，改动手记用 modified 才能及时通知搜索引擎
  async getSitemap() {
    const [posts, notes, pages] = await Promise.all([
      this.prisma.post.findMany({ include: { category: true } }),
      this.prisma.note.findMany(),
      this.prisma.page.findMany(),
    ])
    const webUrl = this.webUrl()

    const items: { url: string; published_at?: Date | null }[] = [
      ...posts.map((p) => ({
        url: `${webUrl}/posts/${p.category.slug}/${p.slug}`,
        published_at: p.modified ?? p.created,
      })),
      ...notes.map((n) => ({
        url: `${webUrl}/notes/${n.nid}`,
        published_at: n.modified ?? n.created,
      })),
      ...pages.map((p) => ({
        url: `${webUrl}/${p.slug}`,
        published_at: p.modified ?? p.created,
      })),
    ]

    return { data: items }
  }

  private yearFilter(year?: number) {
    if (!year) return undefined
    const start = new Date(`${year}-01-01T00:00:00.000Z`)
    const end = new Date(`${year + 1}-01-01T00:00:00.000Z`)
    return { created: { gte: start, lt: end } }
  }

  private safeParseJSON<T>(raw: string, fallback: T): T {
    try {
      return JSON.parse(raw || '') ?? fallback
    } catch {
      return fallback
    }
  }
}

interface SeoSetting {
  title?: string
  description?: string
  icon?: string
  keywords?: string[]
}