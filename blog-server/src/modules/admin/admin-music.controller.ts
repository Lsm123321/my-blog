import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { createReadStream } from 'fs'
import { extname, join } from 'path'
import { Readable } from 'stream'

import { ZipArchive } from 'archiver'

import { AdminGuard } from './admin.guard'
import { PrismaService } from '../../prisma/prisma.service'
import { isSafeMusicUrl } from '../../shared/url-guard'
import { MusicService } from '../music/music.service'
import { QqMusicService } from '../music/qq-music.service'

// 伪装浏览器请求网易云公开接口（绕过 UA/Referer 校验，参考 XHBlogs 方案）
const NET_EASE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  Referer: 'https://music.163.com/',
}

@UseGuards(AdminGuard)
@Controller('admin/music')
export class AdminMusicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qq: QqMusicService,
    private readonly music: MusicService,
  ) {}

  @Get('list')
  listAll() {
    return this.prisma.musicTrack.findMany({ orderBy: { sortOrder: 'asc' } })
  }

  // 网易云关键词搜索（代理 cloudsearch，免登录；fee=1 表示 VIP 曲目）
  @Get('netease/search')
  async searchNetease(@Query('keyword') keyword: string, @Query('limit') limit?: string) {
    const kw = String(keyword || '').trim()
    if (!kw) return { ok: true, list: [], hint: '请输入关键词' }
    const n = Math.min(Number(limit) || 12, 30)
    try {
      const res = await fetch('https://music.163.com/api/cloudsearch/pc', {
        method: 'POST',
        headers: {
          ...NET_EASE_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: 'os=pc; appver=2.10.13',
        },
        body: `s=${encodeURIComponent(kw)}&type=1&limit=${n}`,
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return { ok: false, list: [], message: `网易云搜索响应 ${res.status}` }
      const json = (await res.json()) as any
      return { ok: true, list: (json?.result?.songs || []).map(mapNeteaseSong) }
    } catch {
      return { ok: false, list: [], message: '网易云搜索超时或失败' }
    }
  }

  // QQ 音乐关键词搜索（SearchCgiService 必须登录，未配置 Cookie 时返回空列表并提示）
  @Get('qq/search')
  async searchQq(@Query('keyword') keyword: string) {
    const kw = String(keyword || '').trim()
    if (!kw) return { ok: true, list: [], hint: '请输入关键词' }
    if (!this.qq.hasCookie) {
      return { ok: true, list: [], hint: 'QQ 音乐搜索需要登录：请在服务端 .env 配置 QQ_MUSIC_COOKIE 后重启，或改用手动 ID / 链接收录' }
    }
    const list = await this.qq.search(kw)
    if (!list.length) return { ok: true, list: [], hint: '没有搜到相关歌曲（Cookie 可能已过期）' }
    return { ok: true, list }
  }

  // 解析网易云歌单：粘贴歌单链接或 ID，全量返回曲目（交互参考 wyapi.toubiec.cn）
  @Get('netease/playlist')
  async parseNeteasePlaylist(@Query('id') id: string) {
    // 支持整段分享文本/链接/纯数字，由 extractNeteaseId 统一提取
    const pid = await extractNeteaseId(id)
    if (!pid) return { ok: false, message: '未识别到歌单 ID：请粘贴分享文本、歌单链接或纯数字 ID' }
    try {
      const res = await fetch('https://music.163.com/api/v6/playlist/detail', {
        method: 'POST',
        headers: {
          ...NET_EASE_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: 'os=pc; appver=2.10.13',
        },
        // n 控制返回的完整曲目数量：给足 1000 让几百首的歌单一次拿全
        body: `n=1000&id=${pid}`,
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) return { ok: false, message: `网易云响应 ${res.status}` }
      const json = (await res.json()) as any
      const pl = json?.playlist
      if (!pl) return { ok: false, message: '歌单不存在或为私密歌单' }
      // 歌单原始顺序以 trackIds 为准；tracks 不全时（个别歌单 n 不生效）用批量详情接口补齐
      const totalIds: string[] = (pl.trackIds || []).map((t: any) => String(t.id))
      let tracks: any[] = pl.tracks || []
      if (tracks.length < totalIds.length) {
        const have = new Set(tracks.map((t: any) => String(t.id)))
        const missing = totalIds.filter((tid) => !have.has(tid)).slice(0, 1000)
        const extra = await this.fetchNeteaseSongDetailsBatched(missing)
        const byId = new Map([...tracks, ...extra].map((t: any) => [String(t.id), t]))
        tracks = totalIds.map((tid) => byId.get(tid)).filter(Boolean)
      }
      return {
        ok: true,
        name: String(pl.name || '歌单'),
        total: totalIds.length || tracks.length,
        list: tracks.slice(0, 1000).map(mapNeteaseSong),
      }
    } catch {
      return { ok: false, message: '歌单解析超时或失败' }
    }
  }

  // 解析网易云专辑：粘贴专辑链接或 ID
  @Get('netease/album')
  async parseNeteaseAlbum(@Query('id') id: string) {
    const aid = await extractNeteaseId(id)
    if (!aid) return { ok: false, message: '未识别到专辑 ID：请粘贴分享文本、专辑链接或纯数字 ID' }
    try {
      const res = await fetch(`https://music.163.com/api/v1/album/${aid}`, {
        headers: { ...NET_EASE_HEADERS, Cookie: 'os=pc; appver=2.10.13' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return { ok: false, message: `网易云响应 ${res.status}` }
      const json = (await res.json()) as any
      if (!json?.songs?.length) return { ok: false, message: '专辑不存在或没有歌曲' }
      return {
        ok: true,
        name: String(json.album?.name || json.name || '专辑'),
        total: json.songs.length,
        list: json.songs.map(mapNeteaseSong),
      }
    } catch {
      return { ok: false, message: '专辑解析超时或失败' }
    }
  }

  // 批量收录网易云歌曲：批量详情 + 一次入库，不逐首抓歌词
  // （批量收录的曲目歌词为空，前端首次播放时由 /music/lyric 懒加载补齐）
  // replace=false：跳过重复，响应里返回 duplicates 列表供前端确认替换；
  // replace=true：已存在的也重新收录——「先插新、成功后按旧记录 id 精确删旧」，
  // 预检失败（dead）的歌不动原记录，避免删了新的没补上
  @Post('netease/batch')
  async addNeteaseBatch(@Body() body: { songIds?: string[]; quality?: string; replace?: boolean }) {
    const quality = normalizeQuality(body?.quality)
    const replace = Boolean(body?.replace)
    // 上限 500：整张歌单勾选收录也够用，同时防止误传超大列表拖垮预检
    const ids = (body?.songIds || []).map(String).filter((x) => /^\d+$/.test(x)).slice(0, 500)
    if (!ids.length) return { ok: false, message: '未提供有效的歌曲 ID' }
    const existing = await this.prisma.musicTrack.findMany({
      where: { source: 'netease', songId: { in: ids } },
    })
    const existingSet = new Set(existing.map((e) => e.songId))
    const toAdd = replace ? ids : ids.filter((id) => !existingSet.has(id))
    const duplicates = ids.filter((id) => existingSet.has(id))
    if (!toAdd.length) {
      return { ok: true, added: 0, skipped: ids.length, dead: 0, duplicates }
    }

    const songs = await this.fetchNeteaseSongDetailsBatched(toAdd)
    if (!songs.length) return { ok: false, message: '歌曲详情获取失败' }

    // 逐首预检播放地址（按所选音质），解析不到（下架/无版权）的不收录；
    // 每批并发 8 个，避免上百首歌顺序探测太慢或触发风控
    const playableIds = new Set<string>()
    for (let i = 0; i < songs.length; i += 8) {
      const chunk = songs.slice(i, i + 8)
      const settled = await Promise.allSettled(
        chunk.map((s) => this.music.resolveNeteaseUrl(String(s.id), quality)),
      )
      settled.forEach((r, j) => {
        if (r.status === 'fulfilled' && r.value) playableIds.add(String(chunk[j].id))
      })
    }
    const playable = songs.filter((s) => playableIds.has(String(s.id)))
    const dead = toAdd.length - playable.length
    if (!playable.length) {
      return {
        ok: true,
        added: 0,
        skipped: ids.length,
        dead: dead + duplicates.length,
        ...(replace ? {} : { duplicates }),
      }
    }

    const last = await this.prisma.musicTrack.findFirst({ orderBy: { sortOrder: 'desc' } })
    const base = (last?.sortOrder ?? -1) + 1
    const created = await this.prisma.musicTrack.createMany({
      data: playable.map((s, i) => ({
        songId: String(s.id),
        source: 'netease',
        name: String(s.name || '未知歌曲'),
        artist: (s.ar || []).map((a: any) => a?.name).filter(Boolean).join('/') || '未知歌手',
        album: s.al?.name || '',
        cover: s.al?.picUrl ? String(s.al.picUrl).replace(/^http:\/\//, 'https://') : '',
        lrc: '',
        quality,
        sortOrder: base + i,
      })),
    })
    // 替换模式：只删除「成功重新收录」歌曲的旧记录（按旧记录 id 精确删除），预检失败的原收录不动
    if (replace) {
      const inserted = new Set(playable.map((s) => String(s.id)))
      const oldIds = existing
        .filter((e) => e.songId !== null && inserted.has(e.songId))
        .map((e) => e.id)
      if (oldIds.length) await this.prisma.musicTrack.deleteMany({ where: { id: { in: oldIds } } })
    }
    return {
      ok: true,
      added: created.count,
      skipped: ids.length - created.count,
      dead,
      ...(replace ? {} : { duplicates }),
    }
  }

  // 按批量详情接口（song/detail v3）拉取歌曲元数据
  private async fetchNeteaseSongDetails(ids: string[]): Promise<any[]> {
    try {
      const res = await fetch('https://music.163.com/api/v3/song/detail', {
        method: 'POST',
        headers: {
          ...NET_EASE_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: 'os=pc; appver=2.10.13',
        },
        body: 'c=' + encodeURIComponent(JSON.stringify(ids.map((id) => ({ id: Number(id) })))),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return []
      return (await res.json() as any)?.songs || []
    } catch {
      return []
    }
  }

  // 分批拉取详情：批量接口单次最多 100 首，多了按批循环
  private async fetchNeteaseSongDetailsBatched(ids: string[]): Promise<any[]> {
    const out: any[] = []
    for (let i = 0; i < ids.length; i += 100) {
      try {
        out.push(...(await this.fetchNeteaseSongDetails(ids.slice(i, i + 100))))
      } catch {
        /* 单批失败跳过，不中断整体 */
      }
    }
    return out
  }

  // 一键收录网易云歌曲：按 ID 抓取详情 + 歌词后入库（也接受分享文本/短链，统一走提取器）
  // 已收录时返回 duplicate 标记，前端确认替换后带 replace: true 重发
  @Post('netease')
  async addNetease(@Body() body: { songId?: string; quality?: string; replace?: boolean }) {
    const quality = normalizeQuality(body?.quality)
    const songId = await extractNeteaseId(String(body?.songId || ''))
    if (!songId) {
      return { ok: false, message: '未识别到歌曲 ID：请输入数字 ID 或包含网易云链接的内容' }
    }
    const exists = await this.prisma.musicTrack.findFirst({
      where: { songId, source: 'netease' },
    })
    if (exists && !body?.replace) {
      return { ok: false, duplicate: true, message: '该歌曲已在歌单中' }
    }

    // 收录前先解析一次播放地址（按所选音质）：VIP 歌拿到的是 45s 试听地址（算可播），
    // 下架/无版权的歌返回 null，直接拒收，避免前台播放时才报错
    const playUrl = await this.music.resolveNeteaseUrl(songId, quality)
    if (!playUrl) {
      return { ok: false, message: '该歌曲暂无可用播放源（下架/无版权），未收录' }
    }

    const [detailRes, lrcRes] = await Promise.all([
      fetch(`https://music.163.com/api/song/detail/?id=${songId}&ids=[${songId}]`, {
        headers: NET_EASE_HEADERS,
        signal: AbortSignal.timeout(6000),
      }),
      fetch(`https://music.163.com/api/song/lyric?id=${songId}&lv=-1&kv=-1&tv=-1`, {
        headers: NET_EASE_HEADERS,
        signal: AbortSignal.timeout(6000),
      }).catch(() => null),
    ])
    if (!detailRes.ok) {
      return { ok: false, message: `网易云接口响应 ${detailRes.status}（可能被拦截）` }
    }
    const detail = (await detailRes.json()) as any
    const song = detail?.songs?.[0]
    if (!song) return { ok: false, message: '未找到该歌曲（VIP/下架或 ID 错误）' }

    let lrc = ''
    if (lrcRes?.ok) {
      try {
        lrc = ((await lrcRes.json()) as any)?.lrc?.lyric || ''
      } catch {
        /* 歌词可选 */
      }
    }

    const last = await this.prisma.musicTrack.findFirst({ orderBy: { sortOrder: 'desc' } })
    const track = await this.prisma.musicTrack.create({
      data: {
        songId,
        source: 'netease',
        name: song.name,
        artist: song.artists?.[0]?.name || '未知歌手',
        album: song.album?.name || '',
        cover: song.album?.picUrl || '',
        lrc,
        quality,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    })
    // 替换模式：新记录入库成功后再删旧记录——插入失败也不会丢歌，删除失败大不了暂时两条
    if (exists) await this.prisma.musicTrack.delete({ where: { id: exists.id } }).catch(() => {})
    return { ok: true, track, replaced: Boolean(exists) }
  }

  // 一键收录 QQ 音乐歌曲：粘贴 songmid 或 y.qq.com 歌曲详情页链接（接口思路参考 Suxiaoqinx/tencent_url）
  @Post('qq')
  async addQq(@Body() body: { songMid?: string; replace?: boolean }) {
    const input = String(body?.songMid || '').trim()
    // 支持两种输入：纯 songmid，或 https://y.qq.com/n/ryqq/songDetail/<mid> 链接
    const matched = input.match(/songDetail\/([0-9A-Za-z]+)/) || input.match(/^([0-9A-Za-z]{10,20})$/)
    const mid = matched?.[1]
    if (!mid) {
      return { ok: false, message: '请填写 QQ 音乐 songmid 或歌曲详情页链接' }
    }
    const exists = await this.prisma.musicTrack.findFirst({
      where: { songId: mid, source: 'qq' },
    })
    if (exists && !body?.replace) {
      return { ok: false, duplicate: true, message: '该歌曲已在歌单中' }
    }

    // 收录前先确认拿得到播放地址：腾讯 vkey 风控收紧后（2025 起）即使带登录 Cookie
    // 也可能拿不到真实歌曲链接（服务端只回验证文件），此时拒收并引导改用网易云源
    const playUrl = await this.qq.resolvePlayUrl(mid)
    if (!playUrl) {
      return {
        ok: false,
        message:
          '未获取到该歌曲的播放地址（腾讯解析接口当前受限）。建议改用「网易云」源搜索同名歌曲收录，网易云源解析正常',
      }
    }

    const info = await this.qq.getSongInfo(mid)
    if (!info) return { ok: false, message: '未找到该歌曲（检查 songmid 是否正确）' }
    // 歌词可选，失败不阻塞收录
    const lrc = await this.qq.getLyric(mid).catch(() => '')

    const last = await this.prisma.musicTrack.findFirst({ orderBy: { sortOrder: 'desc' } })
    const track = await this.prisma.musicTrack.create({
      data: {
        songId: mid,
        source: 'qq',
        name: info.name,
        artist: info.artist,
        album: info.album,
        cover: info.cover,
        lrc,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    })
    // 替换模式：新记录入库成功后再删旧记录，保证任何失败都不会丢歌
    if (exists) await this.prisma.musicTrack.delete({ where: { id: exists.id } }).catch(() => {})
    return { ok: true, track, replaced: Boolean(exists) }
  }

  // 本地曲目：url 为 /admin/upload 已上传的音频地址
  @Post('local')
  async addLocal(@Body() body: Record<string, any>) {
    if (!body?.name || !body?.url) return { ok: false, message: '曲名和音频地址必填' }
    const last = await this.prisma.musicTrack.findFirst({ orderBy: { sortOrder: 'desc' } })
    const track = await this.prisma.musicTrack.create({
      data: {
        source: 'local',
        name: String(body.name),
        artist: body.artist || '',
        album: body.album || '',
        cover: body.cover || '',
        lrc: body.lrc || '',
        url: String(body.url),
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    })
    return { ok: true, track }
  }

  @Patch(':id')
  updateTrack(@Param('id') id: string, @Body() body: Record<string, any>) {
    const data: Record<string, any> = {}
    if (body.enabled !== undefined) data.enabled = !!body.enabled
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder)
    if (body.name !== undefined) data.name = String(body.name)
    if (body.lrc !== undefined) data.lrc = String(body.lrc)
    return this.prisma.musicTrack.update({ where: { id }, data })
  }

  @Delete(':id')
  deleteTrack(@Param('id') id: string) {
    return this.prisma.musicTrack.delete({ where: { id } })
  }

  // 单曲下载：按收录音质解析真实地址后以附件流返回，文件名为「歌名 - 歌手.扩展名」
  @Get(':id/download')
  async downloadTrack(@Param('id') id: string, @Res() res: Response) {
    const track = await this.prisma.musicTrack.findUnique({ where: { id } })
    if (!track) return res.status(404).json({ message: '曲目不存在' })
    try {
      const { stream, filename } = await this.openTrackSource(track)
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Disposition', attachmentFilename(filename))
      stream.pipe(res)
    } catch (e) {
      return res
        .status(404)
        .json({ message: `无法下载：${e instanceof Error ? e.message : '未获取到可用播放源'}` })
    }
  }

  // 批量下载：勾选的曲目打包为 zip 流式返回（按勾选顺序编号，单次上限 100 首）
  @Post('download-zip')
  async downloadZip(@Body() body: { ids?: string[] }, @Res() res: Response) {
    const ids = (body?.ids || []).map(String).filter(Boolean).slice(0, 100)
    if (!ids.length) return res.status(400).json({ message: '未提供曲目 ID' })
    const tracks = await this.prisma.musicTrack.findMany({ where: { id: { in: ids } } })
    const ordered = ids
      .map((id) => tracks.find((t) => t.id === id))
      .filter((t): t is (typeof tracks)[number] => Boolean(t))

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader(
      'Content-Disposition',
      attachmentFilename(`音乐批量下载-${new Date().toISOString().slice(0, 10)}.zip`),
    )
    // 音频本身已是压缩格式，zip 用 store 模式（level 0）打包快且不再二次压缩
    const archive = new ZipArchive({ zlib: { level: 0 } })
    archive.on('warning', () => {})
    archive.pipe(res)
    for (let i = 0; i < ordered.length; i++) {
      try {
        const { stream, filename } = await this.openTrackSource(ordered[i])
        archive.append(stream, { name: `${String(i + 1).padStart(3, '0')} ${filename}` })
      } catch {
        /* 单首解析失败跳过，不中断整包 */
      }
    }
    await archive.finalize()
  }

  // 打开某曲目的下载源：local 直接读文件；netease/qq 按收录音质解析真实地址后校验域名再流式转发
  private async openTrackSource(track: {
    source: string
    url: string
    songId: string | null
    quality: string | null
    name: string
    artist: string
  }): Promise<{ stream: Readable; filename: string }> {
    const base = `${sanitizeFilename(track.name)} - ${sanitizeFilename(track.artist) || '未知歌手'}`
    if (track.source === 'local') {
      // 本地路径由服务端生成（/uploads/xxx），保留前缀校验防止路径注入
      if (!track.url.startsWith('/uploads/')) throw new Error('本地文件路径异常')
      const ext = extname(track.url) || '.mp3'
      return { stream: createReadStream(join(process.cwd(), track.url)), filename: base + ext }
    }
    let remoteUrl: string | null = null
    if (track.source === 'qq') {
      remoteUrl = track.songId ? await this.qq.resolvePlayUrl(track.songId) : null
      if (!remoteUrl) throw new Error('未获取到 QQ 音乐播放地址（VIP 或未配置 Cookie）')
    } else {
      remoteUrl = track.songId
        ? await this.music.resolveNeteaseUrl(track.songId, track.quality || undefined)
        : null
      if (!remoteUrl) throw new Error('未获取到网易云播放地址（下架/无版权）')
    }
    // 防 SSRF：只允许已知音乐域名的 http/https 地址
    if (!isSafeMusicUrl(remoteUrl)) throw new Error('解析到的地址未通过安全校验')
    const upstream = await fetch(remoteUrl)
    if (!upstream.ok || !upstream.body) throw new Error('音频源响应异常')
    return { stream: Readable.fromWeb(upstream.body as any), filename: base + extFromPath(remoteUrl) }
  }
}

// 网易云音质白名单：只保留浏览器 <audio> 可直接播放的档位。
// 沉浸环绕声(sky)/杜比全景声(dolby)/臻音全景声(jymaster) 为 .mp4 等特殊编码或需 immerseType 子类型，
// 浏览器无法在线播放（参考站是下载工具才保留它们），故不开放收录
const NETEASE_QUALITIES = ['', 'standard', 'exhigh', 'lossless', 'hires', 'jyeffect']
function normalizeQuality(q?: string): string {
  return NETEASE_QUALITIES.includes(String(q || '')) ? String(q || '') : ''
}

// 网易云歌曲对象映射：新版字段（ar/al）与旧版字段（artists/album）都兼容
function mapNeteaseSong(s: any) {
  const artistArr = s.ar || s.artists || []
  const albumObj = s.al || s.album || {}
  return {
    songId: String(s.id),
    name: String(s.name || ''),
    artist: artistArr.map((a: any) => a?.name).filter(Boolean).join('/') || '未知歌手',
    album: albumObj.name || '',
    cover: albumObj.picUrl ? String(albumObj.picUrl).replace(/^http:\/\//, 'https://') : '',
    vip: s.fee === 1,
  }
}

// 下载附件头：ASCII 回退名 + RFC 5987 中文名（支持歌名里的中文/特殊字符）
function attachmentFilename(name: string): string {
  return `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(name)}`
}
// 文件名清洗：去掉路径非法字符，防止 zip 内路径穿越
function sanitizeFilename(name: string): string {
  return String(name || '').replace(/[\\/:*?"<>|]/g, ' ').trim()
}
// 从音频直链推断扩展名（网易云 CDN 是 .mp3/.flac，QQ 是 .mp3）
function extFromPath(url: string): string {
  const m = url.split('?')[0].match(/\.(mp3|flac|m4a|mp4|aac|ogg|wav)$/i)
  return m ? '.' + m[1].toLowerCase() : '.mp3'
}

// 从用户输入中提取网易云资源 ID（策略参考 Suxiaoqinx/Netease_url 的 _extract_music_id）：
// 兼容整段分享文本（如「分享歌单: 逃离旧世界18… https://music.163.com/m/playlist?id=5031773330&creator=…」）、
// 纯数字 ID、/playlist/123 路径形式，以及 163cn.tv 短链（跟随一跳重定向拿真实地址）
// 注意不能用「取第一个数字」：分享文案标题里常带数字（本例就是被「18」坑了）
async function extractNeteaseId(input: string): Promise<string | null> {
  let text = String(input || '').trim()
  if (!text) return null
  // 163cn.tv 短链本身不含 ID，跟随一次 30x 重定向拿真实长链接
  const shortLink = text.match(/https?:\/\/163cn\.tv\/[\w./?#=&%-]+/i)
  if (shortLink) {
    try {
      const u = new URL(shortLink[0])
      // 仅允许该短链域名的 https 请求，防 SSRF
      if (u.protocol === 'https:' && u.hostname === '163cn.tv') {
        const res = await fetch(shortLink[0], {
          redirect: 'manual',
          headers: { 'User-Agent': NET_EASE_HEADERS['User-Agent'] },
          signal: AbortSignal.timeout(6000),
        })
        const loc = res.headers.get('location')
        if (loc) text = decodeURIComponent(loc)
      }
    } catch {
      /* 跟随失败则按原文继续提取 */
    }
  }
  // 依次尝试：URL 查询参数 id=（[?&] 边界避免误匹配 creatorid= 之类字段）
  //           → 路径形式 /playlist/123、/album/456、/song/789 → 整段输入是纯数字
  return (
    text.match(/[?&]id=(\d+)/)?.[1] ||
    text.match(/(?:playlist|album|song)\/(\d+)/)?.[1] ||
    (/^\d+$/.test(text) ? text : null)
  )
}
