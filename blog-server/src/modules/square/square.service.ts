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

  // 是否开放友链自助申请（前端据此显示申请表单或"禁止"提示）
  linkAuditStatus() {
    return { can: true }
  }

  // 游客申请友链：入库为待审核（state=1），管理后台审核通过后改为 state=0 展示
  async applyLink(body: Record<string, any>) {
    const name = String(body?.name || '').trim()
    const url = String(body?.url || '').trim()
    const avatar = String(body?.avatar || '').trim()
    const email = String(body?.email || '').trim()
    const description = String(body?.description || '').trim()
    if (!name || !url || !avatar || !description) {
      throw new BadRequestException('站名、链接、头像、描述为必填项')
    }
    if (!/^https:\/\//.test(url) || !/^https:\/\//.test(avatar)) {
      throw new BadRequestException('链接与头像必须为 https 地址')
    }
    // 同站重复申请拦截：待审核或已展示的都算，防止刷表单
    const exists = await this.prisma.link.findFirst({
      where: { url: { equals: url.replace(/\/$/, '') } },
    })
    if (exists) {
      throw new BadRequestException(
        exists.state === 1 ? '该链接已在审核中，请耐心等待' : '该链接已在友链列表中',
      )
    }
    await this.prisma.link.create({
      data: {
        name: name.slice(0, 20),
        url: url.slice(0, 200),
        avatar: avatar.slice(0, 200),
        email: email.slice(0, 100),
        description: description.slice(0, 50),
        state: 1, // 待审核
      },
    })
    // code=1 与前端 toast 约定一致（申请成功提示）
    return { code: 1 }
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
