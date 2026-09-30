import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'
import { paginate, pageArgs } from '../../shared/pagination'
import { toNoteModel } from '../../shared/mapper'

@Injectable()
export class NoteService {
  constructor(private readonly prisma: PrismaService) {}

  async getList(query: Record<string, any>) {
    const { page, size, skip, take } = pageArgs(query)
    const year = query.year ? Number(query.year) : undefined
    const where = {
      isPublished: true,
      ...(year
        ? {
            created: {
              gte: new Date(`${year}-01-01T00:00:00.000Z`),
              lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
            },
          }
        : {}),
    }
    const [rows, total] = await Promise.all([
      this.prisma.note.findMany({ where, orderBy: { nid: 'desc' }, skip, take }),
      this.prisma.note.count({ where }),
    ])
    return paginate(rows.map((r) => toNoteModel(r)), total, page, size)
  }

  async getLatest() {
    const note = await this.prisma.note.findFirst({ orderBy: { nid: 'desc' } })
    if (!note) throw new NotFoundException('还没有手记')
    return { data: { ...toNoteModel(note), liked: false } }
  }

  async getByNid(nid: number, password?: string) {
    const note = await this.prisma.note.findUnique({ where: { nid } })
    if (!note || !note.isPublished) throw new NotFoundException('手记不存在')

    if (note.password && password !== note.password) {
      // 前端据 401 + password 标记弹出密码输入框
      throw new UnauthorizedException({
        message: '需要密码',
        password: true,
      })
    }

    const [next, prev] = await Promise.all([
      this.prisma.note.findFirst({
        where: { isPublished: true, nid: { lt: nid } },
        orderBy: { nid: 'desc' },
      }),
      this.prisma.note.findFirst({
        where: { isPublished: true, nid: { gt: nid } },
        orderBy: { nid: 'asc' },
      }),
    ])

    return {
      data: { ...toNoteModel(note, { withPassword: true }), liked: false },
      next: next ? toNoteModel(next) : undefined,
      prev: prev ? toNoteModel(prev) : undefined,
    }
  }

  async getById(id: string) {
    const note = await this.prisma.note.findUnique({ where: { id } })
    if (!note) throw new NotFoundException('手记不存在')
    return toNoteModel(note)
  }

  // 手记页侧边时间线：以当前手记为锚点取前后各 size/2 篇
  async listAround(noteId: string, size: number) {
    const anchor = await this.prisma.note.findUnique({ where: { id: noteId } })
    if (!anchor) throw new NotFoundException('手记不存在')

    const half = Math.ceil(size / 2)
    const [before, after] = await Promise.all([
      this.prisma.note.findMany({
        where: { isPublished: true, nid: { lt: anchor.nid } },
        orderBy: { nid: 'desc' },
        take: half,
      }),
      this.prisma.note.findMany({
        where: { isPublished: true, nid: { gt: anchor.nid } },
        orderBy: { nid: 'asc' },
        take: half,
      }),
    ])

    const data = [...before.reverse(), anchor, ...after]
    return { data: data.map((n) => toNoteModel(n)), size }
  }

  async getAllTopics() {
    const topics = await this.prisma.topic.findMany({ orderBy: { created: 'desc' } })
    return { data: topics.map((t) => this.toTopicModel(t)) }
  }

  async getTopicBySlug(slug: string) {
    const topic = await this.prisma.topic.findUnique({ where: { slug } })
    if (!topic) throw new NotFoundException('专栏不存在')
    return this.toTopicModel(topic)
  }

  async getTopicNotes(topicId: string, query: Record<string, any>) {
    const { page, size, skip, take } = pageArgs(query)
    const where = { topicId, isPublished: true }
    const [rows, total] = await Promise.all([
      this.prisma.note.findMany({ where, orderBy: { nid: 'desc' }, skip, take }),
      this.prisma.note.count({ where }),
    ])
    return paginate(rows.map((r) => toNoteModel(r)), total, page, size)
  }

  private toTopicModel(t: {
    id: string
    name: string
    slug: string
    introduce: string
    description: string | null
    icon: string | null
    created: Date
  }) {
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      introduce: t.introduce,
      description: t.description,
      icon: t.icon,
      created: t.created,
    }
  }
}
