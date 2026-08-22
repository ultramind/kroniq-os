import { ShareAltOutlined } from '@ant-design/icons'
import { Button, message } from 'antd'

export function ShareContentButton({
  elementId,
  title,
  label = 'Share',
}: {
  elementId: string
  title: string
  label?: string
}) {
  const [api, holder] = message.useMessage()
  const share = async () => {
    const text = document.getElementById(elementId)?.innerText.trim()
    if (!text) {
      api.warning('There is no report content to share yet.')
      return
    }
    try {
      if (navigator.share) {
        await navigator.share({ title, text })
        return
      }
      await navigator.clipboard.writeText(text)
      api.success('Report copied. You can paste it into WhatsApp, SMS, or email.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      api.error('Could not share this report.')
    }
  }
  return (
    <>
      {holder}
      <Button icon={<ShareAltOutlined />} onClick={() => void share()}>
        {label}
      </Button>
    </>
  )
}
