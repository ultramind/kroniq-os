import { CheckCircleOutlined, PrinterOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Select, Space, message } from 'antd'
import { useState } from 'react'
import {
  findSystemPrinters,
  getPrinterSettings,
  printTestReceipt,
  savePrinterSettings,
  type PrinterSettings,
} from '../../lib/directPrint'

export function PrinterSettingsPanel() {
  const [api, holder] = message.useMessage()
  const [settings, setSettings] = useState<PrinterSettings>(() => getPrinterSettings())
  const [printers, setPrinters] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)

  const discover = async () => {
    setLoading(true)
    try {
      const names = await findSystemPrinters()
      setPrinters(names)
      if (!names.length) api.warning('No system printers were found.')
      else api.success(`${names.length} printer${names.length === 1 ? '' : 's'} found.`)
    } catch (error) {
      api.warning(
        error instanceof Error
          ? `Could not connect to QZ Tray. Ensure it is running, then click Find printers and allow your browser’s local-network prompt. (${error.message})`
          : 'Could not connect to QZ Tray.',
      )
    } finally {
      setLoading(false)
    }
  }

  const update = (next: PrinterSettings) => {
    setSettings(next)
    savePrinterSettings(next)
  }

  const test = async () => {
    if (!settings.printerName) {
      api.warning('Select a printer first.')
      return
    }
    setTesting(true)
    try {
      await printTestReceipt(settings.printerName, settings.paperWidth)
      api.success('Test receipt sent to the printer.')
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not print the test receipt.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card title="Desktop direct printing" className="max-w-2xl">
      {holder}
      <Alert
        className="mb-5"
        type="warning"
        showIcon
        message="Optional: for Windows and macOS cashier computers"
        description="This bypasses the browser print screen using QZ Tray. Pair Bluetooth printers with the computer first, then click Find printers and allow the browser’s local-network permission. Android devices should use the normal Print receipt or Share receipt actions."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">System printer</label>
          <Select
            className="w-full"
            placeholder="Select a printer"
            value={settings.printerName}
            loading={loading}
            options={printers.map((printer) => ({ value: printer, label: printer }))}
            onChange={(printerName) => update({ ...settings, printerName })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Receipt paper size</label>
          <Select
            className="w-full"
            value={settings.paperWidth}
            options={[
              { value: '80mm', label: '80 mm thermal receipt' },
              { value: '58mm', label: '58 mm thermal receipt' },
            ]}
            onChange={(paperWidth) => update({ ...settings, paperWidth })}
          />
        </div>
      </div>
      <Space wrap className="mt-5">
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void discover()}>
          Find printers
        </Button>
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          loading={testing}
          disabled={!settings.printerName}
          onClick={() => void test()}
        >
          Print test receipt
        </Button>
        {settings.printerName && (
          <span className="text-xs text-slate-500">
            <CheckCircleOutlined /> Saved for this device
          </span>
        )}
      </Space>
    </Card>
  )
}
