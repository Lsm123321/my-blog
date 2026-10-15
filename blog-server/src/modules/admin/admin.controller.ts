import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import type { Request } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname, join } from 'path'
import { randomBytes } from 'crypto'

import { AdminAuthService } from './admin-auth.service'
import { AdminGuard } from './admin.guard'
import { AiService } from '../ai/ai.service'
import { Public } from './public.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { paginate, pageArgs } from '../../shared/pagination'
import { toPostModel, toNoteModel, toPageModel, toCommentModel } from '../../shared/mapper'

// 全部管理端点需要登录；登录端点本身除外
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AdminAuthService,
    private readonly ai: AiService,
  ) {}

  // ---- 概览统计（Dashboard 数据源） ----
  @Get('stats')
  async stats() {
    const [
      posts, notes, pages, comments, says, recentlies, links, projects, music,
      postRead, noteRead,
    ] = await Promise.all([
      this.prisma.post.count(),
      this.prisma.note.count(),
      this.prisma.page.count(),
      this.prisma.comment.count(),
      this.prisma.say.count(),
      this.prisma.recently.count(),
      this.prisma.link.count(),
      this.prisma.project.count(),
      this.prisma.musicTrack.count(),
      this.prisma.post.aggregate({ _sum: { readCount: true } }),
      this.prisma.note.aggregate({ _sum: { readCount: true } }),
    ])
    return {
      posts, notes, pages, comments, says, recentlies, links, projects, music,
      totalRead: (postRead._sum.readCount || 0) + (noteRead._sum.readCount || 0),
    }
  }

  // ---- AI 摘要 ----
  @Post('posts/:id/ai-summary')
  generateAiSummary(@Param('id') id: string) {
    return this.ai.summarizePost(id)
  }

  // ---- 登录 ----
  @Public()
  @Post('login')
  login(@Body() body: { username?: string; password?: string }, @Req() req: Request) {
    // 限速按 用户名+IP 维度（服务内部处理），反代场景取 x-forwarded-for 首段
    const fwd = req.headers['x-forwarded-for']
    const ip = (typeof fwd === 'string' && fwd ? fwd.split(',')[0].trim() : req.ip) || 'unknown'
    return this.auth.signIn(String(body?.username || ''), String(body?.password || ''), ip)
  }

  // ---- 修改密码（旧 token 随即全部失效，需重新登录） ----
  @Patch('password')
  async changePassword(@Req() req: Request, @Body() body: { oldPassword?: string; newPassword?: string }) {
    const header: string = req.headers['authorization'] || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    const payload = this.auth.decode(token)
    if (!payload) throw new UnauthorizedException('登录已失效，请重新登录')
    return this.auth.changePassword(
      payload.sub,
      String(body?.oldPassword || ''),
      String(body?.newPassword || ''),
    )
  }

  // ---- 个人信息（头像/昵称/简介/邮箱/链接/社交） ----
  // 单管理员系统，owner 表只有一行；读改都围绕它
  @Get('profile')
  async getProfile() {
    const owner = await this.prisma.owner.findFirst()
    if (!owner) throw new BadRequestException('站点尚未初始化（缺少 owner 记录）')
    let socialIds: Record<string, string> = {}
    try { socialIds = JSON.parse(owner.socialIds || '{}') } catch { /* 历史脏数据按空处理 */ }
    return {
      id: owner.id,
      name: owner.name,
      username: owner.username,
      introduce: owner.introduce,
      mail: owner.mail,
      url: owner.url,
      avatar: owner.avatar,
      socialIds,
    }
  }

  @Put('profile')
  async updateProfile(
    @Body()
    body: {
      name?: string; introduce?: string; mail?: string
      url?: string; avatar?: string; socialIds?: Record<string, string>
    },
  ) {
    const owner = await this.prisma.owner.findFirst()
    if (!owner) throw new BadRequestException('站点尚未初始化（缺少 owner 记录）')

    // 与前台 Shiro 展示字段对齐：逐字段截断，防止超长输入把聚合接口撑爆
    const clamp = (v: unknown, n: number) => String(v ?? '').slice(0, n)
    const data: Record<string, unknown> = {
      modified: new Date(),
    }
    if (body.name !== undefined) data.name = clamp(body.name, 40) || owner.name
    if (body.introduce !== undefined) data.introduce = clamp(body.introduce, 300)
    if (body.mail !== undefined) data.mail = clamp(body.mail, 120)
    if (body.url !== undefined) data.url = clamp(body.url, 200)
    if (body.avatar !== undefined) data.avatar = clamp(body.avatar, 500)
    if (body.socialIds !== undefined) {
      // 只收 github 等白名单键的字符串值，防止任意 JSON 注入
      const allowed = ['github', 'gitee', 'twitter', 'x', 'bilibili', 'zhihu', 'juejin', 'email']
      const src = body.socialIds && typeof body.socialIds === 'object' ? body.socialIds : {}
      const clean: Record<string, string> = {}
      for (const k of allowed) {
        const v = String(src[k] ?? '').trim().slice(0, 80)
        if (v) clean[k] = v
      }
      data.socialIds = JSON.stringify(clean)
    }

    await this.prisma.owner.update({ where: { id: owner.id }, data })
    return this.getProfile()
  }

  // ---- 文章 ----
  @Get('posts')
  async listPosts(@Query() query: Record<string, any>) {
    const { page, size, skip, take } = pageArgs(query, 20)
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        orderBy: { created: 'desc' },
        skip,
        take,
        include: { category: true, tags: { include: { tag: true } } },
      }),
      this.prisma.post.count(),
    ])
    return paginate(rows.map((r) => toPostModel(r)), total, page, size)
  }

  @Get('posts/:id')
  async getPost(@Param('id') id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { category: true, tags: { include: { tag: true } } },
    })
    if (!post) return null
    return { ...toPostModel(post), categoryId: post.categoryId }
  }

  @Post('posts')
  async createPost(@Body() body: Record<string, any>) {
    const { categoryId, tags = [], ...data } = body
    const post = await this.prisma.post.create({
      data: {
        title: String(data.title || '未命名'),
        slug: String(data.slug || this.slugify(data.title)),
        text: String(data.text || ''),
        summary: data.summary || null,
        pin: !!data.pin,
        categoryId: String(categoryId),
        tags: {
          create: (tags as string[]).map((name) => ({
            tag: {
              connectOrCreate: {
                where: { name },
                create: { name, slug: `tag-${name}` },
              },
            },
          })),
        },
      },
    })
    return post
  }

  @Put('posts/:id')
  async updatePost(@Param('id') id: string, @Body() body: Record<string, any>) {
    const { categoryId, tags, ...data } = body
    const updateData: Record<string, any> = {
      title: data.title,
      slug: data.slug,
      text: data.text,
      summary: data.summary,
      pin: !!data.pin,
      modified: new Date(),
    }
    if (categoryId) updateData.categoryId = String(categoryId)
    if (Array.isArray(tags)) {
      // 标签全量替换
      await this.prisma.postTag.deleteMany({ where: { postId: id } })
      updateData.tags = {
        create: (tags as string[]).map((name) => ({
          tag: {
            connectOrCreate: {
              where: { name },
              create: { name, slug: `tag-${name}` },
            },
          },
        })),
      }
    }
    return this.prisma.post.update({ where: { id }, data: updateData })
  }

  @Delete('posts/:id')
  deletePost(@Param('id') id: string) {
    return this.prisma.post.delete({ where: { id } })
  }

  // ---- 分类 ----
  @Get('categories')
  listCategories() {
    return this.prisma.category.findMany({ orderBy: { created: 'asc' } })
  }

  @Post('categories')
  createCategory(@Body() body: { name?: string; slug?: string }) {
    return this.prisma.category.create({
      data: { name: String(body.name), slug: String(body.slug || this.slugify(body.name)) },
    })
  }

  // ---- 手记 ----
  @Get('notes')
  async listNotes(@Query() query: Record<string, any>) {
    const { page, size, skip, take } = pageArgs(query, 20)
    const [rows, total] = await Promise.all([
      this.prisma.note.findMany({ orderBy: { nid: 'desc' }, skip, take }),
      this.prisma.note.count(),
    ])
    return paginate(rows.map((r) => toNoteModel(r)), total, page, size)
  }

  @Get('notes/:id')
  async getNote(@Param('id') id: string) {
    const note = await this.prisma.note.findUnique({ where: { id } })
    if (!note) return null
    // 后台编辑要回显专栏挂载，多带一个 topicId
    return { ...toNoteModel(note, { withPassword: true }), topicId: note.topicId }
  }

  @Post('notes')
  async createNote(@Body() body: Record<string, any>) {
    // nid 自增：取当前最大 +1
    const last = await this.prisma.note.findFirst({ orderBy: { nid: 'desc' } })
    return this.prisma.note.create({
      data: {
        nid: (last?.nid ?? 0) + 1,
        title: String(body.title || '未命名手记'),
        text: String(body.text || ''),
        summary: body.summary || null,
        mood: body.mood || null,
        weather: body.weather || null,
        bookmark: !!body.bookmark,
        password: body.password || null,
        // 专栏挂载：空串/未传视为不挂载
        topicId: body.topicId ? String(body.topicId) : null,
      },
    })
  }

  @Put('notes/:id')
  updateNote(@Param('id') id: string, @Body() body: Record<string, any>) {
    const { id: _omit, nid: _nid, ...data } = body
    // topicId 单独处理：空串要落库成 null（取消挂载），直接展开会把空串写进外键报错
    const { topicId, ...rest } = data
    return this.prisma.note.update({
      where: { id },
      data: {
        ...rest,
        topicId: topicId ? String(topicId) : null,
        modified: new Date(),
      },
    })
  }

  @Delete('notes/:id')
  deleteNote(@Param('id') id: string) {
    return this.prisma.note.delete({ where: { id } })
  }

  // ---- 手记专栏（前台 /notes/series 页数据源） ----
  // 列表带 _count 统计每个专栏下手记数量，删除专栏时自动把它名下手记摘出来（topicId 置空）
  @Get('topics')
  async listTopics() {
    const rows = await this.prisma.topic.findMany({
      orderBy: { created: 'desc' },
      include: { _count: { select: { notes: true } } },
    })
    return rows.map((t) => ({ ...t, noteCount: t._count.notes, _count: undefined }))
  }

  @Post('topics')
  async createTopic(@Body() body: Record<string, any>) {
    const name = String(body.name || '').trim()
    if (!name) throw new BadRequestException('专栏名称不能为空')
    // slug 冲突直接报错：slug 是前台 URL 标识，静默改写会让已分享的链接 404
    const slug = String(body.slug || this.slugify(name))
    const exists = await this.prisma.topic.findUnique({ where: { slug } })
    if (exists) throw new BadRequestException(`slug「${slug}」已被占用`)
    return this.prisma.topic.create({
      data: {
        name,
        slug,
        introduce: String(body.introduce || ''),
        description: body.description || null,
        icon: body.icon || null,
      },
    })
  }

  @Put('topics/:id')
  async updateTopic(@Param('id') id: string, @Body() body: Record<string, any>) {
    const data: Record<string, any> = {}
    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.introduce !== undefined) data.introduce = String(body.introduce || '')
    if (body.description !== undefined) data.description = body.description || null
    if (body.icon !== undefined) data.icon = body.icon || null
    if (body.slug !== undefined && String(body.slug).trim()) {
      const slug = String(body.slug).trim()
      const exists = await this.prisma.topic.findFirst({ where: { slug, id: { not: id } } })
      if (exists) throw new BadRequestException(`slug「${slug}」已被占用`)
      data.slug = slug
    }
    return this.prisma.topic.update({ where: { id }, data })
  }

  @Delete('topics/:id')
  async deleteTopic(@Param('id') id: string) {
    // 先把手记的挂载关系摘除再删专栏，避免孤儿 topicId
    await this.prisma.note.updateMany({ where: { topicId: id }, data: { topicId: null } })
    return this.prisma.topic.delete({ where: { id } })
  }

  // ---- 自定义页 ----
  @Get('pages')
  listPages() {
    return this.prisma.page.findMany({ orderBy: { order: 'asc' } })
  }

  @Post('pages')
  createPage(@Body() body: Record<string, any>) {
    return this.prisma.page.create({
      data: {
        title: String(body.title || '未命名页面'),
        slug: String(body.slug || this.slugify(body.title)),
        subtitle: body.subtitle || null,
        text: String(body.text || ''),
        order: Number(body.order) || 0,
      },
    })
  }

  @Put('pages/:id')
  updatePage(@Param('id') id: string, @Body() body: Record<string, any>) {
    const { id: _omit, ...data } = body
    return this.prisma.page.update({ where: { id }, data: { ...data, modified: new Date() } })
  }

  @Delete('pages/:id')
  deletePage(@Param('id') id: string) {
    return this.prisma.page.delete({ where: { id } })
  }

  // ---- 一言 ----
  // 管理后台前端统一按 { data } 分页结构取数，返回前必须用 paginate 包一层
  @Get('says')
  async listSays(@Query() query: Record<string, any>) {
    const { page, size, skip, take } = pageArgs(query, 50)
    const [rows, total] = await Promise.all([
      this.prisma.say.findMany({ orderBy: { created: 'desc' }, skip, take }),
      this.prisma.say.count(),
    ])
    return paginate(rows, total, page, size)
  }

  @Post('says')
  createSay(@Body() body: Record<string, any>) {
    return this.prisma.say.create({
      data: { text: String(body.text || ''), source: body.source || null, author: body.author || null },
    })
  }

  @Delete('says/:id')
  deleteSay(@Param('id') id: string) {
    return this.prisma.say.delete({ where: { id } })
  }

  // ---- 思考 ----
  @Get('recentlies')
  async listRecentlies(@Query() query: Record<string, any>) {
    const { page, size, skip, take } = pageArgs(query, 50)
    const [rows, total] = await Promise.all([
      this.prisma.recently.findMany({ orderBy: { created: 'desc' }, skip, take }),
      this.prisma.recently.count(),
    ])
    return paginate(rows, total, page, size)
  }

  @Post('recentlies')
  createRecently(@Body() body: Record<string, any>) {
    return this.prisma.recently.create({
      data: { content: String(body.content || ''), type: String(body.type || 'text') },
    })
  }

  @Delete('recentlies/:id')
  deleteRecently(@Param('id') id: string) {
    return this.prisma.recently.delete({ where: { id } })
  }

  // ---- 友链 ----
  // 保持全量返回（后台一次全展示），只包成统一分页结构；size 传 0 会算出 NaN，兜底为 1
  @Get('links')
  async listLinks() {
    const rows = await this.prisma.link.findMany({ orderBy: { created: 'desc' } })
    return paginate(rows, rows.length, 1, Math.max(rows.length, 1))
  }

  @Post('links')
  createLink(@Body() body: Record<string, any>) {
    return this.prisma.link.create({
      data: {
        name: String(body.name || ''),
        url: String(body.url || ''),
        avatar: body.avatar || '',
        description: body.description || '',
        email: body.email || '',
      },
    })
  }

  @Delete('links/:id')
  deleteLink(@Param('id') id: string) {
    return this.prisma.link.delete({ where: { id } })
  }

  // 友链审核：申请入库为 state=1（待审核），通过改 0 即在友链页展示；hide 为拉黑隐藏
  @Patch('links/:id')
  updateLink(@Param('id') id: string, @Body() body: Record<string, any>) {
    const data: Record<string, any> = {}
    if (body.state !== undefined) data.state = Number(body.state) === 1 ? 1 : 0
    if (body.hide !== undefined) data.hide = !!body.hide
    return this.prisma.link.update({ where: { id }, data })
  }

  // ---- 项目 ----
  @Get('projects')
  async listProjects() {
    const rows = await this.prisma.project.findMany({ orderBy: { created: 'desc' } })
    return paginate(rows, rows.length, 1, Math.max(rows.length, 1))
  }

  @Post('projects')
  createProject(@Body() body: Record<string, any>) {
    return this.prisma.project.create({
      data: {
        name: String(body.name || ''),
        description: String(body.description || ''),
        text: String(body.text || ''),
        projectUrl: body.projectUrl || null,
        docUrl: body.docUrl || null,
        previewUrl: body.previewUrl || null,
        images: JSON.stringify(body.images || []),
      },
    })
  }

  @Put('projects/:id')
  updateProject(@Param('id') id: string, @Body() body: Record<string, any>) {
    const { id: _omit, ...data } = body
    if (data.images && !Array.isArray(data.images)) data.images = JSON.stringify(data.images)
    return this.prisma.project.update({ where: { id }, data })
  }

  @Delete('projects/:id')
  deleteProject(@Param('id') id: string) {
    return this.prisma.project.delete({ where: { id } })
  }

  // ---- 评论管理 ----
  @Get('comments')
  async listComments(@Query() query: Record<string, any>) {
    const { page, size, skip, take } = pageArgs(query, 20)
    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({ orderBy: { created: 'desc' }, skip, take }),
      this.prisma.comment.count(),
    ])
    return paginate(rows.map((r) => toCommentModel(r)), total, page, size)
  }

  @Patch('comments/:id/pin')
  pinComment(@Param('id') id: string, @Body() body: { pin?: boolean }) {
    return this.prisma.comment.update({ where: { id }, data: { pin: !!body?.pin } })
  }

  @Delete('comments/:id')
  deleteComment(@Param('id') id: string) {
    return this.prisma.comment.delete({ where: { id } })
  }

  // ---- 图片上传 ----
  // 扩展名白名单：图片/音频/常用附件。刻意排除 html/svg 等可执行文档，
  // 防止上传后在 /uploads/ 同源加载执行脚本（配合 main.ts 的 CSP 沙箱头双保险）
  private static readonly UPLOAD_EXTS = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.ico',
    '.mp3', '.flac', '.m4a', '.ogg', '.wav', '.aac',
    '.mp4', '.webm', '.mov',
    '.pdf', '.txt', '.md', '.zip',
  ])

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        // 存到项目 uploads/ 目录，main.ts 里静态服务对外
        destination: join(process.cwd(), 'uploads'),
        filename: (_req, file, cb) => {
          // 随机文件名 + 原扩展名，避免重名与路径注入
          const ext = extname(file.originalname).toLowerCase().slice(0, 10)
          cb(null, `${Date.now()}-${randomBytes(4).toString('hex')}${ext}`)
        },
      }),
      limits: { fileSize: 100 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase()
        if (!AdminController.UPLOAD_EXTS.has(ext)) {
          // 抛 HttpException 才能被 Nest 异常过滤器转成 400 + 中文提示（普通 Error 会变 500）
          return cb(
            new BadRequestException(`不支持的文件类型：${ext || '(无扩展名)'}，仅允许图片/音频/常见附件`),
            false,
          )
        }
        cb(null, true)
      },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { ok: false, message: '未收到文件' }
    return {
      ok: true,
      url: `/uploads/${file.filename}`,
      size: file.size,
      name: file.originalname,
    }
  }

  // 中文/特殊字符 → 短横线 slug
  private slugify(input: any): string {
    return String(input || '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || `post-${Date.now()}`
  }
}
