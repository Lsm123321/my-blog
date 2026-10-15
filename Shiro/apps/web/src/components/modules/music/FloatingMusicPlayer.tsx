'use client'

import { m, AnimatePresence } from 'motion/react'
import { useAtomValue } from 'jotai'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'

import {
  mineradioSeenAtom,
  useMusicControls,
  useMusicCurrent,
  useMusicExpanded,
  useMusicPanelToggle,
  useMusicPlaying,
  useMusicPlayMode,
  useMusicPlaylist,
  useMusicProgress,
  useMusicStarted,
  useMusicVolume,
  type PlayMode,
} from './MusicProvider'
import { findActiveLyricIndex, fmtTime, useLyricQuery } from './lyrics'
import { Link, usePathname } from '~/i18n/navigation'
import { clsxm } from '~/lib/helper'

// 用 mingcute 图标集（项目仅安装了 mingcute/material-symbols，iconoir 不存在会导致按钮空白）
const PlayModeIcon: Component<{ mode: PlayMode }> = ({ mode }) =>
  ({
    list: <i className="i-mingcute-repeat-line" />,
    one: <i className="i-mingcute-repeat-one-line" />,
    random: <i className="i-mingcute-shuffle-line" />,
  })[mode] as JSX.Element

// ============================================================
// Mineradio 桥接：iframe（同源）里的播放器把控制函数都挂在 window 上
// （playQueue / currentIdx / playMode / audio / nextTrack / cyclePlayMode…，
// 见 public/mineradio/js/modules/05-playback/）。这里轮询读它的状态渲染到
// 迷你条，再反向调用这些函数实现遥控——两侧 UI 语义天然一致（切歌、
// 播放模式、自动连播都走 Mineradio 自己的逻辑）。
// ============================================================

// Mineradio 的 playMode（loop/shuffle/single）↔ 全局迷你条的 PlayMode
const MR_MODE_TO_OURS: Record<string, PlayMode> = { loop: 'list', shuffle: 'random', single: 'one' }

type MrSnapshot = {
  alive: boolean
  playing: boolean
  track: { id: string; name: string; artist: string; cover: string } | null
  index: number
  queue: { id: string; name: string; artist: string }[]
  current: number
  duration: number
  playMode: PlayMode
  volume: number
}

const EMPTY_MR: MrSnapshot = {
  alive: false,
  playing: false,
  track: null,
  index: 0,
  queue: [],
  current: 0,
  duration: 0,
  playMode: 'list',
  volume: 1,
}

const mrWindow = (): any => {
  try {
    const frame = (window as any).__mineradioFrame as HTMLIFrameElement | undefined
    return frame?.contentWindow ?? null
  } catch {
    return null
  }
}

function useMineradioBridge() {
  const seen = useAtomValue(mineradioSeenAtom)
  const [snap, setSnap] = useState<MrSnapshot>(EMPTY_MR)

  useEffect(() => {
    if (!seen) return
    const timer = setInterval(() => {
      try {
        const win = mrWindow()
        const queue = win?.playQueue
        if (!win || !Array.isArray(queue) || !queue.length) {
          setSnap((s) => (s.alive ? { ...EMPTY_MR } : s))
          return
        }
        const index = Math.max(0, Number(win.currentIdx) || 0)
        const song = queue[index] || queue[0]
        const audio = win.audio as HTMLAudioElement | undefined
        setSnap({
          alive: true,
          playing: !!win.playing && !!audio && !audio.paused,
          track: song
            ? {
                id: String(song.id ?? ''),
                name: String(song.name ?? '未知歌曲'),
                artist: String(song.artist ?? '未知歌手'),
                cover: String(song.cover || ''),
              }
            : null,
          index,
          queue: queue.map((s: any) => ({
            id: String(s.id ?? ''),
            name: String(s.name ?? ''),
            artist: String(s.artist ?? ''),
          })),
          current: audio?.currentTime || 0,
          duration: audio?.duration || song?.duration || 0,
          playMode: MR_MODE_TO_OURS[String(win.playMode || 'loop')] || 'list',
          volume: audio ? audio.volume : 1,
        })
      } catch {
        /* iframe 未就绪 / 导航中：保持上次快照 */
      }
    }, 400)
    return () => clearInterval(timer)
  }, [seen])

  const controls = useMemo(
    () => ({
      toggle: () => {
        const win = mrWindow()
        if (!win) return
        const audio = win.audio as HTMLAudioElement | undefined
        // 还没起播过（无 src）：按当前队列位置正式起播，复用 Mineradio 的启动链路
        if (!audio || !audio.src) {
          if (typeof win.playQueueAt === 'function') win.playQueueAt(Math.max(0, Number(win.currentIdx) || 0))
          return
        }
        if (audio.paused) {
          void audio.play()
            .then(() => {
              try {
                win.playing = true
                if (typeof win.setPlayIcon === 'function') win.setPlayIcon(true)
              } catch {}
            })
            .catch(() => {})
        } else {
          audio.pause()
          try {
            win.playing = false
            if (typeof win.setPlayIcon === 'function') win.setPlayIcon(false)
          } catch {}
        }
      },
      next: () => {
        const win = mrWindow()
        if (win && typeof win.nextTrack === 'function') win.nextTrack(true)
      },
      prev: () => {
        const win = mrWindow()
        if (win && typeof win.prevTrack === 'function') win.prevTrack(true)
      },
      playAt: (i: number) => {
        const win = mrWindow()
        if (win && typeof win.playQueueAt === 'function') win.playQueueAt(i)
      },
      seek: (t: number) => {
        const win = mrWindow()
        const audio = win?.audio as HTMLAudioElement | undefined
        if (audio) audio.currentTime = t
      },
      cycleMode: () => {
        // 直接调 Mineradio 的模式循环：它的按钮态、toast、shuffle 队列重排全部自洽
        const win = mrWindow()
        if (win && typeof win.cyclePlayMode === 'function') win.cyclePlayMode()
      },
      setVolume: (v: number) => {
        const win = mrWindow()
        const audio = win?.audio as HTMLAudioElement | undefined
        if (audio) audio.volume = v
      },
    }),
    [],
  )

  return { ...snap, controls }
}

