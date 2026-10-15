# blog-server 生产镜像（Node 22 + NestJS + SQLite）
FROM node:22-alpine AS builder
WORKDIR /app
# corepack 依据 package.json 的 packageManager 字段固定 pnpm 版本，保证与 lockfile 格式匹配
RUN corepack enable

# 先装依赖（利用层缓存）；frozen-lockfile 保证构建可复现
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 拷源码并构建
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json nest-cli.json ./
RUN pnpm exec prisma generate && pnpm build

# ---- 运行时 ----
FROM node:22-alpine
WORKDIR /app
RUN corepack enable

# 运行时依赖（prisma CLI 在 dependencies：启动时 db push 同步表结构要用，--prod 也会装上）
# schema 必须先于 generate 拷入，否则 prisma generate 找不到 schema 报错
COPY prisma ./prisma
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm exec prisma generate

COPY --from=builder /app/dist ./dist
# 管理页与头像等静态资源
COPY public ./public

ENV NODE_ENV=production
ENV PORT=2333
# SQLite 落在挂卷 /app/prisma 内（compose 挂了 server_data），重启不丢数据
ENV DATABASE_URL=file:/app/prisma/dev.db
EXPOSE 2333

# 数据库与上传目录持久化（由 compose 挂卷）
VOLUME ["/app/prisma", "/app/uploads"]

# db push 由 main.ts 启动时统一执行（本地/容器同一逻辑），这里只负责拉起进程
CMD ["node", "dist/main.js"]
