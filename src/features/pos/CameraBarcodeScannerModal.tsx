import { ScanOutlined } from '@ant-design/icons'
import { Alert, Button, Modal, Space, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'

type BarcodeDetectorInstance = { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> }
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance
type BarcodeWindow = Window & typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }

type Props = { open: boolean; onClose: () => void; onScan: (barcode: string) => void }

export function CameraBarcodeScannerModal({ open, onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    let stream: MediaStream | undefined
    let scanTimer: number | undefined
    let scanning = false
    const Detector = (window as BarcodeWindow).BarcodeDetector
    if (!Detector) { setError('Camera barcode scanning is not supported by this browser. Use Chrome on Android, or enter the code manually.'); return }

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const detector = new Detector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] })
        scanTimer = window.setInterval(() => { void (async () => {
          const video = videoRef.current
          if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || scanning) return
          scanning = true
          try {
            const codes = await detector.detect(video as unknown as ImageBitmapSource)
            if (codes[0]?.rawValue) { onScan(codes[0].rawValue); onClose() }
          } catch { /* Keep scanning while the camera focuses. */ } finally { scanning = false }
        })() }, 350)
      } catch {
        setError('We could not access the camera. Allow camera access and try again.')
      }
    })()

    return () => { if (scanTimer) window.clearInterval(scanTimer); stream?.getTracks().forEach((track) => track.stop()) }
  }, [onClose, onScan, open])

  return <Modal title="Scan barcode" open={open} footer={<Button onClick={onClose}>Cancel</Button>} onCancel={onClose} destroyOnClose>
    <div className="space-y-3"><div className="overflow-hidden bg-black"><video ref={videoRef} className="block aspect-video w-full object-cover" muted playsInline /></div><Space><ScanOutlined /><Typography.Text>Point the camera at the barcode.</Typography.Text></Space>{error && <Alert type="warning" showIcon message={error} />}</div>
  </Modal>
}