// ============================================================
// 统一播放器界面状态：Mineradio 活跃时桥接它，否则回退全局播放器
// （MusicProvider 的 window 级 audio 单例）。迷你条与面板只面对这一个接口。
// ============================================================
function useUnifiedPlayer() {
  const mr = useMineradioBridge()
  const { track: gTrack, index: gIndex } = useMusicCurrent()
  const gPlaylist = useMusicPlaylist().data || []
  const gPlaying = useMusicPlaying()
  const gStarted = useMusicStarted()
  const gProgress = useMusicProgress()
  const gMode = useMusicPlayMode()
  const gVolume = useMusicVolume()
  const gControls = useMusicControls()

  // Mineradio 就绪（iframe 加载完且队列有歌）→ 桥接模式；否则全局模式
  const useMr = mr.alive && !!mr.track

  return useMemo(() => {
    if (useMr) {
      return {
        active: true,
        isMineradio: true as const,
        track: mr.track,
        index: mr.index,
        playing: mr.playing,
        current: mr.current,
        duration: mr.duration,
        playMode: mr.playMode,
        volume: mr.volume,
        playlist: mr.queue,
        toggle: mr.controls.toggle,
        next: mr.controls.next,
        prev: mr.controls.prev,
        playAt: mr.controls.playAt,
        seek: mr.controls.seek,
        cycleMode: mr.controls.cycleMode,
        setVolume: mr.controls.setVolume,
      }
    }
    return {
      active: gStarted && !!gTrack,
      isMineradio: false as const,
      track: gTrack ? { id: gTrack.id, name: gTrack.name, artist: gTrack.artist, cover: gTrack.cover } : null,
      index: gIndex,
      playing: gPlaying,
      current: gProgress.current,
      duration: gProgress.duration,
      playMode: gMode,
      volume: gVolume,
      playlist: gPlaylist.map((t) => ({ id: t.id, name: t.name, artist: t.artist })),
      toggle: gControls.toggle,
      next: gControls.next,
      prev: gControls.prev,
      playAt: gControls.play,
      seek: gControls.seek,
      cycleMode: () => {
        // 全局播放器：循环三态 + 同步 audio.loop（单曲循环交给元素自身）
        const order: PlayMode[] = ['list', 'one', 'random']
        const nextMode = order[(order.indexOf(gMode) + 1) % order.length]
        if (gControls.audioRef.current) gControls.audioRef.current.loop = nextMode === 'one'
        gControls.setPlayMode(nextMode)
      },
      setVolume: gControls.setVolume,
    }
  }, [
    useMr,
    mr,
    gTrack,
    gIndex,
    gPlaying,
    gStarted,
    gProgress,
    gMode,
    gVolume,
    gPlaylist,
    gControls,
  ])
}

