import { Injectable, NotFoundException } from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'
import { paginate, pageArgs } from '../../shared/pagination'
import { toCategoryModel, toPostModel } from '../../shared/mapper'

const POST_INCLUDE = {
  category: true,
  tags: { include: { tag: true } },
} as const

@Injectable()
export class PostService {
  constructor(private readonly prisma: PrismaService) {}

  // 文章列表：置顶优先（pin → pinOrder），再按时间倒序；truncate 控制列表页不带全文
  async getList(query: Record<string, any>) {
    const { page, size, skip, take } = pageArgs(query)
    const truncate = Number(query.truncate) || 0
    const year = query.year ? Number(query.year) : undefined

    const where = year
      ? {
          created: {
            gte: new Date(`${year}-01-01T00:00:00.000Z`),
            lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
          },
        }
      : undefined

    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        orderBy: [{ pin: 'desc' }, { pinOrder: 'asc' }, { created: 'desc' }],
        skip,
        take,
        include: POST_INCLUDE,
      }),
      this.prisma.post.count({ where }),
    ])

    return paginate(rows.map((r) => toPostModel(r, { truncate })), total, page, size)
  }

  // 文章详情：slug 全局唯一但访问路径带分类前缀，两个条件都要对上才返回
  async getByCategoryAndSlug(categorySlug: string, slug: string, _password?: string) {
    const post = await this.prisma.post.findFirst({
      where: { slug, category: { slug: categorySlug } },
      include: POST_INCLUDE,
    })
    if (!post) throw new NotFoundException('文章不存在')

    const model = toPostModel(post, { truncate: 0 })
    return { ...model, related: await this.getRelated(post.id, post.categoryId) }
  }

  async getFullUrl(categorySlug: string) {
    const post = await this.prisma.post.findFirst({
      where: { category: { slug: categorySlug } },
      orderBy: { created: 'desc' },
      include: { category: true },
    })
    if (!post) throw new NotFoundException('该分类下没有文章')
    return { path: `/${post.category.slug}/${post.slug}` }
  }

  async getCategories(type?: number) {
    // 标签存放在独立的 Tag 表（type=1 时前端期望 {data: TagModel[]}）
    if (type === 1) {
      const tags = await this.prisma.tag.findMany({
        include: { _count: { select: { posts: true } } },
      })
      return {
        data: tags.map((t) => ({
          id: t.id,
          type: 1,
          name: t.name,
          slug: t.slug,
          count: t._count.posts,
          created: t.created,
        })),
      }
    }

    const where = type === undefined ? undefined : { type }
    const rows = await this.prisma.category.findMany({ where })
    return { data: rows.map((r) => toCategoryModel(r)) }
  }

  async getCategoryDetail(nameOrSlug: string, isTag: boolean) {
    const category = await this.prisma.category.findFirst({
      where: isTag ? { name: nameOrSlug, type: 1 } : { slug: nameOrSlug },
    })
    if (!category) throw new NotFoundException('分类不存在')

    const posts = await this.prisma.post.findMany({
      where: isTag ? { tags: { some: { tag: { name: nameOrSlug } } } } : { categoryId: category.id },
      orderBy: { created: 'desc' },
      include: POST_INCLUDE,
    })

    const entries = {
      [category.slug]: {
        ...toCategoryModel(category, posts.length),
        children: posts.map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          created: p.created,
          modified: p.modified,
        })),
      },
    }
    return { entries }
  }

  // 相关文章：同分类下最新的几篇
  private async getRelated(postId: string, categoryId: string) {
    const rows = await this.prisma.post.findMany({
      where: { categoryId, id: { not: postId } },
      orderBy: { created: 'desc' },
      take: 3,
      include: { category: true },
    })
    return rows.map((r) => {
      const m = toPostModel(r)
      return {
        id: m.id,
        title: m.title,
        slug: m.slug,
        created: m.created,
        modified: m.modified,
        summary: m.summary,
        categoryId: m.categoryId,
        category: m.category,
      }
    })
  }
}
