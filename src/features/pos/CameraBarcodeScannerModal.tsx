import { ScanOutlined } from '@ant-design/icons'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { Alert, Button, Modal, Space, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'

type Props = { open: boolean; onClose: () => void; onScan: (barcode: string) => void }

export function CameraBarcodeScannerModal({ open, onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    let controls: IScannerControls | undefined
    let cancelled = false
    let scanned = false

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Camera access is not available in this browser. Enter the barcode manually instead.')
          return
        }
        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          videoRef.current ?? undefined,
          (result) => {
            if (!result || scanned || cancelled) return
            scanned = true
            onScan(result.getText())
            onClose()
          },
        )
        if (cancelled) controls.stop()
      } catch (cause) {
        if (!cancelled) {
          const denied = cause instanceof DOMException && cause.name === 'NotAllowedError'
          setError(denied ? 'Camera access was blocked. Allow camera access in your browser settings and try again.' : 'We could not start the camera. On iPhone or iPad, use Safari or Chrome over HTTPS and allow camera access.')
        }
      }
    })()

    return () => { cancelled = true; controls?.stop() }
  }, [onClose, onScan, open])

  return <Modal title="Scan barcode" open={open} footer={<Button onClick={onClose}>Cancel</Button>} onCancel={onClose} destroyOnClose>
    <div className="space-y-3"><div className="overflow-hidden bg-black"><video ref={videoRef} className="block aspect-video w-full object-cover" muted playsInline /></div><Space><ScanOutlined /><Typography.Text>Point the camera at the barcode.</Typography.Text></Space>{error && <Alert type="warning" showIcon message={error} />}</div>
  </Modal>
}
