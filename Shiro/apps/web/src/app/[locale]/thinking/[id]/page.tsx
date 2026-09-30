import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'

import { CommentBoxRootLazy, CommentsLazy } from '~/components/modules/comment'
import { MotionButtonBase } from '~/components/ui/button'
import { Link } from '~/i18n/navigation'
import { apiClient } from '~/lib/request'

import { ThinkingItem } from '../item'

export default async function Page(props: {
  params: Promise<{
    id: string
  }>
}) {
  const params = await props.params
  const data = await apiClient.recently.getById(params.id)
  const t = await getTranslations('common')

  return (
    <div>
      <header className="prose">
        <h1 className="flex items-end gap-2">
          {t('nav_thinking')}
          <a
            data-event="Say RSS click"
            aria-hidden
            href="/thinking/feed"
            target="_blank"
            className="center flex size-8 select-none text-[#EE802F]"
            rel="noreferrer"
          >
            <i className="i-mingcute-rss-fill" />
          </a>
        </h1>
        <h3>{t('thinking_thanks')}</h3>
      </header>

      <main className="-mt-12">
        <MotionButtonBase>
          <Link
            href="/thinking"
            className="flex items-center gap-2"
            data-event="Say back click"
          >
            <i className="i-mingcute-arrow-left-circle-line" />
            {t('actions_back')}
          </Link>
        </MotionButtonBase>
        <ThinkingItem item={data.$serialized} />

        {data.allowComment && (
          <Suspense>
            <CommentBoxRootLazy className="mb-12 mt-6" refId={data.id} />
            <CommentsLazy refId={data.id} />
          </Suspense>
        )}
      </main>
    </div>
  )
}
