import {
  ArrowRightOutlined,
  BarChartOutlined,
  LockOutlined,
  ShopOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { Button, Input, Typography, message } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase'

const { Title, Text } = Typography

export function Login({ onRegister, platform }: { onRegister?: () => void; platform?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [api, contextHolder] = message.useMessage()
  const heading = platform ? 'Platform control, secured.' : 'Run your business with clarity.'
  const description = platform
    ? 'Use your Kroniqos platform administrator account.'
    : 'One workspace for sales, services, staff, payments, and operations.'

  async function signIn() {
    if (!supabase) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) api.error(error.message)
  }

  return (
    <main className="min-h-screen bg-white p-4 sm:p-6 lg:p-8">
      {contextHolder}
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden border border-zinc-200 bg-white shadow-[0_24px_80px_rgb(11_17_33_/_9%)] lg:grid-cols-[1.05fr_.95fr]">
        <section
          className="relative flex min-h-[360px] flex-col justify-between overflow-hidden bg-[#f7f8fa] p-7 sm:p-10 lg:p-14"
          style={{
            backgroundImage:
              'linear-gradient(#0B112108 1px, transparent 1px), linear-gradient(90deg, #0B112108 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        >
          <div className="relative">
            <Link
              to="/"
              aria-label="Go to Kroniqos home page"
              className="inline-flex h-10 items-center border border-[#0B1121] bg-white px-3 text-sm font-bold tracking-[.16em] text-[#0B1121]"
            >
              KRONIQOS
            </Link>
            <p className="mt-7 max-w-sm text-sm leading-6 text-zinc-500">
              Business operations for retail and service companies.
            </p>
          </div>
          <div className="relative max-w-lg">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-zinc-500">
              {platform ? 'Internal workspace' : 'Business workspace'}
            </p>
            <h1 className="m-0 text-4xl font-semibold tracking-tight text-[#0B1121] sm:text-5xl">
              {heading}
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-zinc-600">{description}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <div className="grid h-12 w-12 place-items-center border border-zinc-200 bg-white text-xl text-[#0B1121]">
                <ShopOutlined />
              </div>
              <div className="grid h-12 w-12 place-items-center border border-zinc-200 bg-white text-xl text-[#0B1121]">
                <ToolOutlined />
              </div>
              <div className="grid h-12 w-12 place-items-center border border-zinc-200 bg-white text-xl text-[#0B1121]">
                <BarChartOutlined />
              </div>
            </div>
          </div>
          <p className="relative mb-0 text-xs text-zinc-500">© {new Date().getFullYear()} Kroniqos</p>
        </section>
        <section className="flex items-center bg-white p-7 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            {platform && (
              <div className="mb-6 inline-flex items-center gap-2 border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700">
                <LockOutlined /> Platform administrator
              </div>
            )}
            <Text className="text-xs font-bold uppercase tracking-[.18em] !text-zinc-500">Welcome back</Text>
            <Title level={2} className="!mb-2 !mt-3 !text-3xl !tracking-tight">
              Sign in to Kroniqos
            </Title>
            <Text type="secondary">Enter your account details to continue.</Text>
            <div className="mt-8 space-y-4">
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium text-zinc-700"
                  htmlFor="kroniq-login-email"
                >
                  Email address
                </label>
                <Input
                  id="kroniq-login-email"
                  size="large"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium text-zinc-700"
                  htmlFor="kroniq-login-password"
                >
                  Password
                </label>
                <Input.Password
                  id="kroniq-login-password"
                  size="large"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onPressEnter={() => void signIn()}
                />
              </div>
              <Button
                type="primary"
                size="large"
                block
                loading={loading}
                icon={<ArrowRightOutlined />}
                iconPosition="end"
                onClick={() => void signIn()}
              >
                Sign in
              </Button>
            </div>
            {onRegister && (
              <div className="mt-7 border-t border-zinc-200 pt-6 text-sm">
                <span className="text-zinc-500">New to Kroniqos?</span>
                <Button type="link" className="!px-2 !font-semibold !text-[#0B1121]" onClick={onRegister}>
                  Create your company
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
