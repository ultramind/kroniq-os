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
    <main className="min-h-dvh overflow-y-auto bg-[#f7f8fa] px-3 py-5 sm:grid sm:place-items-center sm:p-6">
      <section className="mx-auto w-full max-w-2xl border border-zinc-200 bg-white p-4 shadow-[0_24px_80px_rgb(11_17_33_/_9%)] sm:p-9">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-zinc-500">
              Kroniqos workspace
            </p>
            <Typography.Title level={2} className="!mb-2 !text-2xl !tracking-tight sm:!text-3xl">
              Choose a company
            </Typography.Title>
            <Typography.Text type="secondary" className="block max-w-lg text-sm sm:text-base">
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
            <Button className="w-full sm:w-auto" icon={<LogoutOutlined />}>
              Sign out
            </Button>
          </Popconfirm>
        </div>
        <div className="grid gap-3">
          {companies.map((company) => (
            <Card
              key={company.organizationId}
              hoverable
              className="!border-zinc-200 [&_.ant-card-body]:!p-4"
              onClick={() => !selectingId && onSelect(company)}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 sm:flex sm:gap-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center bg-[#0B1121] text-base text-white sm:h-11 sm:w-11 sm:text-lg">
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
                  className="col-span-2 w-full sm:w-auto"
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
