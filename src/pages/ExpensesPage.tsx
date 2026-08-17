import { PlusOutlined, UploadOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Statistic,
  Table,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { formatNaira } from '../lib/currency'
import { supabase } from '../supabase'
import type { Expense } from '../types'
import { BulkCsvImportModal, type CsvRow } from '../components/BulkCsvImportModal'
import { CurrencyInput } from '../components/CurrencyInput'

type Values = { category: string[]; description: string; amount: number; spentAt: Dayjs }
export function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [api, holder] = message.useMessage()
  const [form] = Form.useForm<Values>()
  const load = async () => {
    if (!supabase) return
    const [{ data: expenseRows, error }, { data: categoryRows }] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, description, amount_kobo, spent_at, created_at, expense_categories(name)')
        .order('spent_at', { ascending: false })
        .limit(500),
      supabase.from('expense_categories').select('name').order('name'),
    ])
    if (error) {
      api.error(error.message)
      return
    }
    setExpenses(
      (expenseRows ?? []).map((row) => {
        const category = Array.isArray(row.expense_categories)
          ? row.expense_categories[0]
          : row.expense_categories
        return {
          id: row.id,
          category: category?.name ?? 'Uncategorised',
          description: row.description,
          amount: row.amount_kobo / 100,
          spentAt: row.spent_at,
          createdAt: row.created_at,
        }
      }),
    )
    setCategories((categoryRows ?? []).map((row) => row.name))
  }
  useEffect(() => {
    void load()
  }, [])
  const today = new Date().toISOString().slice(0, 10)
  const todayTotal = expenses
    .filter((expense) => expense.spentAt.slice(0, 10) === today)
    .reduce((sum, expense) => sum + expense.amount, 0)
  const month = today.slice(0, 7)
  const monthTotal = expenses
    .filter((expense) => expense.spentAt.slice(0, 7) === month)
    .reduce((sum, expense) => sum + expense.amount, 0)
  const categoryTotal = useMemo(() => new Set(expenses.map((expense) => expense.category)).size, [expenses])
  async function save(values: Values) {
    if (!supabase) {
      api.error('Expenses require Supabase to be configured.')
      return
    }
    const category = values.category[0]?.trim()
    if (!category) return
    setSaving(true)
    const { error } = await supabase.rpc('record_expense', {
      p_expense: {
        id: crypto.randomUUID(),
        category_name: category,
        description: values.description.trim(),
        amount_kobo: Math.round(values.amount * 100),
        spent_at: values.spentAt.format('YYYY-MM-DD'),
      },
    })
    setSaving(false)
    if (error) {
      api.error(error.message)
      return
    }
    setOpen(false)
    form.resetFields()
    await load()
    api.success('Expense recorded.')
  }
  async function importExpenses(rows: CsvRow[]) {
    if (!supabase) throw new Error('Expenses require Supabase to be configured.')
    for (const [index, row] of rows.entries()) {
      const amount = Number(row.amount)
      if (!row.category || !row.description || !row.date || !Number.isFinite(amount) || amount <= 0)
        throw new Error(`Row ${index + 2}: category, description, date, and a positive amount are required.`)
      const { error } = await supabase.rpc('record_expense', {
        p_expense: {
          id: crypto.randomUUID(),
          category_name: row.category,
          description: row.description,
          amount_kobo: Math.round(amount * 100),
          spent_at: row.date,
        },
      })
      if (error) throw new Error(`Row ${index + 2}: ${error.message}`)
    }
    await load()
    api.success(`${rows.length} expense record${rows.length === 1 ? '' : 's'} imported.`)
  }
  return (
    <div className="space-y-6">
      {holder}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="mb-1 text-xl font-semibold text-slate-900">Expense management</h2>
          <p className="mb-0 text-sm text-slate-500">
            Record operational spending and categorise it for reporting.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="large" icon={<UploadOutlined />} onClick={() => setBulkOpen(true)}>
            Bulk upload
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => {
              form.setFieldsValue({ spentAt: dayjs() })
              setOpen(true)
            }}
          >
            Add expense
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Statistic
            title="Expenses today"
            value={todayTotal}
            formatter={(value) => formatNaira(Number(value))}
            valueStyle={{ color: '#b45309' }}
          />
        </Card>
        <Card>
          <Statistic
            title="Expenses this month"
            value={monthTotal}
            formatter={(value) => formatNaira(Number(value))}
          />
        </Card>
        <Card>
          <Statistic title="Expense categories used" value={categoryTotal} />
        </Card>
      </div>
      <Card title="Expense register">
        <Table
          rowKey="id"
          dataSource={expenses}
          pagination={{ pageSize: 12 }}
          scroll={{ x: 760 }}
          columns={[
            {
              title: 'Date',
              dataIndex: 'spentAt',
              render: (value: string) =>
                new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-NG', {
                  dateStyle: 'medium',
                }),
            },
            { title: 'Category', dataIndex: 'category' },
            { title: 'Description', dataIndex: 'description' },
            {
              title: 'Amount',
              dataIndex: 'amount',
              render: (value: number) => <strong>{formatNaira(value)}</strong>,
            },
          ]}
          locale={{ emptyText: 'No expenses recorded yet.' }}
        />
      </Card>
      <Modal
        open={open}
        title="Add expense"
        okText="Save expense"
        confirmLoading={saving}
        onCancel={() => setOpen(false)}
        onOk={() => void form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item
            name="category"
            label="Expense category"
            extra="Choose a category or type a new one."
            rules={[{ required: true, message: 'Choose or add a category.' }]}
          >
            <Select
              mode="tags"
              maxCount={1}
              showSearch
              options={categories.map((category) => ({ value: category, label: category }))}
              placeholder="e.g. Transport, Utilities"
            />
          </Form.Item>
          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Describe this expense.' }]}
          >
            <Input placeholder="What was paid for?" size="large" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="amount" label="Amount (₦)" rules={[{ required: true }]}>
              <CurrencyInput min={0.01} precision={2} size="large" className="w-full" />
            </Form.Item>
            <Form.Item name="spentAt" label="Expense date" rules={[{ required: true }]}>
              <DatePicker className="w-full" format="DD MMM YYYY" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
      <BulkCsvImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk upload expenses"
        templateName="kroniqos-expenses-sample.csv"
        template={
          'date,category,description,amount\n2026-08-01,Transport,Delivery fuel,12500\n2026-08-02,Utilities,Generator diesel,35000'
        }
        guidance="Use one row per expense. Amount is in Naira, without currency symbols."
        onImport={importExpenses}
      />
    </div>
  )
}
