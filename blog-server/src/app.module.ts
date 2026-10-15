// 模块划分：aggregate(首屏聚合) square(一言/思考/友链/项目) activity(动态流)
// misc(阅读计数/点赞/搜索) search(全站搜索) music(音乐播放/收录) admin(管理后台全部接口)
// events(SSE 内容变更广播：后台写操作 → 前台免刷新更新)
import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'

import { AdminModule } from './modules/admin/admin.module'
import { AggregateModule } from './modules/aggregate/aggregate.module'
import { ActivityModule } from './modules/activity/activity.module'
import { CommentModule } from './modules/comment/comment.module'
import { EventsModule } from './modules/events/events.module'
import { AdminBroadcastInterceptor } from './modules/events/admin-broadcast.interceptor'
import { MiscModule } from './modules/misc/misc.module'
import { MusicModule } from './modules/music/music.module'
import { NoteModule } from './modules/note/note.module'
import { PageModule } from './modules/page/page.module'
import { PostModule } from './modules/post/post.module'
import { PrismaModule } from './prisma/prisma.module'
import { SearchModule } from './modules/search/search.module'
import { SquareModule } from './modules/square/square.module'
import { OwnerModule } from './modules/owner/owner.module'

@Module({
  imports: [
    PrismaModule,
    EventsModule,
    AggregateModule,
    OwnerModule,
    PostModule,
    NoteModule,
    PageModule,
    CommentModule,
    SquareModule,
    ActivityModule,
    MiscModule,
    MusicModule,
    SearchModule,
    AdminModule,
  ],
  providers: [
    // 后台写操作成功后向 SSE 订阅者广播内容变更（前台据此免刷新更新数据）
    { provide: APP_INTERCEPTOR, useClass: AdminBroadcastInterceptor },
  ],
})
export class AppModule {}
