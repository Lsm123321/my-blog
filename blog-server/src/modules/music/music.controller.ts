import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { join } from 'path'
import { Readable } from 'stream'

import { MusicService } from './music.service'
import { QqMusicService } from './qq-music.service'

// 前台音乐播放的公开接口：歌单 / 流式播放 / 歌词 / 封面代理 / 播放排行
@Controller('music')
export class MusicController {
  constructor(
    private readonly service: MusicService,
    private readonly qq: QqMusicService,
  ) {}

  // 公开歌单（仅启用的曲目）
  @Get('playlist')
  getPlaylist() {
    return this.service.getPlaylist()
  }

  // 歌词
  @Get('lyric/:id')
  async getLyric(@Param('id') id: string) {
    const lrc = await this.service.getLyric(id)
    return { lrc }
  }

  // 封面代理：网易云/QQ 图床校验 Referer，浏览器直连 403；服务端带 Referer 拉流转发
  @Get('cover')
  async cover(@Query('url') url: string, @Res() res: Response) {
    // 域名白名单：只代理网易/QQ 图床，防 SSRF
    const allow = /^https:\/\/([\w-]+\.music\.126\.net|y\.gtimg\.cn|imgcache\.qq\.com)\//
    if (!url || !allow.test(url)) {
      return res.status(400).json({ message: '仅支持网易云/QQ 图床地址' })
    }
    const referer = url.includes('126.net') ? 'https://music.163.com/' : 'https://y.qq.com/'
    try {
      const upstream = await fetch(url, {
        headers: { Referer: referer, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      })
      if (!upstream.ok || !upstream.body) {
        return res.status(404).json({ message: '封面拉取失败' })
      }
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg')
      // 封面几乎不变，缓存一周；前端换曲重载也走缓存
      res.setHeader('Cache-Control', 'public, max-age=604800')
      Readable.fromWeb(upstream.body as any).pipe(res)
    } catch {
      res.status(502).json({ message: '封面代理失败' })
    }
  }

  // ---- 访客播放排行（公开：博客场景下的轻量统计）----

  // 播放计数上报（每完整播放一首 +1）
  @Post('play/report')
  reportPlay(@Body() body: { id?: string; name?: string; artist?: string }) {
    return this.service.reportPlay(body || {})
  }

  // 播放次数排行榜
  @Get('play/ranking')
  playRanking(@Query('limit') limit?: string) {
    return this.service.playRanking(Number(limit) || 20)
  }

  // 音频流：统一 302 到各源的真实播放地址（每次请求实时解析，地址过期无关紧要）
  @Get('stream/:id')
  async stream(@Param('id') id: string, @Res() res: Response) {
    const track = await this.service.getTrack(id)
    if (!track) {
      return res.status(404).json({ message: '曲目不存在' })
    }
    if (track.source === 'local') {
      // 本地文件：uploads 目录下（文件名由上传时随机生成，无路径注入风险）
      return res.sendFile(join(process.cwd(), track.url))
    }
    if (track.source === 'qq') {
      // QQ 音乐：vkey 接口解析；腾讯风控收紧后可能拿不到地址（搜索/歌词不受影响）
      const url = track.songId ? await this.qq.resolvePlayUrl(track.songId) : null
      if (!url) {
        return res.status(404).json({ message: '未获取到 QQ 音乐播放地址（腾讯解析接口当前受限，建议改用网易云源收录同名歌曲）' })
      }
      return res.redirect(302, url)
    }
    // 网易云：优先解析真实 CDN 地址（按曲目收录时的音质偏好），失败再回退官方外链
    const resolved = track.songId
      ? await this.service.resolveNeteaseUrl(track.songId, track.quality)
      : null
    return res.redirect(
      302,
      resolved ?? `https://music.163.com/song/media/outer/url?id=${track.songId}.mp3`,
    )
  }
}
