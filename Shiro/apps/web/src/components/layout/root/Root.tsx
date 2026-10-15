import { ClientOnly } from '~/components/common/ClientOnly'
import { FABContainer } from '~/components/ui/fab'
import { GlobalMusicPlayer } from '~/components/modules/music/FloatingMusicPlayer'
import { MineradioStageHost } from '~/components/modules/music/MineradioStageHost'
import { MusicProvider } from '~/components/modules/music/MusicProvider'
import { ContentUpdateListener } from '~/components/modules/shared/ContentUpdateListener'
import { SearchPalette } from '~/components/modules/shared/SearchPalette'

import { Content } from '../content/Content'
import { Footer } from '../footer'
import { Header } from '../header'
import { RootDataAttributeBinder } from './RootDataAttributeBinder'

export const Root: Component = ({ children }) => (
  // MusicProvider 必须包住整棵页面树：/music 沉浸页与全局迷你条共享同一个 Audio 实例，
  // 音乐在路由切换时才能不断播
  <MusicProvider>
    <Header />
    {/* 全站搜索命令面板（Ctrl/Cmd+K 或点头部放大镜呼出） */}
    <SearchPalette />
    <Content>{children}</Content>

    <Footer />
    <ClientOnly>
      {/* 内容热更新：订阅后端 SSE，后台改动自动失效缓存并刷新 RSC，访客免手动刷新 */}
      <ContentUpdateListener />
      {/* 全局音乐迷你条：跨路由常驻，音乐页(/music)自动隐藏让位沉浸舞台 */}
      <GlobalMusicPlayer />
      {/* Mineradio 舞台宿主：进过 /music 后 iframe 常驻，切页音乐不断播 */}
      <MineradioStageHost />
      <FABContainer />
      <RootDataAttributeBinder />
    </ClientOnly>
  </MusicProvider>
)