// ---------- 歌单 + 歌词面板 ----------
const MusicPanel: Component = () => {
  const pathname = usePathname()
  const expanded = useMusicExpanded()
  const started = useMusicStarted()
  const player = useUnifiedPlayer()
  const { track, playing, current, duration, playMode, volume, playlist, index } = player

  // 歌词：两种模式下 track.id 都是后端 MusicTrack.id，同一接口直接复用
  const lyrics = useLyricQuery(track?.id)
  const activeLyricIndex = findActiveLyricIndex(lyrics, current)

  // 当前行自动滚动到可视区
  const activeLyricRef = useRef<HTMLParagraphElement | null>(null)
  useEffect(() => {
    activeLyricRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeLyricIndex])

  // 音乐页由 Mineradio 全屏接管，此面板只在其余页面出现。
  // started 只约束全局播放器模式；Mineradio 舞台激活即算「开始过」
  const hiddenByRoute = pathname.startsWith('/music')

  return (
    <AnimatePresence>
      {expanded && !hiddenByRoute && player.active && (player.isMineradio || started) && (
        <m.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className={clsxm(
            'fixed bottom-24 left-6 z-[60] w-[min(20rem,calc(100vw-3rem))]',
            'overflow-hidden rounded-2xl bg-base-100/90 ring-1 ring-zinc-900/10 backdrop-blur-lg dark:ring-white/10',
            'shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]',
          )}
          data-hide-print
        >
          {/* 当前曲目 */}
          {track && (
            <div className="flex items-center gap-3 px-4 pt-4">
              <m.div
                key={track.id}
                initial={{ rotate: 0 }}
                animate={{ rotate: playing ? 360 : 0 }}
                transition={
                  playing
                    ? { repeat: Infinity, duration: 12, ease: 'linear' }
                    : { duration: 0.3 }
                }
                className="relative size-16 shrink-0 overflow-hidden rounded-full ring-1 ring-zinc-900/10 dark:ring-white/10"
              >
                <CoverImage src={track.cover} alt={track.name} sizes="64px" />
              </m.div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{track.name}</p>
                <p className="truncate text-xs opacity-60">{track.artist}</p>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={current}
                  onChange={(e) => player.seek(+e.target.value)}
                  className="range range-xs mt-2 h-1 w-full accent-accent"
                  aria-label="播放进度"
                />
                <div className="flex justify-between text-[10px] opacity-50">
                  <span>{fmtTime(current)}</span>
                  <span>{fmtTime(duration)}</span>
                </div>
              </div>
            </div>
          )}

          {/* 歌词滚动区 */}
          {lyrics.length > 0 && (
            <div className="mt-3 h-28 overflow-hidden px-4">
              <div className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {lyrics.map((line, i) => (
                  <p
                    key={`${i}-${line.time}`}
                    ref={i === activeLyricIndex ? activeLyricRef : undefined}
                    onClick={() => player.seek(line.time)}
                    className={clsxm(
                      'cursor-pointer py-1 text-xs leading-relaxed transition-colors',
                      i === activeLyricIndex
                        ? 'font-medium text-accent'
                        : 'opacity-40 hover:opacity-70',
                    )}
                  >
                    {line.text}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* 控制条：模式 / 音量 */}
          <div className="mt-2 flex items-center gap-3 px-4">
            <button
              className="btn btn-ghost btn-xs tooltip"
              data-tip={{ list: '列表循环', one: '单曲循环', random: '随机播放' }[playMode]}
              onClick={player.cycleMode}
              aria-label="切换播放模式"
            >
              <PlayModeIcon mode={playMode} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => player.setVolume(+e.target.value)}
              className="range range-xs h-1 flex-1 accent-accent"
              aria-label="音量"
            />
          </div>

          {/* 播放列表（Mineradio 模式显示它的实时队列） */}
          <ul className="mt-2 max-h-48 overflow-y-auto border-t border-zinc-900/5 py-2 dark:border-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {playlist.map((t, i) => (
              <li key={`${t.id}-${i}`}>
                <button
                  onClick={() => player.playAt(i)}
                  className={clsxm(
                    'flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs transition-colors',
                    i === index
                      ? 'text-accent'
                      : 'opacity-70 hover:bg-zinc-900/5 hover:opacity-100 dark:hover:bg-white/5',
                  )}
                >
                  {i === index && playing ? (
                    <i className="i-mingcute-volume-line shrink-0" />
                  ) : (
                    <i className="i-mingcute-music-2-line shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {t.name} <span className="opacity-60">- {t.artist}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </m.div>
      )}
    </AnimatePresence>
  )
}

// 封面兜底：本地收录/部分曲目没有封面（cover 为空串），空 src 会让 next/image 报错，改渲染音符占位。
// 封面走的是自己的代理地址（同源 /api/v2/music/cover），next/image 优化器对
// 绝对地址有 remotePatterns 校验，部署环境下（IP/http）会被 400 拒绝且无收益
// （图已是本站代理过的小图），因此统一用 <img> 直出，代理地址本身没有 Referer 问题
const CoverImage: Component<{ src: string; alt: string; sizes: string }> = ({ src, alt, sizes }) =>
  src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} sizes={sizes} referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
  ) : (
    <span className="absolute inset-0 flex items-center justify-center bg-zinc-300/70 text-zinc-500 dark:bg-zinc-600/60 dark:text-zinc-300">
      <i className="i-mingcute-music-2-fill text-lg" />
    </span>
  )

// ---------- 迷你悬浮条 ----------
const MiniPlayer: Component = () => {
  const pathname = usePathname()
  const player = useUnifiedPlayer()
  const { track, playing } = player
  const expanded = useMusicExpanded()
  const togglePanel = useMusicPanelToggle()

  // 「收回」语义：全局播放器模式要求开始播放过；Mineradio 模式只要舞台激活即可
  // （用户可能刚从音乐页切出来暂停着，迷你条仍要显示供随时续播）。
  // /music 由 Mineradio 全屏接管，迷你条让位
  const started = useMusicStarted()
  if (pathname.startsWith('/music')) return null
  if (!player.active || (!player.isMineradio && !started)) return null

  return (
    <m.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.6 }}
      className={clsxm(
        'fixed bottom-6 left-6 z-[60] flex items-center gap-2',
        'rounded-full bg-base-100/90 py-1.5 pl-1.5 pr-3 ring-1 ring-zinc-900/10 backdrop-blur-lg dark:ring-white/10',
        'shadow-[0_8px_30px_-12px_rgba(0,0,0,0.3)]',
      )}
      data-hide-print
    >
      {/* 封面：暂停时叠加播放图标作为「点击继续」提示；播放中不叠加暂停图标，避免和右侧控制区重复 */}
      <m.button
        aria-label={playing ? '暂停' : '播放'}
        onClick={player.toggle}
        whileTap={{ scale: 0.9 }}
        className="relative size-10 shrink-0 overflow-hidden rounded-full ring-1 ring-zinc-900/10 dark:ring-white/10"
      >
        <CoverImage src={track?.cover || ''} alt={track?.name || ''} sizes="40px" />
        {!playing && (
          // center 工具类只有 align/justify 没有 display，必须显式加 flex 才能居中
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
            <i className="i-mingcute-play-fill" />
          </span>
        )}
      </m.button>

      <button
        onClick={togglePanel}
        className="min-w-0 max-w-[9rem] flex-1 cursor-pointer text-left"
        aria-label={expanded ? '收起歌单' : '展开歌单'}
      >
        <p className="truncate text-xs font-medium">{track?.name ?? '未在播放'}</p>
        <p className="truncate text-[10px] opacity-60">{track?.artist ?? '点击展开面板'}</p>
      </button>

      <MotionIconButton label="上一首" icon="i-mingcute-skip-previous-line" onClick={player.prev} />
      <MotionIconButton
        label={playing ? '暂停' : '播放'}
        icon={playing ? 'i-mingcute-pause-line' : 'i-mingcute-play-fill'}
        onClick={player.toggle}
      />
      <MotionIconButton label="下一首" icon="i-mingcute-skip-forward-line" onClick={player.next} />

      {/* 播放模式直达（随机/顺序/单曲）：不用展开面板也能切 */}
      <button
        onClick={player.cycleMode}
        className="center flex size-7 shrink-0 rounded-full text-neutral-800/70 transition-colors hover:bg-zinc-900/5 hover:text-accent dark:text-zinc-100/70 dark:hover:bg-white/10"
        aria-label="切换播放模式"
        title={{ list: '列表循环', one: '单曲循环', random: '随机播放' }[player.playMode]}
      >
        <PlayModeIcon mode={player.playMode} />
      </button>

      {/* 跳转沉浸式音乐页 */}
      <Link
        href="/music"
        className="center flex size-7 shrink-0 rounded-full text-neutral-800/70 transition-colors hover:bg-zinc-900/5 hover:text-accent dark:text-zinc-100/70 dark:hover:bg-white/10"
        aria-label="进入沉浸式音乐"
        title="沉浸式音乐"
      >
        <i className="i-mingcute-fullscreen-2-line text-base" />
      </Link>
    </m.div>
  )
}

const MotionIconButton: Component<{
  label: string
  icon: string
  onClick: () => void
}> = ({ label, icon, onClick }) => (
  <m.button
    whileTap={{ scale: 0.85 }}
    onClick={onClick}
    aria-label={label}
    title={label}
    className="center flex size-7 shrink-0 rounded-full text-neutral-800/70 transition-colors hover:bg-zinc-900/5 hover:text-accent dark:text-zinc-100/70 dark:hover:bg-white/10"
  >
    <i className={`${icon} text-base`} />
  </m.button>
)

// ---------- 对外入口：迷你条 + 歌单面板 ----------
// 注意：MusicProvider 由 Root 统一挂载（要包住页面树，迷你条与音乐页 iframe 各自独立，
// 这里不再自行包裹 Provider，否则会创建第二个独立播放器实例
export const GlobalMusicPlayer: Component = () => {
  return (
    <>
      <MiniPlayer />
      <MusicPanel />
    </>
  )
}

// 旧名兼容：此前挂在首页 layout，现已迁移为全局挂载
export const FloatingMusicPlayer = GlobalMusicPlayer
