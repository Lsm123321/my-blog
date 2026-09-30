import { Controller, Get, Query } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

// 全站搜索（供 Shiro 前端 Ctrl+K 命令面板调用）
@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  // 关键词搜文章：标题/摘要/正文包含匹配，返回给面板展示的最小字段集
  @Get('posts')
  async searchPosts(@Query('keyword') keyword: string) {
    const kw = String(keyword || '').trim()
    if (!kw) return []
    const rows = await this.prisma.post.findMany({
      where: {
        OR: [
          { title: { contains: kw } },
          { summary: { contains: kw } },
          { text: { contains: kw } },
        ],
      },
      include: { category: { select: { slug: true, name: true } } },
      orderBy: { created: 'desc' },
      take: 20,
    })
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      categorySlug: r.category.slug,
      categoryName: r.category.name,
      // 命中正文时截一段做结果预览
      summary: (r.summary || r.text).slice(0, 80),
      created: r.created,
    }))
  }
}
