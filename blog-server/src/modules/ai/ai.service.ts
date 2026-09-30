import { Injectable, ServiceUnavailableException } from '@nestjs/common'

import { PrismaService } from '../../prisma/prisma.service'

// GLM 开放平台对话接口（glm-4-flash 免费，适合个人博客摘要场景）
const GLM_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const GLM_MODEL = process.env.GLM_MODEL || 'glm-4-flash'
// 送入模型的最大正文长度：太长费 token 且摘要不需要全文细节
const MAX_TEXT_CHARS = 4000

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  // 生成文章 AI 摘要并落库，返回新摘要文本
  async summarizePost(id: string): Promise<{ aiSummary: string; aiSummaryAt: Date }> {
    const post = await this.prisma.post.findUnique({ where: { id } })
    if (!post) throw new ServiceUnavailableException('文章不存在')

    const summary = await this.chat(
      '你是博客文章摘要助手。请用中文、第三人称写一段 100 字以内的文章摘要：先一句话概括主题，再点出核心内容。直接输出摘要正文，不要任何前缀、引号或 Markdown 格式。',
      `文章标题：${post.title}\n\n文章内容：\n${stripMarkdown(post.text).slice(0, MAX_TEXT_CHARS)}`,
    )

    const aiSummaryAt = new Date()
    await this.prisma.post.update({ where: { id }, data: { aiSummary: summary, aiSummaryAt } })
    return { aiSummary: summary, aiSummaryAt }
  }

  // 调 GLM 对话接口；未配置密钥/调用失败时给出可操作的报错信息
  private async chat(system: string, user: string): Promise<string> {
    const key = process.env.GLM_API_KEY
    if (!key) {
      throw new ServiceUnavailableException('未配置 GLM_API_KEY，请在 blog-server/.env 中添加后重启')
    }
    let res: Response
    try {
      res = await fetch(GLM_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: GLM_MODEL,
          temperature: 0.5,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
    } catch {
      throw new ServiceUnavailableException('无法连接 GLM 接口，请检查网络')
    }
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}))
      throw new ServiceUnavailableException(`GLM 接口报错（HTTP ${res.status}）：${err?.error?.message || res.statusText}`)
    }
    const data: any = await res.json()
    const text = String(data?.choices?.[0]?.message?.content || '').trim()
    if (!text) throw new ServiceUnavailableException('GLM 返回了空摘要，请重试')
    return text
  }
}

// 去掉 Markdown 语法噪声（代码块/图片/标记符），让模型读纯文本更省 token
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`~_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
