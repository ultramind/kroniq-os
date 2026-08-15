import { DeleteOutlined } from '@ant-design/icons'
import { Button, Popconfirm, message } from 'antd'
import { useState } from 'react'
import { supabase } from '../../supabase'
import { functionErrorMessage } from '../../lib/functionError'

export function RemoveStarterCatalogue() {
  const [saving, setSaving] = useState(false)
  const [api, holder] = message.useMessage()
  const remove = async () => {
    if (!supabase) return
    setSaving(true)
    const { data, error } = await supabase.functions.invoke<{ removed: number; archived: number }>('remove-starter-catalogue')
    setSaving(false)
    if (error) { api.error(await functionErrorMessage(error, 'Could not remove sample products.')); return }
    api.success(`${data?.removed ?? 0} sample product(s) removed${data?.archived ? `; ${data.archived} sold sample product(s) archived.` : '.'}`)
    window.location.reload()
  }
  return <>{holder}<Popconfirm title="Remove sample products?" description="Unused samples will be deleted. Samples already used in sales will be archived to preserve history." okText="Remove samples" okButtonProps={{ danger: true }} onConfirm={() => void remove()}><Button danger icon={<DeleteOutlined />} loading={saving}>Remove sample products</Button></Popconfirm></>
}
