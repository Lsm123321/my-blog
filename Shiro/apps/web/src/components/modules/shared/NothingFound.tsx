import { I18nText } from '~/components/ui/I18nText'
import { EmptyIcon } from '~/components/icons/empty'
import { NormalContainer } from '~/components/layout/container/Normal'

export const NothingFound: Component = () => (
  <NormalContainer className="center flex h-[500px] flex-col space-y-4 [&_p]:my-4">
    <EmptyIcon />
    <p><I18nText ns="common" k="nothing_here" /></p>
    <p><I18nText ns="common" k="empty_comeback" /></p>
  </NormalContainer>
)
