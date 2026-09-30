import { Injectable, NotFoundException } from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'
import { paginate, pageArgs } from '../../shared/pagination'
import { toPageModel } from '../../shared/mapper'

@Injectable()
export class PageService {
  constructor(private readonly prisma: PrismaService) {}

  async getBySlug(slug: string) {
    const page = await this.prisma.page.findUnique({ where: { slug } })
    if (!page) throw new NotFoundException('页面不存在')
    return toPageModel(page)
  }

  async getList(query: Record<string, any>) {
    const { page, size, skip, take } = pageArgs(query)
    const [rows, total] = await Promise.all([
      this.prisma.page.findMany({ orderBy: { order: 'asc' }, skip, take }),
      this.prisma.page.count(),
    ])
    return paginate(rows.map((r) => toPageModel(r)), total, page, size)
  }
}
