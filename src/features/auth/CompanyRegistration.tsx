import { ArrowLeftOutlined, ArrowRightOutlined, AuditOutlined, ShopOutlined, ToolOutlined } from '@ant-design/icons'
import { Alert, Button, Form, Input, Typography, message } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabase'

type Values = { fullName: string; email: string; password: string; confirmPassword: string }

export function CompanyRegistration({ onBack, onSignedIn }: { onBack: () => void; onSignedIn: () => void }) {
  const [form] = Form.useForm<Values>()
  const [saving, setSaving] = useState(false)
  const [confirmationRequired, setConfirmationRequired] = useState(false)
  const [api, holder] = message.useMessage()
  const submit = async ({ fullName, email, password }: Values) => {
    if (!supabase) return
    setSaving(true)
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } })
    setSaving(false)
    if (error) { api.error(error.message); return }
    if (!data.session) { setConfirmationRequired(true); return }
    api.success('Account created. Continue with company setup.')
    onSignedIn()
  }
  return <main className="min-h-screen bg-white p-4 sm:p-6 lg:p-8"><div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden border border-zinc-200 bg-white shadow-[0_24px_80px_rgb(11_17_33_/_9%)] lg:grid-cols-[.9fr_1.1fr]"><section className="relative flex min-h-[300px] flex-col justify-between overflow-hidden bg-[#f7f8fa] p-7 sm:p-10 lg:p-14" style={{ backgroundImage: 'linear-gradient(#0B112108 1px, transparent 1px), linear-gradient(90deg, #0B112108 1px, transparent 1px)', backgroundSize: '28px 28px' }}><Link to="/" aria-label="Go to Kroniqos home page" className="inline-flex h-10 w-fit items-center border border-[#0B1121] bg-white px-3 text-sm font-bold tracking-[.16em] text-[#0B1121]">KRONIQOS</Link><div><p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-zinc-500">Start your workspace</p><h1 className="m-0 max-w-md text-4xl font-semibold tracking-tight text-[#0B1121] sm:text-5xl">Built for the way your business actually works.</h1><p className="mt-5 max-w-md text-base leading-7 text-zinc-600">Set up retail, services, or both. You will create your company details in the next step.</p><div className="mt-9 flex gap-3"><div className="grid h-12 w-12 place-items-center border border-zinc-200 bg-white text-xl text-[#0B1121]"><ShopOutlined /></div><div className="grid h-12 w-12 place-items-center border border-zinc-200 bg-white text-xl text-[#0B1121]"><ToolOutlined /></div><div className="grid h-12 w-12 place-items-center border border-zinc-200 bg-white text-xl text-[#0B1121]"><AuditOutlined /></div></div></div><p className="mb-0 text-xs text-zinc-500">© {new Date().getFullYear()} Kroniqos</p></section><section className="bg-white p-7 sm:p-10 lg:p-14">{holder}<div className="mx-auto max-w-lg"><Button type="text" className="!mb-8 !px-0 !text-zinc-600" icon={<ArrowLeftOutlined />} onClick={onBack}>Back to sign in</Button><Typography.Text className="text-xs font-bold uppercase tracking-[.18em] !text-zinc-500">Create company account</Typography.Text><Typography.Title level={2} className="!mb-2 !mt-3 !text-3xl !tracking-tight">Start with your account.</Typography.Title><Typography.Paragraph type="secondary">You will become the first administrator for your business workspace.</Typography.Paragraph>{confirmationRequired && <Alert className="mb-5" type="success" showIcon message="Check your email to confirm your account, then return here and sign in." />}<Form form={form} layout="vertical" className="mt-8" onFinish={(values) => void submit(values)}><Form.Item name="fullName" label="Your full name" rules={[{ required: true, message: 'Enter your name.' }]}><Input autoFocus size="large" autoComplete="name" placeholder="Your name" /></Form.Item><Form.Item name="email" label="Work email" rules={[{ required: true, type: 'email', message: 'Enter a valid email address.' }]}><Input size="large" autoComplete="email" placeholder="you@company.com" /></Form.Item><Form.Item name="password" label="Password" rules={[{ required: true, min: 8, message: 'Use at least 8 characters.' }]}><Input.Password size="large" autoComplete="new-password" /></Form.Item><Form.Item name="confirmPassword" label="Confirm password" dependencies={['password']} rules={[{ required: true }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error('Passwords do not match.')) } })]}><Input.Password size="large" autoComplete="new-password" onPressEnter={() => void form.submit()} /></Form.Item><Button type="primary" htmlType="submit" size="large" block loading={saving} icon={<ArrowRightOutlined />} iconPosition="end">Create account</Button></Form></div></section></div></main>
}
