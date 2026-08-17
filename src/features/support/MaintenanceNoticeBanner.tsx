import { Alert } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'

type Notice = { id: string; title: string; message: string; severity: 'info' | 'warning' | 'critical' }

export function MaintenanceNoticeBanner() {
  const [notices, setNotices] = useState<Notice[]>([])
  const load = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('maintenance_notices')
      .select('id,title,message,severity')
      .eq('status', 'active')
      .order('starts_at', { ascending: false })
    setNotices((data ?? []) as Notice[])
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  return (
    <>
      {notices.map((notice) => (
        <Alert
          key={notice.id}
          className="!rounded-none !border-x-0"
          type={notice.severity === 'critical' ? 'error' : notice.severity}
          message={notice.title}
          description={notice.message}
          banner
          showIcon
        />
      ))}
    </>
  )
}
