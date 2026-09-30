import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { mkdirSync } from 'fs'
import { join } from 'path'
import * as express from 'express'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  // Shiro 前端(dev:2323) 跨域直连后端，需携带 cookie 凭证
  app.enableCors({ origin: true, credentials: true })
  // mx-space API 全部挂在 /api/v2 前缀下
  app.setGlobalPrefix('api/v2')

  // 上传目录不存在时自动创建（multer 不会自建）
  const uploadsDir = join(process.cwd(), 'uploads')
  mkdirSync(uploadsDir, { recursive: true })
  // 上传文件静态服务：/uploads/<文件名>
  app.use('/uploads', express.static(uploadsDir, { maxAge: '30d' }))

  // 内置管理页：/admin → public/admin.html
  app.use('/admin', express.static(join(process.cwd(), 'public'), { index: 'admin.html' }))

  // 站点静态资源（avatar.png / favicon.ico 等）：根路径兜底，未命中则交给 Nest 路由
  app.use(express.static(join(process.cwd(), 'public')))

  app.enableShutdownHooks()

  const port = Number(process.env.PORT) || 2333
  await app.listen(port)
  console.log(`[blog-server] listening on http://localhost:${port}/api/v2`)
  console.log(`[blog-server] admin page: http://localhost:${port}/admin`)
}

bootstrap()
