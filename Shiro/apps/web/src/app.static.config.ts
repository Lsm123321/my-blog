export const appStaticConfig = {
  cache: {
    enabled: true,

    ttl: {
      aggregation: 3600,
    },
  },

  revalidate: 1000 * 10, // 10s
}

// 站点专属 CDN 域名（用于 RSS 图片过滤等），未配置则留空
export const CDN_HOST = ''
export const TENCENT_CDN_DOMAIN = CDN_HOST
