import { createHash } from 'crypto'

// Prisma 行 → mx-space API 模型映射
// 响应体直接返回 camelCase JSON（客户端会再做一次 camelcase，幂等）

type Iso<T> = T extends Date ? string : T extends Date | null ? string | null : T

function iso<T>(d: T): Iso<T> {
  return (d instanceof Date ? d.toISOString() : (d as any)) as Iso<T>
}

export function toCategoryModel(
  c: { id: string; type: number; name: string; slug: string; created: Date },
  count = 0,
) {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    slug: c.slug,
    count,
    created: iso(c.created),
  }
}

export type PostRow = {
  id: string
  title: string
  slug: string
  text: string
  summary: string | null
  aiSummary?: string | null
  aiSummaryAt?: Date | null
  copyright: boolean
  pin: boolean
  pinOrder: number
  categoryId: string
  readCount: number
  likeCount: number
  allowComment: boolean
  created: Date
  modified: Date | null
  category: { id: string; type: number; name: string; slug: string; created: Date }
  tags?: { tag: { name: string } }[]
}

export function toPostModel(
  post: PostRow,
  opts: { truncate?: number; categoryCount?: number } = {},
) {
  let text = post.text
  const truncate = opts.truncate
  if (truncate && truncate > 0 && text.length > truncate) {
    text = text.slice(0, truncate)
  }
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    text,
    summary: post.summary ?? (post.text ? post.text.slice(0, 310) : ''),
    aiSummary: post.aiSummary ?? null,
    aiSummaryAt: iso(post.aiSummaryAt ?? null),
    contentFormat: 'markdown' as const,
    copyright: post.copyright,
    tags: post.tags?.map((t) => t.tag.name) ?? [],
    count: { read: post.readCount, like: post.likeCount },
    categoryId: post.categoryId,
    category: toCategoryModel(post.category, opts.categoryCount ?? 0),
    images: [],
    pin: post.pin ? 'pin' : null,
    pinOrder: post.pinOrder,
    allowComment: post.allowComment,
    created: iso(post.created),
    modified: iso(post.modified),
  }
}

export type NoteRow = {
  id: string
  nid: number
  title: string
  text: string
  summary: string | null
  mood: string | null
  weather: string | null
  bookmark: boolean
  isPublished: boolean
  password: string | null
  readCount: number
  likeCount: number
  allowComment: boolean
  created: Date
  modified: Date | null
}

export function toNoteModel(note: NoteRow, opts: { withPassword?: boolean } = {}) {
  return {
    id: note.id,
    nid: note.nid,
    title: note.title,
    text: note.text,
    summary: note.summary ?? '',
    contentFormat: 'markdown' as const,
    mood: note.mood,
    weather: note.weather,
    bookmark: note.bookmark,
    isPublished: note.isPublished,
    // 密码保护手记不回传明文密码
    password: opts.withPassword ? note.password : note.password ? '有密码' : null,
    count: { read: note.readCount, like: note.likeCount },
    images: [],
    allowComment: note.allowComment,
    created: iso(note.created),
    modified: iso(note.modified),
    publicAt: iso(note.created),
  }
}

export function toPageModel(page: {
  id: string
  title: string
  slug: string
  subtitle: string | null
  text: string
  order: number
  type: string
  readCount: number
  allowComment: boolean
  created: Date
  modified: Date | null
}) {
  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    subtitle: page.subtitle,
    text: page.text,
    order: page.order,
    type: page.type,
    contentFormat: 'markdown' as const,
    images: [],
    count: { read: page.readCount },
    allowComment: page.allowComment,
    created: iso(page.created),
    modified: iso(page.modified),
  }
}

export function toCommentModel(c: {
  id: string
  refType: string
  ref: string
  author: string
  mail: string | null
  url: string | null
  text: string
  avatar: string
  pin: boolean
  state: number
  ip: string | null
  agent: string | null
  location: string | null
  source: string | null
  parentCommentId: string | null
  rootCommentId: string | null
  isWhispers: boolean
  created: Date
}) {
  return {
    id: c.id,
    refType: c.refType,
    ref: c.ref,
    state: c.state,
    author: c.author,
    text: c.text,
    mail: c.mail,
    url: c.url,
    avatar: c.avatar,
    pin: c.pin,
    location: c.location,
    source: c.source,
    ip: c.ip,
    agent: c.agent,
    parentCommentId: c.parentCommentId,
    rootCommentId: c.rootCommentId,
    isWhispers: c.isWhispers,
    replyCount: 0,
    created: iso(c.created),
  }
}

export function toSayModel(s: {
  id: string
  text: string
  source: string | null
  author: string | null
  created: Date
}) {
  return {
    id: s.id,
    text: s.text,
    source: s.source,
    author: s.author,
    created: iso(s.created),
  }
}

export function toRecentlyModel(r: {
  id: string
  content: string
  type: string
  up: number
  down: number
  refId: string | null
  refType: string | null
  allowComment: boolean
  created: Date
  modified: Date | null
}) {
  return {
    id: r.id,
    content: r.content,
    type: r.type,
    up: r.up,
    down: r.down,
    refId: r.refId,
    refType: r.refType,
    allowComment: r.allowComment,
    created: iso(r.created),
    modified: iso(r.modified),
  }
}

export function toLinkModel(l: {
  id: string
  name: string
  url: string
  avatar: string
  description: string
  type: number
  state: number
  hide: boolean
  email: string
  created: Date
}) {
  return {
    id: l.id,
    name: l.name,
    url: l.url,
    avatar: l.avatar,
    description: l.description,
    type: l.type,
    state: l.state,
    hide: l.hide,
    email: l.email,
    created: iso(l.created),
  }
}

export function toProjectModel(p: {
  id: string
  name: string
  description: string
  text: string
  previewUrl: string | null
  docUrl: string | null
  projectUrl: string | null
  images: string
  avatar: string | null
  created: Date
}) {
  let images: string[] = []
  try {
    images = JSON.parse(p.images || '[]')
  } catch {
    /* 忽略坏数据 */
  }
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    text: p.text,
    previewUrl: p.previewUrl,
    docUrl: p.docUrl,
    projectUrl: p.projectUrl,
    images,
    avatar: p.avatar,
    created: iso(p.created),
  }
}

// 游客头像：邮箱哈希 → Cravatar（Gravatar 国内镜像）
// 注意：MD5 是 Gravatar 协议规范要求的哈希方式，非加密用途，不可改为 SHA-256
export function avatarFor(mail?: string | null): string {
  if (!mail) {
    return 'https://cdn.jsdelivr.net/gh/mx-space/mx-space-images@master/default-avatar.png'
  }
  const hash = createHash('md5').update(mail.trim().toLowerCase()).digest('hex')
  return `https://cravatar.cn/avatar/${hash}?d=mp&s=160`
}
