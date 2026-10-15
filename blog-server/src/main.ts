import 'reflect-metadata'
import { execSync } from 'child_process'
import { createHash, randomBytes } from 'crypto'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as express from 'express'

import { AppModule } from './app.module'
import { PrismaService } from './prisma/prisma.service'
import { hashPassword } from './shared/password'

// 首次启动（数据库无站长）时自动创建，保证部署开箱可用
async function bootstrapOwner(prisma: PrismaService) {
  if ((await prisma.owner.count()) > 0) return
  const username = 'admin'
  // 密码优先取环境变量（部署时注入），否则随机生成并打印到日志
  const password = process.env.SEED_OWNER_PASSWORD || randomBytes(9).toString('hex')
  await prisma.owner.create({
    data: {
      name: process.env.OWNER_NAME || 'Blog Owner',
      username,
      // scrypt 哈希入库，明文只在首次创建时打印一次
      password: hashPassword(password),
      url: process.env.WEB_URL || '',
    },
  })
  if (!process.env.SEED_OWNER_PASSWORD) {
    console.log(`[blog-server] 已创建管理员 ${username}，随机密码: ${password}（请尽快登录后修改）`)
  } else {
    console.log(`[blog-server] 已创建管理员 ${username}（密码来自 SEED_OWNER_PASSWORD）`)
  }
}

// 数据库结构同步：prisma db push 幂等，适合单人博客。
// 但每次启动都跑要拉起 Prisma CLI，冷启动约 2s；这里用「schema 内容 + 库文件路径」的
// 指纹做标记，指纹没变就直接跳过。首次启动、改过 schema.prisma、或换了 DATABASE_URL
// 时才会真正执行 db push，日常启动立省 2 秒。
function syncDatabaseSchema() {
  const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma')
  const fingerprint = createHash('sha256')
    .update(readFileSync(schemaPath))
    .update(process.env.DATABASE_URL || '')
    .digest('hex')
  const markerPath = join(process.cwd(), 'prisma', '.schema-synced')
  if (existsSync(markerPath) && readFileSync(markerPath, 'utf8') === fingerprint) return

  execSync('npx prisma db push --skip-generate', { stdio: 'inherit' })
  writeFileSync(markerPath, fingerprint)
}

async function bootstrap() {
  // JWT 密钥兜底值是公开的，生产环境缺失时必须启动失败而不是静默降级（否则任何人可伪造管理 token）；
  // 同时拦截 .env.production.example 里的占位符，防止照抄忘改
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me')
  ) {
    console.error('[blog-server] 生产环境必须设置 JWT_SECRET（随机长字符串，不能沿用示例占位值），拒绝启动')
    process.exit(1)
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  // CORS 只服务于本地分离开发（前端 localhost:2323 直连后端 2333）；
  // 同域反代部署下浏览器与后端同源，不触发 CORS，这里不放行任意来源
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true)
      cb(null, false)
    },
    credentials: true,
  })
  // mx-space API 全部挂在 /api/v2 前缀下
  app.setGlobalPrefix('api/v2')

  // 上传目录不存在时自动创建（multer 不会自建）
  const uploadsDir = join(process.cwd(), 'uploads')
  mkdirSync(uploadsDir, { recursive: true })
  // 上传文件静态服务：/uploads/<文件名>
  // CSP 沙箱头是纵深防御：即使白名单漏了 html/svg 之类的可执行文档，浏览器也不会执行其脚本；
  // 图片/音频作为子资源加载不受影响
  app.use(
    '/uploads',
    express.static(uploadsDir, {
      maxAge: '30d',
      setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox"),
    }),
  )

  // 内置管理页：/admin → public/admin.html
  app.use('/admin', express.static(join(process.cwd(), 'public'), { index: 'admin.html' }))

  // 站点静态资源（avatar.png / favicon.ico 等）：根路径兜底，未命中则交给 Nest 路由
  app.use(express.static(join(process.cwd(), 'public')))

  app.enableShutdownHooks()

  // 数据库结构同步 + 首次建站（SQLite）
  const prisma = app.get(PrismaService)
  syncDatabaseSchema()
  await bootstrapOwner(prisma)

  const port = Number(process.env.PORT) || 2333
  await app.listen(port)
  console.log(`[blog-server] listening on http://localhost:${port}/api/v2`)
  console.log(`[blog-server] admin page: http://localhost:${port}/admin`)
}

bootstrap()
