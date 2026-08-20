import { ApartmentOutlined, ArrowRightOutlined, LogoutOutlined } from '@ant-design/icons'
import { Button, Card, Popconfirm, Tag, Typography } from 'antd'
import type { Role } from '../../types'

export type CompanyWorkspace = {
  organizationId: string
  organizationName: string
  role: Role
}

export function CompanyWorkspacePicker({
  companies,
  selectingId,
  onSelect,
  onSignOut,
}: {
  companies: CompanyWorkspace[]
  selectingId?: string
  onSelect: (company: CompanyWorkspace) => void
  onSignOut: () => void
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fa] p-4 sm:p-6">
      <section className="w-full max-w-2xl border border-zinc-200 bg-white p-6 shadow-[0_24px_80px_rgb(11_17_33_/_9%)] sm:p-9">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-zinc-500">
              Kroniqos workspace
            </p>
            <Typography.Title level={2} className="!mb-2 !text-3xl !tracking-tight">
              Choose a company
            </Typography.Title>
            <Typography.Text type="secondary">
              Select the company you want to work in for this sign-in session.
            </Typography.Text>
          </div>
          <Popconfirm
            title="Sign out of Kroniqos?"
            description="You will return to the sign-in page."
            okText="Sign out"
            cancelText="Stay signed in"
            okButtonProps={{ danger: true }}
            onConfirm={onSignOut}
          >
            <Button icon={<LogoutOutlined />}>Sign out</Button>
          </Popconfirm>
        </div>
        <div className="grid gap-3">
          {companies.map((company) => (
            <Card
              key={company.organizationId}
              hoverable
              className="!border-zinc-200"
              onClick={() => !selectingId && onSelect(company)}
            >
              <div className="flex items-center gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center bg-[#0B1121] text-lg text-white">
                  <ApartmentOutlined />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 truncate font-semibold text-[#0B1121]">{company.organizationName}</p>
                  <Tag className="m-0 capitalize">{company.role}</Tag>
                </div>
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  iconPosition="end"
                  loading={selectingId === company.organizationId}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(company)
                  }}
                >
                  Open
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </main>
  )
}
