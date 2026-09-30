import { Module } from '@nestjs/common'

import { AiService } from '../ai/ai.service'
import { MusicModule } from '../music/music.module'
import { AdminController } from './admin.controller'
import { AdminMusicController } from './admin-music.controller'
import { AdminAuthService } from './admin-auth.service'
import { AdminGuard } from './admin.guard'

@Module({
  // 引入 MusicModule 以便管理端注入 QqMusicService（收录 QQ 音乐用）
  imports: [MusicModule],
  controllers: [AdminController, AdminMusicController],
  providers: [AdminAuthService, AdminGuard, AiService],
})
export class AdminModule {}
