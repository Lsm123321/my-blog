import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'
import { paginate, pageArgs } from '../../shared/pagination'
import {
  toLinkModel,
  toProjectModel,
  toRecentlyModel,
  toSayModel,
} from '../../shared/mapper'

@Injectable()
export class SquareService {
  constructor(private readonly prisma: PrismaService) {}

  async getSays(query: Record<string, any>) {
    const { page, size, skip, take } = pageArgs(query, 20)
    const [rows, total] = await Promise.all([
      this.prisma.say.findMany({ orderBy: { created: 'desc' }, skip, take }),
      this.prisma.say.count(),
    ])
    return paginate(rows.map((r) => toSayModel(r)), total, page, size)
  }

  // 游标分页：before=上一页最后一条的 id
  async getRecentlyList(query: Record<string, any>) {
    const size = Math.min(Number(query.size) || 10, 50)
    let before: { created: Date } | null = null
    if (query.before) {
      const anchor = await this.prisma.recently.findUnique({
        where: { id: query.before },
      })
      before = anchor ? { created: anchor.created } : null
    }

    const rows = await this.prisma.recently.findMany({
      where: before ? { created: { lt: before.created } } : undefined,
      orderBy: { created: 'desc' },
      take: size,
    })
    return { data: rows.map((r) => toRecentlyModel(r)) }
  }

  async getRecently(id: string) {
    const row = await this.prisma.recently.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('思考不存在')
    return toRecentlyModel(row)
  }

  async attitude(id: string, isDown: boolean) {
    const row = await this.prisma.recently.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('思考不存在')
    await this.prisma.recently.update({
      where: { id },
      data: isDown ? { down: { increment: 1 } } : { up: { increment: 1 } },
    })
    // code=1 表示计数成功（前端据此弹 toast）
    return { code: 1 }
  }

  async getAllLinks() {
    const rows = await this.prisma.link.findMany({
      where: { hide: false, state: 0 },
      orderBy: { created: 'desc' },
    })
    return { data: rows.map((r) => toLinkModel(r)) }
  }

  // 个人博客先关闭友链自助申请（前端隐藏申请表单）
  linkAuditStatus() {
    return { can: false }
  }

  applyLink() {
    throw new BadRequestException('暂未开放友链申请')
  }

  async getAllProjects() {
    const rows = await this.prisma.project.findMany({ orderBy: { created: 'desc' } })
    return { data: rows.map((r) => toProjectModel(r)) }
  }

  async getProject(id: string) {
    const row = await this.prisma.project.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('项目不存在')
    return toProjectModel(row)
  }
}
