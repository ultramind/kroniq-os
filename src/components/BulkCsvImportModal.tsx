import { DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, Button, Modal, Table, Upload } from 'antd'
import { useState } from 'react'

export type CsvRow = Record<string, string>

function parseCsv(text: string): CsvRow[] {
  const rows = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((row) => row.trim())
  if (rows.length < 2) return []
  const split = (line: string) => {
    const cells: string[] = []
    let value = ''
    let quoted = false
    for (let index = 0; index < line.length; index++) {
      const character = line[index]
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          value += '"'
          index++
        } else quoted = !quoted
      } else if (character === ',' && !quoted) {
        cells.push(value.trim())
        value = ''
      } else value += character
    }
    cells.push(value.trim())
    return cells
  }
  const headers = split(rows[0]).map((header) => header.trim().toLowerCase())
  return rows
    .slice(1)
    .map(split)
    .filter((cells) => cells.some(Boolean))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
}

function downloadCsv(filename: string, content: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

type Props = {
  open: boolean
  title: string
  templateName: string
  template: string
  guidance: string
  onClose: () => void
  onImport: (rows: CsvRow[]) => Promise<void>
}
export function BulkCsvImportModal({
  open,
  title,
  templateName,
  template,
  guidance,
  onClose,
  onImport,
}: Props) {
  const [rows, setRows] = useState<CsvRow[]>([])
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const close = () => {
    setRows([])
    setError(undefined)
    onClose()
  }
  const selectFile = async (file: File) => {
    try {
      const parsed = parseCsv(await file.text())
      if (!parsed.length)
        throw new Error('The file has no data rows. Download the sample CSV and keep its header row.')
      setRows(parsed)
      setError(undefined)
    } catch (reason) {
      setRows([])
      setError(reason instanceof Error ? reason.message : 'Could not read this CSV file.')
    }
    return false
  }
  return (
    <Modal
      open={open}
      title={title}
      width={760}
      okText={`Import ${rows.length || ''} records`}
      okButtonProps={{ disabled: !rows.length }}
      confirmLoading={saving}
      onCancel={close}
      onOk={() =>
        void (async () => {
          setSaving(true)
          try {
            await onImport(rows)
            close()
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Import failed.')
          } finally {
            setSaving(false)
          }
        })()
      }
    >
      <div className="space-y-4">
        <Alert type="warning" showIcon message="CSV import" description={guidance} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button icon={<DownloadOutlined />} onClick={() => downloadCsv(templateName, template)}>
            Download sample CSV
          </Button>
          <Upload
            accept=".csv,text/csv"
            maxCount={1}
            beforeUpload={selectFile}
            onRemove={() => {
              setRows([])
              setError(undefined)
            }}
          >
            <Button icon={<UploadOutlined />}>Choose CSV file</Button>
          </Upload>
        </div>
        {error && <Alert type="error" showIcon message={error} />}
        {rows.length > 0 && (
          <>
            <Alert
              type="success"
              showIcon
              message={`${rows.length} row${rows.length === 1 ? '' : 's'} ready to import`}
            />
            <Table
              size="small"
              rowKey={(_, index) => String(index)}
              dataSource={rows.slice(0, 5)}
              pagination={false}
              scroll={{ x: 640 }}
              columns={Object.keys(rows[0]).map((key) => ({
                title: key.replaceAll('_', ' '),
                dataIndex: key,
                key,
              }))}
            />
          </>
        )}
      </div>
    </Modal>
  )
}
