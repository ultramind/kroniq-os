import { ArrowLeftOutlined, ArrowRightOutlined, LockOutlined, MailOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Typography, message } from 'antd'
import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'

const { Title, Text } = Typography

export function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [api, holder] = message.useMessage()

  async function submit() {
    if (!supabase || !email.trim()) {
      api.warning('Enter your work email address.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) {
      api.error(error.message)
      return
    }
    setSent(true)
  }

  return (
    <AuthFrame
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter the email address linked to your Kroniqos account."
      footer={
        <Button type="link" icon={<ArrowLeftOutlined />} className="!px-0" onClick={() => navigate('/login')}>
          Back to sign in
        </Button>
      }
    >
      {holder}
      {sent ? (
        <Alert
          type="success"
          showIcon
          message="Check your email"
          description="If an account exists for this address, we have sent a password-reset link."
        />
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="kroniq-recovery-email">
              Email address
            </label>
            <Input
              id="kroniq-recovery-email"
              size="large"
              type="email"
              inputMode="email"
              autoComplete="email"
              prefix={<MailOutlined />}
              value={email}
              placeholder="you@company.com"
              onChange={(event) => setEmail(event.target.value)}
              onPressEnter={() => void submit()}
            />
          </div>
          <Button type="primary" size="large" block loading={loading} onClick={() => void submit()}>
            Send reset link <ArrowRightOutlined />
          </Button>
        </div>
      )}
    </AuthFrame>
  )
}

export function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [api, holder] = message.useMessage()

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)))
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(Boolean(session))
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function submit() {
    if (!supabase) return
    if (password.length < 8) {
      api.warning('Use at least 8 characters for your new password.')
      return
    }
    if (password !== confirmation) {
      api.warning('The passwords do not match.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      api.error(error.message)
      return
    }
    api.success('Password updated. Sign in with your new password.')
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <AuthFrame
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Use a strong password that you do not use elsewhere."
      footer={
        <Button type="link" icon={<ArrowLeftOutlined />} className="!px-0" onClick={() => navigate('/login')}>
          Back to sign in
        </Button>
      }
    >
      {holder}
      {!ready ? (
        <Alert
          type="warning"
          showIcon
          message="Open the reset link from your email"
          description="This page needs a valid password-reset link. Request a new one if the link has expired."
          action={
            <Button size="small" onClick={() => navigate('/forgot-password')}>
              Request link
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="kroniq-new-password">
              New password
            </label>
            <Input.Password
              id="kroniq-new-password"
              size="large"
              autoComplete="new-password"
              prefix={<LockOutlined />}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="kroniq-confirm-password">
              Confirm new password
            </label>
            <Input.Password
              id="kroniq-confirm-password"
              size="large"
              autoComplete="new-password"
              prefix={<LockOutlined />}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              onPressEnter={() => void submit()}
            />
          </div>
          <Button type="primary" size="large" block loading={loading} onClick={() => void submit()}>
            Save new password
          </Button>
        </div>
      )}
    </AuthFrame>
  )
}

function AuthFrame({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f7f8fa] p-4 sm:p-6">
      <section className="w-full max-w-md border border-zinc-200 bg-white p-6 shadow-[0_24px_80px_rgb(11_17_33_/_9%)] sm:p-8">
        <Text className="!block text-xs font-bold uppercase tracking-[.18em] !text-zinc-500">{eyebrow}</Text>
        <Title level={2} className="!mb-2 !mt-3 !text-3xl !tracking-tight">
          {title}
        </Title>
        <Text type="secondary">{description}</Text>
        <div className="mt-7">{children}</div>
        <div className="mt-7 border-t border-zinc-200 pt-4">{footer}</div>
      </section>
    </main>
  )
}
