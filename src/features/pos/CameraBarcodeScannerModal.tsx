import { ScanOutlined } from '@ant-design/icons'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { Alert, Button, Modal, Space, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'

type Props = { open: boolean; onClose: () => void; onScan: (barcode: string) => void }

export function CameraBarcodeScannerModal({ open, onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!open) return
    setError('')
    let controls: IScannerControls | undefined
    let cancelled = false
    let scanned = false
    let startTimer: number | undefined

    const startCamera = async () => {
      try {
        if (!window.isSecureContext) {
          setError('Camera scanning needs HTTPS. Use the secure deployed app or localhost for local testing.')
          return
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Camera access is not available in this browser. Enter the barcode manually instead.')
          return
        }
        const video = videoRef.current
        if (!video) throw new Error('Camera preview is not ready yet.')
        const reader = new BrowserMultiFormatReader()
        controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          },
          video,
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
          setError(
            denied
              ? 'Camera access was blocked. Allow camera access in your browser settings and try again.'
              : 'We could not start the camera. On iPhone or iPad, use Safari or Chrome over HTTPS and allow camera access.',
          )
        }
      }
    }

    // Defer one frame so the Ant Design modal has mounted its video element.
    // It also prevents React Strict Mode from opening two camera streams in development.
    startTimer = window.setTimeout(() => void startCamera(), 0)

    return () => {
      cancelled = true
      if (startTimer !== undefined) window.clearTimeout(startTimer)
      controls?.stop()
    }
  }, [onClose, onScan, open, retryKey])

  return (
    <Modal
      title="Scan barcode"
      open={open}
      footer={
        <Space>
          {error && <Button onClick={() => setRetryKey((key) => key + 1)}>Try again</Button>}
          <Button onClick={onClose}>Cancel</Button>
        </Space>
      }
      onCancel={onClose}
      destroyOnClose
    >
      <div className="space-y-3">
        <div className="overflow-hidden bg-black">
          <video
            ref={videoRef}
            className="block aspect-video w-full object-cover"
            autoPlay
            muted
            playsInline
          />
        </div>
        <Space>
          <ScanOutlined />
          <Typography.Text>Point the camera at the barcode.</Typography.Text>
        </Space>
        {error && <Alert type="warning" showIcon message={error} />}
      </div>
    </Modal>
  )
}
