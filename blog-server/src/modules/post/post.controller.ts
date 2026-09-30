import { Controller, Get, Param, Query } from '@nestjs/common'

import { PostService } from './post.service'

@Controller()
export class PostController {
  constructor(private readonly service: PostService) {}

  // 文章分页列表
  @Get('posts')
  getList(@Query() query: Record<string, any>) {
    return this.service.getList(query)
  }

  // 分类 → 最新文章完整 URL 重定向
  @Get('posts/get-url/:category')
  getFullUrl(@Param('category') category: string) {
    return this.service.getFullUrl(category)
  }

  // 文章详情（/posts/{category}/{slug}）
  @Get('posts/:category/:slug')
  getBySlug(
    @Param('category') category: string,
    @Param('slug') slug: string,
    @Query('password') password?: string,
  ) {
    return this.service.getByCategoryAndSlug(category, slug, password)
  }

  // 标签列表（?type=1）
  @Get('categories')
  getCategories(@Query('type') type?: string) {
    return this.service.getCategories(type === undefined || type === '' ? undefined : Number(type))
  }

  // 分类下的文章（分类页/标签筛选兜底，前端少用）
  @Get('categories/:name')
  getCategoryDetail(@Param('name') name: string, @Query('tag') tag?: string) {
    return this.service.getCategoryDetail(name, tag === '1')
  }
}
