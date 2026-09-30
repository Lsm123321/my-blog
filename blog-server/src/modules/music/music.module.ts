import { Module } from '@nestjs/common'

import { MusicController } from './music.controller'
import { MusicService } from './music.service'
import { QqMusicService } from './qq-music.service'

@Module({
  controllers: [MusicController],
  providers: [MusicService, QqMusicService],
  exports: [MusicService, QqMusicService],
})
export class MusicModule {}
