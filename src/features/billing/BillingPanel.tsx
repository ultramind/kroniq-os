import { CreditCardOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Empty, List, Skeleton, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatNaira } from '../../lib/currency'
import { supabase } from '../../supabase'

type Plan = {
  code: string
  name: string
  description: string
  monthly_price_kobo: number
  features: string[]
}
type Subscription = {
  id: string
  plan_code: string
  status: 'trial' | 'active' | 'past_due' | 'cancelled'
  trial_started_at?: string | null
  trial_ends_at?: string | null
  grace_period_ends_at?: string | null
  current_period_ends_at?: string | null
}
type Payment = {
  id: string
  provider_reference: string
  amount_kobo: number
  status: string
  paid_at?: string | null
  created_at: string
}
const date = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

export function BillingPanel() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscription, setSubscription] = useState<Subscription>()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutPlan, setCheckoutPlan] = useState<string>()
  const [error, setError] = useState<string>()
  const [api, holder] = message.useMessage()
  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError(undefined)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError('Please sign in again.')
      setLoading(false)
      return
    }
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('store_id')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError || !profile) {
      setError(profileError?.message ?? 'Could not find this company.')
      setLoading(false)
      return
    }
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('organization_id')
      .eq('id', profile.store_id)
      .single()
    if (storeError || !store) {
      setError(storeError?.message ?? 'Could not find the subscription.')
      setLoading(false)
      return
    }
    const [planResult, subscriptionResult, paymentResult] = await Promise.all([
      supabase
        .from('subscription_plans')
        .select('code,name,description,monthly_price_kobo,features')
        .eq('active', true)
        .order('monthly_price_kobo'),
      supabase
        .from('organization_subscriptions')
        .select(
          'id,plan_code,status,trial_started_at,trial_ends_at,grace_period_ends_at,current_period_ends_at',
        )
        .eq('organization_id', store.organization_id)
        .maybeSingle(),
      supabase
        .from('subscription_payments')
        .select('id,provider_reference,amount_kobo,status,paid_at,created_at')
        .eq('organization_id', store.organization_id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    if (planResult.error || subscriptionResult.error || paymentResult.error)
      setError(
        planResult.error?.message ??
          subscriptionResult.error?.message ??
          paymentResult.error?.message ??
          'Could not load billing.',
      )
    else {
      setPlans(planResult.data as Plan[])
      setSubscription(subscriptionResult.data as Subscription | undefined)
      setPayments(paymentResult.data as Payment[])
    }
    setLoading(false)
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  const currentPlan = useMemo(
    () => plans.find((plan) => plan.code === subscription?.plan_code),
    [plans, subscription?.plan_code],
  )
  async function startCheckout(planCode: string) {
    if (!supabase) return
    setCheckoutPlan(planCode)
    const { data, error: invokeError } = await supabase.functions.invoke('create-billing-checkout', {
      body: { planCode },
    })
    setCheckoutPlan(undefined)
    if (invokeError || !data?.authorizationUrl) {
      let detail = data?.error
      if (!detail && invokeError && 'context' in invokeError && invokeError.context instanceof Response) {
        try {
          detail = ((await invokeError.context.clone().json()) as { error?: string }).error
        } catch {
          /* The provider returned a non-JSON error. */
        }
      }
      api.error(detail ?? invokeError?.message ?? 'Could not start checkout.')
      return
    }
    window.location.assign(data.authorizationUrl)
  }
  if (loading)
    return (
      <Card title="Subscription & billing">
        <Skeleton active paragraph={{ rows: 5 }} />
      </Card>
    )
  return (
    <>
      <Card
        className="mt-6 max-w-4xl"
        title="Subscription & billing"
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
            Refresh
          </Button>
        }
      >
        {holder}
        {error && <Alert type="error" showIcon message={error} className="mb-4" />}
        <Descriptions column={{ xs: 1, sm: 2 }} size="small" className="mb-6">
          <Descriptions.Item label="Current plan">
            <Tag className="capitalize">{currentPlan?.name ?? subscription?.plan_code ?? '—'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Billing status">
            <Tag
              color={
                subscription?.status === 'active'
                  ? 'green'
                  : subscription?.status === 'past_due'
                    ? 'red'
                    : 'blue'
              }
              className="capitalize"
            >
              {subscription?.status ?? '—'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Trial started">{date(subscription?.trial_started_at)}</Descriptions.Item>
          <Descriptions.Item label="Trial ends">{date(subscription?.trial_ends_at)}</Descriptions.Item>
          <Descriptions.Item label="Grace period ends">
            {date(subscription?.grace_period_ends_at)}
          </Descriptions.Item>
          <Descriptions.Item label="Current period ends">
            {date(subscription?.current_period_ends_at)}
          </Descriptions.Item>
        </Descriptions>
        {subscription?.status === 'past_due' && (
          <Alert
            type="warning"
            showIcon
            className="mb-5"
            message={`Payment is overdue. Complete payment before ${date(subscription.grace_period_ends_at)} to keep access active.`}
          />
        )}
        <Typography.Title level={4}>Choose a plan</Typography.Title>
        <div className="grid gap-4 md:grid-cols-3">
          {plans
            .filter((plan) => plan.code !== 'enterprise')
            .map((plan) => (
              <Card
                key={plan.code}
                size="small"
                className={plan.code === subscription?.plan_code ? '!border-[#0B1121]' : ''}
              >
                <Typography.Text strong>{plan.name}</Typography.Text>
                <Typography.Paragraph type="secondary" className="mt-1 !min-h-10">
                  {plan.description}
                </Typography.Paragraph>
                <Typography.Text strong>
                  {plan.monthly_price_kobo ? `${formatNaira(plan.monthly_price_kobo / 100)} / month` : 'Free'}
                </Typography.Text>
                <List
                  size="small"
                  dataSource={plan.features.slice(0, 3)}
                  renderItem={(feature) => <List.Item>✓ {feature}</List.Item>}
                />
                <Button
                  type={plan.code === subscription?.plan_code ? 'default' : 'primary'}
                  icon={<CreditCardOutlined />}
                  disabled={plan.code === subscription?.plan_code || !plan.monthly_price_kobo}
                  loading={checkoutPlan === plan.code}
                  block
                  onClick={() => void startCheckout(plan.code)}
                >
                  {plan.code === subscription?.plan_code ? 'Current plan' : 'Pay with Paystack'}
                </Button>
              </Card>
            ))}
        </div>
      </Card>
      <Card className="mt-6 max-w-4xl" title="Payment history">
        {payments.length ? (
          <List
            dataSource={payments}
            renderItem={(payment) => (
              <List.Item>
                <List.Item.Meta
                  title={`${formatNaira(payment.amount_kobo / 100)} · ${payment.status}`}
                  description={`${date(payment.paid_at ?? payment.created_at)} · Ref ${payment.provider_reference}`}
                />
                <Tag
                  color={
                    payment.status === 'success' ? 'green' : payment.status === 'failed' ? 'red' : 'blue'
                  }
                >
                  {payment.status}
                </Tag>
              </List.Item>
            )}
          />
        ) : (
          <Empty description="No subscription payments yet." />
        )}
      </Card>
    </>
  )
}
