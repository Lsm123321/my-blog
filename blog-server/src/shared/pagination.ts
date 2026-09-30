// 全站统一分页响应格式（对齐 mx-space PaginateResult）
export interface Pager {
  total: number
  size: number
  currentPage: number
  totalPage: number
  hasPrevPage: boolean
  hasNextPage: boolean
}

export interface PaginateResult<T> {
  data: T[]
  pagination: Pager
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  size: number,
): PaginateResult<T> {
  const totalPage = Math.ceil(total / size)
  return {
    data,
    pagination: {
      total,
      size,
      currentPage: page,
      totalPage,
      hasPrevPage: page > 1,
      hasNextPage: totalPage > page,
    },
  }
}

// 解析分页查询参数，带默认值与下界保护
export function pageArgs(
  query: Record<string, any>,
  defaultSize = 10,
): { page: number; size: number; skip: number; take: number } {
  const page = Math.max(parseInt(String(query.page ?? '1'), 10) || 1, 1)
  const size = Math.max(parseInt(String(query.size ?? defaultSize), 10) || defaultSize, 1)
  return { page, size, skip: (page - 1) * size, take: size }
}
