import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, Form, Input, InputNumber, Statistic, Typography, message } from 'antd'
import { db } from '../db'
import { formatNaira } from '../lib/currency'
import { CurrencyInput } from '../components/CurrencyInput'
import { closeShift, openShift } from '../features/shifts/shift.service'
import type { CashShift } from '../types'

const { Text } = Typography
export function ShiftsPage({ activeShift, onChanged }: { activeShift?: CashShift; onChanged: () => void }) {
  const [api, holder] = message.useMessage()
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ amount: number; varianceReason?: string }>()
  const sales = useLiveQuery(() => db.sales.toArray(), []) ?? []
  const cashSales = useMemo(
    () =>
      activeShift
        ? sales
            .filter(
              (sale) =>
                sale.paymentMethod === 'cash' && !sale.returnedAt && sale.createdAt >= activeShift.openedAt,
            )
            .reduce((total, sale) => total + sale.total, 0)
        : 0,
    [activeShift, sales],
  )
  const expectedCash = activeShift ? activeShift.openingCash + cashSales : 0
  const closingAmount = Form.useWatch('amount', form)
  const variance = activeShift && typeof closingAmount === 'number' ? closingAmount - expectedCash : undefined
  async function submit({ amount, varianceReason }: { amount: number; varianceReason?: string }) {
    setSaving(true)
    try {
      if (activeShift) await closeShift(activeShift, amount, varianceReason?.trim())
      else await openShift(amount)
      api.success(activeShift ? 'Shift closed and cash variance recorded.' : 'Cash shift opened.')
      form.resetFields()
      onChanged()
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not update shift.')
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      {holder}
      <Card title="Cash shift">
        <Text type="secondary">
          {activeShift
            ? `Opened ${new Date(activeShift.openedAt).toLocaleString('en-NG')}`
            : 'No active shift. Open one before starting the till.'}
        </Text>
        {activeShift && (
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Statistic
              title="Opening cash"
              value={activeShift.openingCash}
              formatter={(value) => formatNaira(Number(value))}
            />
            <Statistic
              title="Cash sales"
              value={cashSales}
              formatter={(value) => formatNaira(Number(value))}
            />
            <Statistic
              title="Expected cash"
              value={expectedCash}
              formatter={(value) => formatNaira(Number(value))}
            />
          </div>
        )}
        <Form form={form} layout="vertical" className="mt-6 max-w-sm" onFinish={submit}>
          <Form.Item
            name="amount"
            label={activeShift ? 'Cash counted at close (₦)' : 'Opening cash float (₦)'}
            rules={[{ required: true }]}
          >
            <CurrencyInput min={0} precision={2} size="large" className="w-full" />
          </Form.Item>
          {activeShift && variance !== undefined && (
            <div
              className={`mb-4 border p-3 text-sm ${variance === 0 ? 'border-slate-200' : 'border-amber-300 bg-amber-50'}`}
            >
              Variance: <strong>{formatNaira(variance)}</strong>
              {variance !== 0 && ' — enter an explanation before closing.'}
            </div>
          )}
          {activeShift && variance !== undefined && variance !== 0 && (
            <Form.Item
              name="varianceReason"
              label="Variance explanation"
              rules={[{ required: true, message: 'Explain the cash shortage or overage.' }]}
            >
              <Input.TextArea rows={2} placeholder="e.g. cash drawer shortage / extra cash found" />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" size="large" loading={saving}>
            {activeShift ? 'Close shift' : 'Open shift'}
          </Button>
        </Form>
      </Card>
    </>
  )
}
