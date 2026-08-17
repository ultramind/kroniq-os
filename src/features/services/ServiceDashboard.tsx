import { Card, Skeleton, Statistic, Table, Tag } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { formatNaira } from '../../lib/currency'
import { supabase } from '../../supabase'

type Project = {
  id: string
  title: string
  quoted_amount_kobo: number
  due_at?: string | null
  status: 'open' | 'completed' | 'cancelled'
  payments?: { amount_kobo: number }[]
}
type Payment = { amount_kobo: number }
type Expense = { amount_kobo: number }
const meta = (project: Project) =>
  project.status === 'completed'
    ? { label: 'Completed', color: 'green' }
    : project.status === 'cancelled'
      ? { label: 'Cancelled', color: 'default' }
      : project.due_at && new Date(project.due_at).getTime() < Date.now()
        ? { label: 'Overdue', color: 'red' }
        : { label: 'Ongoing', color: 'blue' }

export function ServiceDashboard({ start, end }: { start: string; end: string }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [periodPayments, setPeriodPayments] = useState<Payment[]>([])
  const [periodExpenses, setPeriodExpenses] = useState<Expense[]>([])
  useEffect(() => {
    void (async () => {
      if (!supabase) {
        setLoading(false)
        return
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: profile } = user
        ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle()
        : { data: null }
      if (!profile) {
        setLoading(false)
        return
      }
      const { data: store } = await supabase
        .from('stores')
        .select('organization_id')
        .eq('id', profile.store_id)
        .maybeSingle()
      const { data: organization } = store
        ? await supabase
            .from('organizations')
            .select('business_modes')
            .eq('id', store.organization_id)
            .maybeSingle()
        : { data: null }
      if (!organization?.business_modes?.includes('services')) {
        setLoading(false)
        return
      }
      setEnabled(true)
      const [projectResult, paymentResult, expenseResult] = await Promise.all([
        supabase
          .from('service_jobs')
          .select('id,title,quoted_amount_kobo,due_at,status,payments:project_payments(amount_kobo)')
          .eq('store_id', profile.store_id)
          .order('created_at', { ascending: false }),
        supabase
          .from('project_payments')
          .select('amount_kobo')
          .eq('store_id', profile.store_id)
          .gte('received_at', `${start}T00:00:00`)
          .lte('received_at', `${end}T23:59:59`),
        supabase
          .from('project_expenses')
          .select('amount_kobo')
          .eq('store_id', profile.store_id)
          .gte('spent_at', start)
          .lte('spent_at', end),
      ])
      setProjects((projectResult.data ?? []) as Project[])
      setPeriodPayments((paymentResult.data ?? []) as Payment[])
      setPeriodExpenses((expenseResult.data ?? []) as Expense[])
      setLoading(false)
    })()
  }, [start, end])
  const totals = useMemo(() => {
    const active = projects.filter((project) => project.status === 'open')
    const overdue = active.filter(
      (project) => project.due_at && new Date(project.due_at).getTime() < Date.now(),
    )
    const contract = projects
      .filter((project) => project.status !== 'cancelled')
      .reduce((sum, project) => sum + project.quoted_amount_kobo, 0)
    const paid = projects.reduce(
      (sum, project) =>
        sum +
        (project.payments ?? []).reduce((paymentTotal, payment) => paymentTotal + payment.amount_kobo, 0),
      0,
    )
    return {
      active: active.length,
      overdue: overdue.length,
      contract,
      paid,
      balance: Math.max(0, contract - paid),
      payments: periodPayments.reduce((sum, payment) => sum + payment.amount_kobo, 0),
      expenses: periodExpenses.reduce((sum, expense) => sum + expense.amount_kobo, 0),
    }
  }, [periodExpenses, periodPayments, projects])
  if (loading)
    return (
      <Card className="mt-6" title="Service performance">
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    )
  if (!enabled) return null
  return (
    <section className="space-y-5">
      <div>
        <h3 className="mb-1 text-lg font-semibold text-slate-900">Service performance</h3>
        <p className="mb-0 text-sm text-slate-500">
          Projects, collections, balances, and costs for the selected period.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <Statistic title="Ongoing projects" value={totals.active} />
        </Card>
        <Card>
          <Statistic
            title="Overdue projects"
            value={totals.overdue}
            valueStyle={{ color: totals.overdue ? '#dc2626' : undefined }}
          />
        </Card>
        <Card>
          <Statistic
            title="Payments received"
            value={totals.payments / 100}
            formatter={(value) => formatNaira(Number(value))}
          />
        </Card>
        <Card>
          <Statistic
            title="Project expenses"
            value={totals.expenses / 100}
            formatter={(value) => formatNaira(Number(value))}
          />
        </Card>
        <Card>
          <Statistic
            title="Contract value"
            value={totals.contract / 100}
            formatter={(value) => formatNaira(Number(value))}
          />
        </Card>
        <Card>
          <Statistic
            title="Total received"
            value={totals.paid / 100}
            formatter={(value) => formatNaira(Number(value))}
          />
        </Card>
        <Card>
          <Statistic
            title="Outstanding balance"
            value={totals.balance / 100}
            formatter={(value) => formatNaira(Number(value))}
          />
        </Card>
        <Card>
          <Statistic
            title="Collections less expenses"
            value={(totals.payments - totals.expenses) / 100}
            formatter={(value) => formatNaira(Number(value))}
          />
        </Card>
      </div>
      <Card title="Project status">
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 5 }}
          dataSource={projects}
          columns={[
            { title: 'Project', dataIndex: 'title' },
            {
              title: 'Contract value',
              dataIndex: 'quoted_amount_kobo',
              render: (value: number) => formatNaira(value / 100),
            },
            {
              title: 'Outstanding',
              render: (_, project: Project) =>
                formatNaira(
                  Math.max(
                    0,
                    project.quoted_amount_kobo -
                      (project.payments ?? []).reduce((sum, payment) => sum + payment.amount_kobo, 0),
                  ) / 100,
                ),
            },
            {
              title: 'Status',
              render: (_, project: Project) => {
                const status = meta(project)
                return <Tag color={status.color}>{status.label}</Tag>
              },
            },
          ]}
          locale={{ emptyText: 'No service projects yet.' }}
        />
      </Card>
    </section>
  )
}
