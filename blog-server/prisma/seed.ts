// 初始化演示数据：pnpm db:seed
import { randomBytes } from 'crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const count = await prisma.owner.count()
  if (count > 0) {
    console.log('[seed] 已有数据，跳过（如需重置请删除 prisma/dev.db 后重跑 db:push）')
    return
  }

  // 管理密码不从源码硬编码：优先取环境变量，否则随机生成并打印
  const ownerPassword =
    process.env.SEED_OWNER_PASSWORD || randomBytes(9).toString('hex')

  await prisma.owner.create({
    data: {
      name: '我的博客',
      username: 'admin',
      password: ownerPassword,
      introduce: '一个用代码记录生活的人。',
      mail: 'me@example.com',
      url: 'http://localhost:2323',
      avatar: 'https://cravatar.cn/avatar/00000000000000000000000000000000?d=mp&s=200',
      socialIds: JSON.stringify({ github: 'Lsm123321' }),
    },
  })

  if (!process.env.SEED_OWNER_PASSWORD) {
    console.log(`[seed] 已为 admin 生成随机密码: ${ownerPassword}`)
  }

  await prisma.setting.createMany({
    data: [
      {
        key: 'seo',
        value: JSON.stringify({
          title: '我的博客',
          description: '记录技术与生活的个人博客',
          icon: '/favicon.ico',
          keywords: ['博客', '技术', '生活'],
        }),
      },
    ],
  })

  const tech = await prisma.category.create({
    data: { name: '技术', slug: 'tech' },
  })
  const life = await prisma.category.create({
    data: { name: '生活', slug: 'life' },
  })

  const tagOf = async (name: string) => {
    const slug = `tag-${name}`
    return prisma.tag.upsert({
      where: { slug },
      create: { name, slug },
      update: {},
    })
  }

  const addTags = async (postId: string, names: string[]) => {
    for (const name of names) {
      const tag = await tagOf(name)
      await prisma.postTag.create({ data: { postId, tagId: tag.id } })
    }
  }

  const post1 = await prisma.post.create({
    data: {
      title: 'Hello，这是博客的第一篇文章',
      slug: 'hello-world',
      text: [
        '欢迎来到我的博客！这套博客由 **Shiro** 前端与自建的 **NestJS** 后端组成。',
        '',
        '## 为什么要自建后端？',
        '',
        '- 数据完全掌握在自己手里',
        '- 可以按自己的需求随意扩展',
        '- 学习后端开发的最佳实践',
        '',
        '## 技术栈',
        '',
        '| 层 | 技术 |',
        '| --- | --- |',
        '| 前端 | Next.js 16 + TailwindCSS |',
        '| 后端 | NestJS + Prisma |',
        '| 数据库 | SQLite |',
        '',
        '以后会在这里记录更多内容。',
      ].join('\n'),
      summary: '博客的第一篇文章，介绍这套博客的构成与搭建思路。',
      categoryId: tech.id,
      pin: true,
    },
  })
  await addTags(post1.id, ['随笔', 'NestJS'])

  const post2 = await prisma.post.create({
    data: {
      title: 'Markdown 写作体验示例',
      slug: 'markdown-demo',
      text: [
        '这篇文章用来展示 Markdown 渲染效果。',
        '',
        '## 代码块',
        '',
        '```ts',
        'function greet(name: string) {',
        '  return `Hello, ${name}!`',
        '}',
        '```',
        '',
        '## 列表',
        '',
        '- 无序列表项',
        '- 另一个列表项',
        '  1. 嵌套有序列表',
        '  2. 第二项',
        '',
        '## 引用',
        '',
        '> 纸上得来终觉浅，绝知此事要躬行。',
        '',
        '## 链接与图片',
        '',
        '[Shiro 项目地址](https://github.com/Innei/Shiro)',
        '',
        '## 表格',
        '',
        '| 语法 | 说明 |',
        '| --- | --- |',
        '| `#` | 标题 |',
        '| `>` | 引用 |',
      ].join('\n'),
      summary: '展示 Markdown 各种语法的渲染效果。',
      categoryId: tech.id,
    },
  })
  await addTags(post2.id, ['Markdown'])

  const post3 = await prisma.post.create({
    data: {
      title: '周末去了趟公园',
      slug: 'weekend-park',
      text: [
        '天气不错，去公园走了走。',
        '',
        '生活不只有代码，还有阳光、微风和一杯冰美式。',
      ].join('\n'),
      summary: '记录一个普通的周末下午。',
      categoryId: life.id,
    },
  })
  await addTags(post3.id, ['生活'])

  await prisma.note.createMany({
    data: [
      {
        nid: 1,
        title: '第一篇手记：开始记录',
        text: '这是手记（Notes），适合写更私人的日记式内容。',
        mood: '😊',
        weather: '☀️ 晴',
        summary: '开始用手记记录日常。',
      },
      {
        nid: 2,
        title: '深夜折腾服务器的感想',
        text: '凌晨两点还在看日志，但跑通的那一刻一切都值了。',
        mood: '😴',
        weather: '🌙',
        bookmark: true,
      },
    ],
  })

  await prisma.page.create({
    data: {
      title: '关于本站',
      slug: 'about-site',
      order: 0,
      text: [
        '# 关于本站',
        '',
        '本站是一个个人技术博客，前端基于开源项目 [Shiro](https://github.com/Innei/Shiro)（AGPL-3.0），后端为自建的 NestJS 服务。',
        '',
        '- 前端：Next.js 16 + TailwindCSS v4',
        '- 后端：NestJS + Prisma + SQLite',
        '- 部署：Docker',
      ].join('\n'),
    },
  })
  await prisma.page.create({
    data: {
      title: '关于我',
      slug: 'about-me',
      order: 1,
      text: [
        '# 关于我',
        '',
        '你好，我是一名开发者。',
        '',
        '## 技能',
        '',
        '- TypeScript / Node.js',
        '- React / Next.js',
        '- 数据库与后端架构',
        '',
        '## 联系方式',
        '',
        '邮箱：me@example.com',
      ].join('\n'),
    },
  })
  const messagePage = await prisma.page.create({
    data: {
      title: '留言板',
      slug: 'message',
      order: 2,
      text: '欢迎在这里留下你的足迹！',
    },
  })

  const post1Row = await prisma.post.findUnique({ where: { slug: 'hello-world' } })
  if (post1Row) {
    const c1 = await prisma.comment.create({
      data: {
        refType: 'posts',
        ref: post1Row.id,
        author: '路人甲',
        mail: 'someone@example.com',
        text: '第一篇文章，前来祝贺！🎉',
        avatar: 'https://cravatar.cn/avatar/205e460b479e2e5b48aec07710c08d50?d=mp&s=160',
      },
    })
    await prisma.comment.create({
      data: {
        refType: 'posts',
        ref: post1Row.id,
        author: '我的博客',
        mail: 'me@example.com',
        text: '@路人甲 谢谢支持！',
        avatar: 'https://cravatar.cn/avatar/00000000000000000000000000000000?d=mp&s=160',
        parentCommentId: c1.id,
        rootCommentId: c1.id,
      },
    })
  }
  await prisma.comment.create({
    data: {
      refType: 'pages',
      ref: messagePage.id,
      author: '游客',
      text: '签到！',
      avatar: 'https://cravatar.cn/avatar/205e460b479e2e5b48aec07710c08d50?d=mp&s=160',
    },
  })

  await prisma.say.createMany({
    data: [
      { text: '纸上得来终觉浅，绝知此事要躬行。', author: '陆游' },
      { text: 'Talk is cheap. Show me the code.', author: 'Linus Torvalds' },
    ],
  })

  await prisma.recently.createMany({
    data: [
      { content: '博客正式开张了 🎉', type: 'text', up: 1 },
      { content: '今天调试接口到深夜，终于全绿了。', type: 'text' },
    ],
  })

  await prisma.link.createMany({
    data: [
      {
        name: 'Shiro 官方示例',
        url: 'https://innei.in',
        // GitHub 头像直链，稳定可访问（innei.in/avatar.png 是 404）
        avatar: 'https://github.com/innei.png',
        description: 'Shiro 主题作者的站点',
      },
    ],
  })

  await prisma.project.create({
    data: {
      name: '我的博客',
      description: '基于 Shiro 前端 + 自建 NestJS 后端的个人博客',
      text: '这个项目本身。前端使用 Next.js 16，后端用 NestJS 模拟 mx-space API，数据完全自持。',
        projectUrl: 'https://github.com/Lsm123321/my-blog',
    },
  })

  console.log('[seed] 种子数据写入完成')
  console.log('[seed] 分类 2 / 文章 3 / 手记 2 / 页面 3 / 评论 3 / 一言 2 / 思考 2 / 友链 1 / 项目 1')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
