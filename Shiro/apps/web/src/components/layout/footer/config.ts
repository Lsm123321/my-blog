// 页脚兜底链接配置（后端 theme.footer 会覆盖此默认值）
// 站长：lsm —— GitHub 等社交链接在管理后台/Prisma Studio 的 owner.socialIds 里维护
export const defaultLinkSections: LinkSection[] = [
  {
    name: '关于',
    nameKey: 'footer_about',
    links: [
      {
        name: '关于本站',
        nameKey: 'footer_about_site',
        href: '/about-site',
      },
      {
        name: '关于我',
        nameKey: 'footer_about_me',
        href: '/about-me',
      },
      {
        // AGPL 合规：保留主题源码署名
        name: '关于此项目',
        nameKey: 'footer_about_project',
        href: 'https://github.com/Innei/Shiro',
        external: true,
      },
    ],
  },
  {
    name: '更多',
    nameKey: 'nav_more',
    links: [
      {
        name: '时间线',
        nameKey: 'page_title_timeline',
        href: '/timeline',
      },
      {
        name: '友链',
        nameKey: 'nav_friends',
        href: '/friends',
      },
    ],
  },
  {
    name: '联系',
    nameKey: 'footer_contact',
    links: [
      {
        name: '写留言',
        nameKey: 'footer_leave_message',
        href: '/message',
      },
    ],
  },
]

export interface FooterConfig {
  linkSections: LinkSection[]
  otherInfo: OtherInfo
}
