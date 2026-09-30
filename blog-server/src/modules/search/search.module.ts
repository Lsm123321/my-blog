import { Module } from '@nestjs/common'

import { SearchController } from './search.controller'

// PrismaModule 是 @Global，直接注入 PrismaService 即可
@Module({
  controllers: [SearchController],
})
export class SearchModule {}
