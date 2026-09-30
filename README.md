# 个人博客系统（Shiro 定制前端 + 自研 NestJS 后端）

一个数据完全自持的个人博客：前端基于开源主题 [Shiro](https://github.com/Innei/Shiro) 深度定制，后端是从零写的 NestJS + Prisma + SQLite 服务（模拟 mx-space API 协议，不依赖 mx-space 官方服务端），并自带一个纯手写的管理后台。内置音乐播放子系统、全站搜索、文章 AI 摘要等功能。

---

## 借鉴与自研说明

> 本项目站在多个开源项目的肩膀上完成。哪些是借鉴、哪些是自己写的，下面说清楚。

### 借鉴的部分

| 来源 | 许可证 | 借鉴了什么 |
|---|---|---|
| [Innei/Shiro](https://github.com/Innei/Shiro) | AGPL-3.0 | **前端基座**。整体架构（Next.js App Router、jotai 状态管理、组件库、暗色模式）、文章/手记/时光机/思考/友链/项目等页面的框架与样式、TOC 目录、评论 UI、划词评论、Markdown 渲染管线均来自上游主题，本项目在其上做定制（见下文自研清单） |
| [mx-space](https://github.com/mx-space/mx-space) | AGPL-3.0 | **API 协议设计**。后端响应结构（aggregate 聚合、PaginateResult 分页、模型字段命名）对齐 mx-space 官方 API，因此 Shiro 前端可以几乎零改动接入自建后端 |
| 网易云音乐接口逆向方案（社区公开成果，如 [Suxiaoqinx/Netease_url](https://github.com/Suxiaoqinx/Netease_url)、XHBlogs 等） | — | **接口思路**：eapi 请求加密参数的拼装方式（固定 AES 密钥 + md5 摘要，属网易云客户端公开常识）、歌曲/歌单/专辑/歌词公开接口的选型、伪装请求头方案。加密请求的实现代码为本项目自己编写 |
| [Suxiaoqinx/tencent_url](https://github.com/Suxiaoqinx/tencent_url) | MIT | **QQ 音乐接口选型思路**：歌曲信息/歌词免登录接口、播放地址 vkey 接口的行为（VIP 限制、Cookie 解锁） |
| [VDitor](https://www.npmjs.com/package/vditor)（b3log 出品） | MIT | 管理后台的 Markdown 编辑器组件（CDN 引入），上传回调等集成代码自写 |
| [智谱 GLM](https://open.bigmodel.cn) | 商用 API | AI 摘要的模型能力（glm-4-flash），提示词与调用链路自写 |
| [Cravatar](https://cravatar.cn) | 服务 | 评论头像的 Gravatar 国内镜像 |

技术栈层面同样受益于开源生态：Next.js、React、NestJS、Prisma、Tailwind CSS、jotai、motion（framer-motion）、TanStack Query 等。

### 自研的部分

**一、blog-server 后端（全部从零编写，约 3800 行 TypeScript）**

- 12 个业务模块：aggregate（首屏聚合/时间线/RSS/sitemap）、activity（动态流/热力图/点赞）、post、note（含专栏）、page、comment（多态评论 + 楼中楼游标分页）、square（一言/思考/友链/项目）、misc（阅读计数/全站点赞）、search（全站搜索）、music、ai（GLM 摘要）、admin（管理后台全部接口 + JWT 守卫）
- 多态评论模型：一套评论系统通吃文章/手记/页面/思考四种内容
- 音乐子系统的服务端：网易云 eapi 加密请求实现、8 档音质阶梯降级、批量收录前逐首预检播放源（并发 8/批）、歌词懒加载自愈、单曲/批量 zip 流式下载、封面代理（Referer 伪造 + 域名白名单防 SSRF）
- 安全设计：JWT 管理端鉴权、音乐外链域名白名单、163cn.tv 短链跟随限制、游客输入逐字段截断

**二、音乐播放子系统（上游 Shiro 没有此功能，前后端均为新增）**

- 前台 `/music` 沉浸页（Apple Music 风格暗色界面：每日推荐/音乐库/听歌统计/歌词面板）+ 全局迷你播放条，约 1000 行前端代码
- 网易云 / QQ 音乐 / 本地上传三种音源，后台可视化收录面板（搜索、歌单/专辑全量解析、勾选批量收录、重复检测与替换、zip 打包下载）
- 服务端约 1550 行（含上述服务端能力）

**三、管理后台 admin.html（纯手写单页，无前端框架）**

- 概览 Dashboard（站点统计 + 快捷入口）
- VDitor 编辑器集成（工具栏/实时预览/粘贴截图直传管理接口）
- AI 摘要一键生成（调 GLM → 落库 → 前台展示）
- 音乐收录管理面板、内容 CRUD、评论管理

**四、前端定制（相对上游 Shiro 的增量）**

- 全站搜索：`Ctrl/Cmd+K` 命令面板（自写组件）+ 后端搜索接口
- 文章页 AI 摘要卡片（打字机效果组件）
- 修复上游遗留问题：React 渲染期更新 store 的反模式（3 处）、接口分页格式不一致（4 个接口）、jojoo 库渲染期写入（postinstall 补丁脚本）

**五、文档与工程化**

- 功能截图导览、种子数据、一键启停脚本（start.bat / stop.bat）

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16（Turbopack）、React 19、Tailwind CSS、jotai、motion、TanStack Query |
| 后端 | NestJS 11、Prisma 6、SQLite、JWT、Node 原生 fetch |
| 编辑器 | VDitor 3 |
| AI | 智谱 GLM（glm-4-flash） |

## 快速开始

```bat
:: 首次：分别安装依赖
cd blog-server && pnpm install && npx prisma db push && npx prisma db seed && npm run build
cd ../Shiro && pnpm install

:: 日常：项目根目录
start.bat   # 后端 2333 + 前端 2323
stop.bat    # 停止
```

| 入口 | 地址 |
|---|---|
| 博客前台 | http://localhost:2323 |
| 音乐沉浸页 | http://localhost:2323/music |
| 管理后台 | http://localhost:2333/admin |
| 后端 API | http://localhost:2333/api/v2 |

管理后台账号是种子数据里的 owner（用户名 `admin`，密码在首次 seed 时随机生成并打印在终端，或用 `SEED_OWNER_PASSWORD` 环境变量固定）。

## 目录结构

```
smart_pro13/
├── Shiro/            # 前端（fork 自 Innei/Shiro，含本项目的定制增量）
├── blog-server/      # 自研后端（NestJS + Prisma + SQLite）
│   ├── src/modules/  #   12 个业务模块
│   ├── public/       #   管理后台 admin.html
│   └── prisma/       #   数据模型 + 种子数据
└── start.bat / stop.bat
```

## 环境变量（blog-server/.env）

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite 文件路径（默认 file:./dev.db） |
| `JWT_SECRET` | ✅ | 管理后台签发 token 的密钥 |
| `SEED_OWNER_PASSWORD` | 可选 | 固定种子密码 |
| `NETEASE_COOKIE` | 可选 | 网易云登录态：解锁 VIP 歌完整播放与高音质 |
| `QQ_MUSIC_COOKIE` | 可选 | QQ 音乐网页版登录态：解锁搜索、歌词与元数据（注意：腾讯 2025 年起将播放体系迁移至 musics.fcg 的「签名 + 加密请求体 + OGG 流式」封闭方案，第三方已无法解析播放直链——QQ 音源仅保留搜索/歌词/元数据能力，收录播放请改用网易云源搜索同名歌曲） |
| `GLM_API_KEY` | 可选 | 智谱密钥：文章 AI 摘要功能依赖 |
| `GLM_MODEL` | 可选 | 摘要模型（默认 glm-4-flash） |
| `WEB_URL` | 可选 | 前台地址（默认 http://localhost:2323），RSS/sitemap 用 |

## 技术要点

1. **mx-space API 协议模拟**：响应字段与官方对齐，上游前端零改造接入自建后端——理解"协议即边界"的解耦思想
2. **网易云 eapi 接入**：AES-128-ECB + md5 还原官方客户端请求签名，8 档音质阶梯降级，无 Cookie 自动回退试听
3. **收录预检机制**：批量收录前逐首探测真实播放地址（并发分批），下架/无版权歌曲直接拒收，把播放失败拦截在入库前
4. **歌词懒加载自愈**：批量收录的歌不带歌词，首次被播放时向上游补抓并落库
5. **AI 摘要全链路**：后台一键生成 → GLM 摘要落库 → 前台打字机效果呈现
6. **安全实践**：JWT 鉴权、SSRF 域名白名单、短链跟随限制、输入截断
7. **上游缺陷修复**：React 渲染期更新外部 store 的反模式定位与修复（含第三方库补丁方案）

## 许可证说明

本项目前端衍生自 [Shiro](https://github.com/Innei/Shiro)（AGPL-3.0），因此整体以 **AGPL-3.0** 协议开源；后端 `blog-server` 为原创实现，随项目一并开源。网易云音乐、QQ 音乐的接口能力来自各平台公开接口的社区研究成果，仅供个人学习使用，请勿用于商业用途。
