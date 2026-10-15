import { Global, Module } from '@nestjs/common'

import { EventsController } from './events.controller'
import { EventsService } from './events.service'

// @Global：广播服务要被全局拦截器（AdminBroadcastInterceptor）注入，
// 全局模块免去逐个 import
@Global()
@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
