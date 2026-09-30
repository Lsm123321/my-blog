'use client'

import { m, AnimatePresence } from 'motion/react'
import Image from 'next/image'
import { useEffect, useRef } from 'react'
import type { JSX } from 'react'

import {
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

// ---------- 歌单 + 歌词面板 ----------
const MusicPanel: Component = () => {
  const pathname = usePathname()
  const expanded = useMusicExpanded()
  const started = useMusicStarted()
  const { track, index } = useMusicCurrent()
  const playlist = useMusicPlaylist().data || []
  const controls = useMusicControls()
  const playing = useMusicPlaying()
  const { current, duration } = useMusicProgress()
  const playMode = useMusicPlayMode()
  const volume = useMusicVolume()
  const { audioRef } = controls

  // 歌词：随曲目拉取
  const lyrics = useLyricQuery(track?.id)
  const activeLyricIndex = findActiveLyricIndex(lyrics, current)

  // 当前行自动滚动到可视区
  const activeLyricRef = useRef<HTMLParagraphElement | null>(null)
  useEffect(() => {
    activeLyricRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeLyricIndex])

  const cyclePlayMode = () => {
    const order: PlayMode[] = ['list', 'one', 'random']
    const nextMode = order[(order.indexOf(playMode) + 1) % order.length]
    if (audioRef.current) {
      audioRef.current.loop = nextMode === 'one'
    }
    controls.setPlayMode(nextMode)
  }

  // 音乐页由 Mineradio 全屏接管，此面板只在其余页面出现
  const hiddenByRoute = pathname.startsWith('/music')

  return (
    <AnimatePresence>
      {expanded && started && !hiddenByRoute && (
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
                  onChange={(e) => controls.seek(+e.target.value)}
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
                    onClick={() => controls.seek(line.time)}
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
              onClick={cyclePlayMode}
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
              onChange={(e) => controls.setVolume(+e.target.value)}
              className="range range-xs h-1 flex-1 accent-accent"
              aria-label="音量"
            />
          </div>

          {/* 播放列表 */}
          <ul className="mt-2 max-h-48 overflow-y-auto border-t border-zinc-900/5 py-2 dark:border-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {playlist.map((t, i) => (
              <li key={t.id}>
                <button
                  onClick={() => controls.play(i)}
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

// 封面兜底：本地收录/部分曲目没有封面（cover 为空串），空 src 会让 next/image 报错，改渲染音符占位
const CoverImage: Component<{ src: string; alt: string; sizes: string }> = ({ src, alt, sizes }) =>
  src ? (
    <Image src={src} alt={alt} fill sizes={sizes} referrerPolicy="no-referrer" className="object-cover" />
  ) : (
    <span className="absolute inset-0 flex items-center justify-center bg-zinc-300/70 text-zinc-500 dark:bg-zinc-600/60 dark:text-zinc-300">
      <i className="i-mingcute-music-2-fill text-lg" />
    </span>
  )

// ---------- 迷你悬浮条 ----------
const MiniPlayer: Component = () => {
  const pathname = usePathname()
  const { track } = useMusicCurrent()
  const playing = useMusicPlaying()
  const expanded = useMusicExpanded()
  const started = useMusicStarted()
  const controls = useMusicControls()
  const togglePanel = useMusicPanelToggle()

  // 「收回」语义：本轮会话开始播放过才出现（未播放前整体收起，不占屏幕）；
  // 出现后在所有页面固定同一位置常驻；/music 由 Mineradio 全屏接管，迷你条让位
  if (!track || !started || pathname.startsWith('/music')) return null

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
        onClick={controls.toggle}
        whileTap={{ scale: 0.9 }}
        className="relative size-10 shrink-0 overflow-hidden rounded-full ring-1 ring-zinc-900/10 dark:ring-white/10"
      >
        <CoverImage src={track.cover} alt={track.name} sizes="40px" />
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
        <p className="truncate text-xs font-medium">{track.name}</p>
        <p className="truncate text-[10px] opacity-60">{track.artist}</p>
      </button>

      <MotionIconButton label="上一首" icon="i-mingcute-skip-previous-line" onClick={controls.prev} />
      <MotionIconButton
        label={playing ? '暂停' : '播放'}
        icon={playing ? 'i-mingcute-pause-line' : 'i-mingcute-play-fill'}
        onClick={controls.toggle}
      />
      <MotionIconButton label="下一首" icon="i-mingcute-skip-forward-line" onClick={controls.next} />

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
