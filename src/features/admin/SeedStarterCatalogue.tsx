import { DatabaseOutlined } from '@ant-design/icons'
import { Button, Popconfirm, message } from 'antd'
import { useState } from 'react'
import { supabase } from '../../supabase'
import { functionErrorMessage } from '../../lib/functionError'

export function SeedStarterCatalogue() {
  const [saving, setSaving] = useState(false)
  const [api, holder] = message.useMessage()
  const seed = async () => {
    if (!supabase) return
    setSaving(true)
    const { data, error } = await supabase.functions.invoke<{ seeded: number }>('seed-starter-catalogue')
    setSaving(false)
    if (error) {
      api.error(await functionErrorMessage(error, 'Could not add starter products.'))
      return
    }
    api.success(`${data?.seeded ?? 20} starter products added. Reloading catalogue…`)
    window.setTimeout(() => window.location.reload(), 800)
  }
  return (
    <>
      {holder}
      <Popconfirm
        title="Add 20 starter products?"
        description="This works only when your catalogue is empty."
        okText="Add products"
        onConfirm={() => void seed()}
      >
        <Button icon={<DatabaseOutlined />} loading={saving}>
          Add 20 starter products
        </Button>
      </Popconfirm>
    </>
  )
}
