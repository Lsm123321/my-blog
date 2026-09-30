import type { FC } from 'react'

import { I18nText } from '~/components/ui/I18nText'

export const BizErrorPage: FC<{
  bizMessage: string
  status: number
}> = ({ bizMessage, status }) => (
  <div className="center flex min-h-[calc(100vh-10rem)] flex-col">
    <h2 className="mb-5 flex flex-col gap-2 text-center">
      <p><I18nText ns="error" k="biz_error_title" /></p>
      <p>
        HTTP Status: <strong>{status}</strong>
      </p>
      <p>
        <I18nText ns="error" k="biz_error_prefix" /> <strong>{bizMessage}</strong>
      </p>
    </h2>
  </div>
)
