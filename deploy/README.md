# 部署指南（单台 Linux 服务器 + Docker Compose + Caddy 自动 HTTPS）

## 架构

```
用户 ──HTTPS──▶ Caddy(:80/:443, 自动证书)
                 ├─ /api/v2/*  ──▶ blog-server:2333 (NestJS + SQLite)
                 ├─ /uploads/* ──▶ blog-server:2333
                 ├─ /admin*    ──▶ blog-server:2333
                 ├─ /avatar.png──▶ blog-server:2333
                 └─ 其余        ──▶ web:2323 (Next.js standalone)
```

同域反代的好处：前端 API 走相对路径 `/api/v2`，没有 CORS、没有 mixed-content、
HTTP/HTTPS 自动适配，`NEXT_PUBLIC_API_URL` 在构建期写死为相对值即可。

## 部署步骤

### 1. 服务器准备
- 一台 Linux 服务器（1C2G 起步），安装 Docker + Docker Compose 插件
- 域名 A 记录解析到服务器 IP（不买域名见文末「无域名部署」）

### 2. 上传代码
把 `smart_pro13/` 下的 `Shiro/`、`blog-server/`、`deploy/` 三个目录传到服务器
（或推到私有 git 仓库后 clone）。

### 3. 配置
```bash
cd deploy
cp .env.production.example .env
vi .env   # 改 WEB_URL 为你的域名；生成并填入 JWT_SECRET
```

### 4. 构建并启动
```bash
docker compose up -d --build
```
首次构建约 5-10 分钟（前端要装依赖+构建+下载字体）。

### 5. 初始化验证
```bash
# 后端首次启动会自动建库、建管理员（密码在日志里，或由 SEED_OWNER_PASSWORD 指定）
docker compose logs server | grep 密码
curl https://your-domain.com/api/v2/aggregate   # 应返回站点 JSON
```
浏览器打开 `https://your-domain.com` 验证前台；
`https://your-domain.com/admin` 进入管理后台（admin / 你的密码）。

### 6. 部署后必做
- [ ] 登录管理后台 → 用 Prisma Studio 或直接改库把 admin 密码换掉
      （服务器上：`docker compose exec server npx prisma studio` 不便时可直接
       `docker compose exec server node -e "...update owner..."`，或先在本地改好库再传）
- [ ] 发一篇测试文章、传一张图，确认 `/uploads` 持久化生效
- [ ] 备份：定期拷贝 `server_data` 卷里的 `dev.db`（所有文章评论都在这一个文件）

## 数据在哪（重要）

| 数据 | 位置 | 备份方式 |
|---|---|---|
| 文章/评论/配置 | docker 卷 `server_data`（SQLite dev.db） | 拷文件即备份 |
| 上传的图片/音频 | docker 卷 `server_uploads` | 拷目录即备份 |
| HTTPS 证书 | docker 卷 `caddy_data` | 无需备份（自动续期） |

## 无域名部署（仅 IP 访问）

把 Caddyfile 第一行 `your-domain.com` 改成 `:80`，`.env` 里
`WEB_URL=http://服务器IP`，其余不变。缺点：无 HTTPS，管理后台明文传输，
建议尽快上域名。

## 常见问题

- **构建时字体下载失败**（上游 Dockerfile 会从 GitHub 拉字体）：给 Docker 配代理，
  或提前手动下载 TTF 放构建上下文后注释 wget 步骤
- **改了前端代码**：`docker compose up -d --build web`
- **改了后端代码**：`docker compose up -d --build server`
- **看日志**：`docker compose logs -f web server`
