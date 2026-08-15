import {
  ArrowLeftOutlined,
  BankOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  CustomerServiceOutlined,
  DollarOutlined,
  EditOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  NotificationOutlined,
  ReloadOutlined,
  ShopOutlined,
  SunOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  List,
  Menu,
  Modal,
  Select,
  Skeleton,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { TableColumnsType } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useTheme } from "../../app/theme";
import { formatNaira } from "../../lib/currency";
import { supabase } from "../../supabase";
import {
  PlatformAnalyticsPage,
  PlatformAuditLogPage,
} from "./PlatformObservability";
import {
  PlatformOperationsPage,
  PlatformStatusPage,
  PlatformSupportPage,
} from "./PlatformSupportOps";
import { PlatformDashboard } from "./PlatformDashboard";
import { PlatformTeamPage } from "./PlatformTeam";

type OrganizationStatus = "trial" | "active" | "suspended" | "cancelled";
type Organization = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  created_at: string;
};
type Subscription = {
  organization_id: string;
  plan_code: string;
  status: string;
  trial_ends_at?: string | null;
  current_period_ends_at?: string | null;
};
type Store = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  is_primary: boolean;
  created_at: string;
};
type Profile = {
  id: string;
  store_id: string;
  full_name: string;
  role: string;
  created_at: string;
};
type Metrics = {
  product_count: number;
  sale_count: number;
  sales_total_kobo: number;
  staff_count: number;
};
type PlatformAudit = {
  id: string;
  action: string;
  before_data: { status?: string; plan_code?: string } | null;
  after_data: { status?: string; plan_code?: string } | null;
  created_at: string;
};
type Plan = {
  code: string;
  name: string;
  description: string;
  monthly_price_kobo: number;
  limits: Record<string, number>;
  features: string[];
  active: boolean;
};
type OrganizationProfile = Organization & {
  business_email?: string | null;
  phone?: string | null;
  address?: string | null;
};
type PlatformRole = "owner" | "operator" | "support" | "finance" | "viewer";

const { Header, Content, Footer, Sider } = Layout;
const statusColor: Record<OrganizationStatus, string> = {
  active: "green",
  trial: "blue",
  suspended: "red",
  cancelled: "default",
};
const humanDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

type PageProps = {
  organizations: Organization[];
  subscriptions: Subscription[];
  stores: Store[];
  loading: boolean;
  onStatusChange: (
    organization: Organization,
    status: OrganizationStatus,
  ) => Promise<void>;
  updatingId?: string;
  onRefresh: () => void;
  plans: Plan[];
  onPlanChange: (organization: Organization, planCode: string) => Promise<void>;
  onProfileUpdate: (
    organization: Organization,
    values: {
      name: string;
      businessEmail?: string;
      phone?: string;
      address?: string;
    },
  ) => Promise<void>;
  onStoreStatusChange: (
    store: Store,
    status: "active" | "inactive",
  ) => Promise<void>;
  onResendInvite: (organizationId: string, staffId: string) => Promise<void>;
};

function OrganizationList({
  organizations,
  subscriptions,
  stores,
  loading,
  onStatusChange,
  updatingId,
  onRefresh,
}: PageProps) {
  const navigate = useNavigate();
  const subscriptionByOrganization = useMemo(
    () =>
      new Map(
        subscriptions.map((subscription) => [
          subscription.organization_id,
          subscription,
        ]),
      ),
    [subscriptions],
  );
  const counts = useMemo(
    () =>
      stores.reduce<Record<string, number>>(
        (result, store) => ({
          ...result,
          [store.organization_id]: (result[store.organization_id] ?? 0) + 1,
        }),
        {},
      ),
    [stores],
  );
  const summary = useMemo(
    () => ({
      active: organizations.filter(
        (organization) => organization.status === "active",
      ).length,
      trial: organizations.filter(
        (organization) => organization.status === "trial",
      ).length,
      stores: stores.length,
    }),
    [organizations, stores],
  );
  const columns: TableColumnsType<Organization> = [
    {
      title: "Organisation",
      key: "organization",
      render: (_, organization) => (
        <button
          className="text-left"
          onClick={() => navigate(`/platform/organisations/${organization.id}`)}
        >
          <Typography.Text strong className="block hover:underline">
            {organization.name}
          </Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {organization.slug}
          </Typography.Text>
        </button>
      ),
    },
    {
      title: "Plan",
      key: "plan",
      responsive: ["sm"],
      render: (_, organization) => (
        <Tag>
          {subscriptionByOrganization.get(organization.id)?.plan_code ?? "—"}
        </Tag>
      ),
    },
    {
      title: "Stores",
      key: "stores",
      align: "center",
      responsive: ["md"],
      render: (_, organization) => counts[organization.id] ?? 0,
    },
    {
      title: "Subscription",
      key: "subscription",
      responsive: ["lg"],
      render: (_, organization) => (
        <span className="capitalize">
          {subscriptionByOrganization.get(organization.id)?.status ?? "—"}
        </span>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: OrganizationStatus) => (
        <Tag color={statusColor[status]} className="capitalize">
          {status}
        </Tag>
      ),
    },
    {
      title: "Manage",
      key: "manage",
      render: (_, organization) => (
        <Select
          value={organization.status}
          loading={updatingId === organization.id}
          onChange={(status) => void onStatusChange(organization, status)}
          options={["trial", "active", "suspended", "cancelled"].map(
            (status) => ({
              value: status,
              label: status[0].toUpperCase() + status.slice(1),
            }),
          )}
          className="min-w-28"
        />
      ),
    },
  ];
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Typography.Title level={2} className="!mb-1">
            Organisations
          </Typography.Title>
          <Typography.Text type="secondary">
            Manage tenants, subscriptions, and platform access.
          </Typography.Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>
          Refresh
        </Button>
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <Statistic
            title="Organisations"
            value={organizations.length}
            prefix={<BankOutlined />}
          />
        </Card>
        <Card>
          <Statistic
            title="Active"
            value={summary.active}
            valueStyle={{ color: "#15803d" }}
          />
        </Card>
        <Card>
          <Statistic
            title="Trials"
            value={summary.trial}
            valueStyle={{ color: "#2563eb" }}
          />
        </Card>
        <Card>
          <Statistic
            title="Stores"
            value={summary.stores}
            prefix={<TeamOutlined />}
          />
        </Card>
      </div>
      <Card bodyStyle={{ padding: 0 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={organizations}
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 780 }}
          locale={{ emptyText: "No organisations have been onboarded yet." }}
        />
      </Card>
    </>
  );
}

function OrganizationDetail({
  organizations,
  subscriptions,
  stores,
  loading,
  onStatusChange,
  onPlanChange,
  onProfileUpdate,
  onStoreStatusChange,
  onResendInvite,
  plans,
  updatingId,
}: PageProps) {
  const { organizationId } = useParams();
  const { search } = useLocation();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [metrics, setMetrics] = useState<Metrics>();
  const [activity, setActivity] = useState<PlatformAudit[]>([]);
  const [profile, setProfile] = useState<OrganizationProfile>();
  const [detailLoading, setDetailLoading] = useState(true);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [inviteStaffId, setInviteStaffId] = useState<string>();
  const [form] = Form.useForm<{
    name: string;
    businessEmail?: string;
    phone?: string;
    address?: string;
  }>();
  const organization = organizations.find((item) => item.id === organizationId);
  const organizationStores = stores.filter(
    (store) => store.organization_id === organizationId,
  );
  const subscription = subscriptions.find(
    (item) => item.organization_id === organizationId,
  );

  useEffect(() => {
    if (!organizationId || !supabase) return;
    const client = supabase;
    const loadDetail = async () => {
      setDetailLoading(true);
      const storeIds = organizationStores.map((store) => store.id);
      const [profileResult, metricResult, auditResult, organizationResult] =
        await Promise.all([
          storeIds.length
            ? client
                .from("profiles")
                .select("id,store_id,full_name,role,created_at")
                .in("store_id", storeIds)
            : Promise.resolve({ data: [], error: null }),
          client.rpc("platform_organization_metrics", {
            p_organization_id: organizationId,
          }),
          client
            .from("platform_audit_events")
            .select("id,action,before_data,after_data,created_at")
            .eq("organization_id", organizationId)
            .order("created_at", { ascending: false })
            .limit(20),
          client.rpc("platform_organization_profile", {
            p_organization_id: organizationId,
          }),
        ]);
      if (!profileResult.error)
        setProfiles((profileResult.data ?? []) as Profile[]);
      if (!metricResult.error)
        setMetrics(
          (metricResult.data?.[0] ?? undefined) as Metrics | undefined,
        );
      if (!auditResult.error)
        setActivity((auditResult.data ?? []) as PlatformAudit[]);
      if (!organizationResult.error)
        setProfile(
          (organizationResult.data?.[0] ?? undefined) as
            OrganizationProfile | undefined,
        );
      setDetailLoading(false);
    };
    void loadDetail();
  }, [organizationId, organizationStores.map((store) => store.id).join(",")]);

  if (loading || !organization)
    return <Skeleton active paragraph={{ rows: 8 }} />;
  const owners = profiles.filter((member) => member.role === "admin");
  const submitProfile = async (values: {
    name: string;
    businessEmail?: string;
    phone?: string;
    address?: string;
  }) => {
    await onProfileUpdate(organization, values);
    setProfileModalOpen(false);
    setProfile((current) => ({
      ...(current ?? organization),
      name: values.name,
      business_email: values.businessEmail,
      phone: values.phone,
      address: values.address,
    }));
  };
  const resendInvite = async (staffId: string) => {
    setInviteStaffId(staffId);
    await onResendInvite(organization.id, staffId);
    setInviteStaffId(undefined);
  };
  const activityTitle = (event: PlatformAudit) =>
    event.action === "organization_plan_changed"
      ? "Organisation plan changed"
      : event.action === "store_status_changed"
        ? "Store status changed"
        : event.action === "staff_invite_resent"
          ? "Staff access email resent"
          : event.action === "organization_profile_updated"
            ? "Organisation profile updated"
            : "Organisation status changed";

  return (
    <>
      {search.includes("support=true") && (
        <Alert
          className="mb-5"
          type="warning"
          showIcon
          message="Audited support view"
          description="You are viewing this organisation under a time-limited support session. Do not make changes unless required to resolve the documented case."
        />
      )}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            className="!mb-3 !px-0"
            onClick={() => navigate("/platform/organisations")}
          >
            All organisations
          </Button>
          <div className="flex items-center gap-3">
            <Typography.Title level={2} className="!mb-0">
              {profile?.name ?? organization.name}
            </Typography.Title>
            <Tag
              color={statusColor[organization.status]}
              className="capitalize"
            >
              {organization.status}
            </Tag>
          </div>
          <Typography.Text type="secondary">
            {organization.slug} · Joined {humanDate(organization.created_at)}
          </Typography.Text>
        </div>
        <Select
          value={organization.status}
          loading={updatingId === organization.id}
          onChange={(status) => void onStatusChange(organization, status)}
          options={["trial", "active", "suspended", "cancelled"].map(
            (status) => ({ value: status, label: `Set ${status}` }),
          )}
          className="min-w-36"
        />
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <Statistic
            title="Products"
            value={metrics?.product_count ?? 0}
            loading={detailLoading}
          />
        </Card>
        <Card>
          <Statistic
            title="Sales"
            value={metrics?.sale_count ?? 0}
            loading={detailLoading}
          />
        </Card>
        <Card>
          <Statistic
            title="Sales value"
            value={formatNaira((metrics?.sales_total_kobo ?? 0) / 100)}
            loading={detailLoading}
          />
        </Card>
        <Card>
          <Statistic
            title="Staff"
            value={metrics?.staff_count ?? 0}
            loading={detailLoading}
          />
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <div className="space-y-6">
          <Card
            title="Organisation profile"
            extra={
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  form.setFieldsValue({
                    name: profile?.name ?? organization.name,
                    businessEmail: profile?.business_email ?? "",
                    phone: profile?.phone ?? "",
                    address: profile?.address ?? "",
                  });
                  setProfileModalOpen(true);
                }}
              >
                Edit
              </Button>
            }
          >
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Business email">
                {profile?.business_email ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Phone">
                {profile?.phone ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Address" span={2}>
                {profile?.address ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Plan">
                <Select
                  value={subscription?.plan_code}
                  placeholder="Select plan"
                  loading={updatingId === organization.id}
                  onChange={(planCode) =>
                    void onPlanChange(organization, planCode)
                  }
                  options={plans
                    .filter((plan) => plan.active)
                    .map((plan) => ({ value: plan.code, label: plan.name }))}
                  className="min-w-32"
                />
              </Descriptions.Item>
              <Descriptions.Item label="Subscription">
                <span className="capitalize">
                  {subscription?.status ?? "—"}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Trial ends">
                {humanDate(subscription?.trial_ends_at)}
              </Descriptions.Item>
              <Descriptions.Item label="Current period ends">
                {humanDate(subscription?.current_period_ends_at)}
              </Descriptions.Item>
            </Descriptions>
          </Card>
          <Card title={`Stores (${organizationStores.length})`}>
            <List
              dataSource={organizationStores}
              locale={{ emptyText: "No stores yet." }}
              renderItem={(store) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Avatar icon={<ShopOutlined />} />}
                    title={
                      <span>
                        {store.name}{" "}
                        {store.is_primary && (
                          <Tag className="ml-2">Primary</Tag>
                        )}
                      </span>
                    }
                    description={`Created ${humanDate(store.created_at)}`}
                  />
                  <Select
                    size="small"
                    value={store.status}
                    loading={updatingId === store.id}
                    onChange={(status) =>
                      void onStoreStatusChange(
                        store,
                        status as "active" | "inactive",
                      )
                    }
                    options={[
                      { value: "active", label: "Active" },
                      { value: "inactive", label: "Inactive" },
                    ]}
                  />
                </List.Item>
              )}
            />
          </Card>
          <Card title={`Staff (${profiles.length})`}>
            <List
              dataSource={profiles}
              locale={{ emptyText: "No staff members." }}
              renderItem={(member) => (
                <List.Item
                  actions={[
                    <Button
                      key="resend"
                      type="link"
                      loading={inviteStaffId === member.id}
                      onClick={() => void resendInvite(member.id)}
                    >
                      Resend access
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar icon={<UserOutlined />} />}
                    title={
                      <span>
                        {member.full_name}{" "}
                        {member.role === "admin" && (
                          <Tag className="ml-2">Owner</Tag>
                        )}
                      </span>
                    }
                    description={`${member.role} · added ${humanDate(member.created_at)}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </div>
        <Card
          title={
            <span>
              <ClockCircleOutlined className="mr-2" />
              Platform activity
            </span>
          }
        >
          <List
            dataSource={activity}
            locale={{ emptyText: "No platform activity yet." }}
            renderItem={(event) => (
              <List.Item>
                <List.Item.Meta
                  title={activityTitle(event)}
                  description={
                    <span>
                      {event.before_data?.status ??
                        event.before_data?.plan_code ??
                        "—"}{" "}
                      →{" "}
                      {event.after_data?.status ??
                        event.after_data?.plan_code ??
                        "—"}{" "}
                      · {new Date(event.created_at).toLocaleString("en-NG")}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      </div>
      <Modal
        title="Edit organisation profile"
        open={profileModalOpen}
        okText="Save profile"
        onOk={() => void form.submit()}
        onCancel={() => setProfileModalOpen(false)}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void submitProfile(values)}
        >
          <Form.Item
            name="name"
            label="Company name"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="businessEmail"
            label="Business email"
            rules={[{ type: "email" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Business address">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function PlansPage({
  plans,
  onUpdated = async () => {
    window.location.reload();
  },
}: {
  plans: Plan[];
  onUpdated?: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Plan>();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{
    name: string;
    description: string;
    price: number;
    limits: string;
    features: string;
    active: boolean;
  }>();
  const [api, holder] = message.useMessage();
  const edit = (plan: Plan) => {
    setEditing(plan);
    form.setFieldsValue({
      name: plan.name,
      description: plan.description,
      price: plan.monthly_price_kobo / 100,
      limits: JSON.stringify(plan.limits, null, 2),
      features: plan.features.join("\n"),
      active: plan.active,
    });
  };
  const save = async (values: {
    name: string;
    description: string;
    price: number;
    limits: string;
    features: string;
    active: boolean;
  }) => {
    if (!supabase || !editing) return;
    let limits: Record<string, number>;
    try {
      limits = JSON.parse(values.limits);
    } catch {
      api.error("Limits must be valid JSON.");
      return;
    }
    if (
      !Object.values(limits).every(
        (value) => Number.isInteger(value) && value >= 0,
      )
    ) {
      api.error("Every limit must be a whole number of zero or more.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("update_subscription_plan", {
      p_code: editing.code,
      p_name: values.name,
      p_description: values.description,
      p_monthly_price_kobo: Math.round(values.price * 100),
      p_limits: limits,
      p_features: values.features
        .split("\n")
        .map((feature) => feature.trim())
        .filter(Boolean),
      p_active: values.active,
    });
    setSaving(false);
    if (error) {
      api.error(error.message);
      return;
    }
    api.success(`${values.name} plan updated.`);
    setEditing(undefined);
    await onUpdated();
  };
  return (
    <>
      {holder}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Typography.Title level={2} className="!mb-1">
            Plans & entitlements
          </Typography.Title>
          <Typography.Text type="secondary">
            Platform admins control commercial limits and included modules here.
          </Typography.Text>
        </div>
        <Tag color="blue">Server-enforced</Tag>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <Card
            key={plan.code}
            title={
              <div className="flex items-center justify-between gap-2">
                <span>{plan.name}</span>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => edit(plan)}
                >
                  Edit
                </Button>
              </div>
            }
          >
            <Typography.Paragraph type="secondary" className="!min-h-10">
              {plan.description}
            </Typography.Paragraph>
            <Typography.Title level={3} className="!mb-4">
              {plan.monthly_price_kobo
                ? `${formatNaira(plan.monthly_price_kobo / 100)} / month`
                : "Free / custom"}
            </Typography.Title>
            <Typography.Text strong>Limits</Typography.Text>
            <List
              size="small"
              dataSource={Object.entries(plan.limits)}
              renderItem={([key, value]) => (
                <List.Item>
                  {key.replaceAll("_", " ")}
                  <Typography.Text strong>{value}</Typography.Text>
                </List.Item>
              )}
            />
            <Typography.Text strong>Included</Typography.Text>
            <List
              size="small"
              dataSource={plan.features}
              renderItem={(feature) => <List.Item>✓ {feature}</List.Item>}
            />
          </Card>
        ))}
      </div>
      <Modal
        open={Boolean(editing)}
        title={`Edit ${editing?.name ?? ""} plan`}
        width={720}
        okText="Save plan"
        confirmLoading={saving}
        onCancel={() => setEditing(undefined)}
        onOk={() => void form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item
              name="name"
              label="Plan name"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="price"
              label="Monthly price (₦)"
              rules={[{ required: true }]}
            >
              <InputNumber min={0} precision={2} className="w-full" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="limits"
            label="Limits (JSON)"
            extra="Use numeric keys such as products, staff, stores, warehouses, service_jobs."
          >
            <Input.TextArea rows={8} className="font-mono text-xs" />
          </Form.Item>
          <Form.Item
            name="features"
            label="Included features"
            extra="One feature per line."
          >
            <Input.TextArea rows={7} />
          </Form.Item>
          <Form.Item
            name="active"
            label="Available for new subscriptions"
            valuePropName="checked"
          >
            <Select
              options={[
                { value: true, label: "Active" },
                { value: false, label: "Archived" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function PlatformApp() {
  const { mode, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [platformRole, setPlatformRole] = useState<PlatformRole>("owner");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string>();
  const [api, holder] = message.useMessage();
  const onDetailPage = pathname.startsWith("/platform/organisations/");

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const [organizationResult, subscriptionResult, storeResult, planResult] =
      await Promise.all([
        supabase.rpc("platform_organization_overview"),
        supabase
          .from("organization_subscriptions")
          .select(
            "organization_id,plan_code,status,trial_ends_at,current_period_ends_at",
          ),
        supabase
          .from("stores")
          .select("id,organization_id,name,status,is_primary,created_at"),
        supabase
          .from("subscription_plans")
          .select(
            "code,name,description,monthly_price_kobo,limits,features,active",
          )
          .order("monthly_price_kobo"),
      ]);
    if (organizationResult.error) {
      api.error(organizationResult.error.message);
      setLoading(false);
      return;
    }
    setOrganizations(organizationResult.data as Organization[]);
    setSubscriptions(
      subscriptionResult.error
        ? []
        : (subscriptionResult.data as Subscription[]),
    );
    setStores(storeResult.error ? [] : (storeResult.data as Store[]));
    setPlans(planResult.error ? [] : (planResult.data as Plan[]));
    if (subscriptionResult.error || storeResult.error || planResult.error)
      api.warning(
        subscriptionResult.error?.message ??
          storeResult.error?.message ??
          planResult.error?.message ??
          "Some platform metadata could not be loaded.",
      );
    setLoading(false);
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!supabase) return;
    void supabase.rpc("current_platform_role").then(({ data }) => {
      if (data) setPlatformRole(data as PlatformRole);
    });
  }, []);
  const updateStatus = useCallback(
    async (organization: Organization, status: OrganizationStatus) => {
      if (!supabase || status === organization.status) return;
      setUpdatingId(organization.id);
      const { error } = await supabase.rpc("set_organization_status", {
        p_organization_id: organization.id,
        p_status: status,
      });
      setUpdatingId(undefined);
      if (error) {
        api.error(error.message);
        return;
      }
      api.success(`${organization.name} is now ${status}.`);
      await load();
    },
    [api, load],
  );
  const updatePlan = useCallback(
    async (organization: Organization, planCode: string) => {
      if (!supabase) return;
      setUpdatingId(organization.id);
      const { error } = await supabase.rpc("set_organization_plan", {
        p_organization_id: organization.id,
        p_plan_code: planCode,
      });
      setUpdatingId(undefined);
      if (error) {
        api.error(error.message);
        return;
      }
      api.success(`${organization.name} moved to ${planCode}.`);
      await load();
    },
    [api, load],
  );
  const updateProfile = useCallback(
    async (
      organization: Organization,
      values: {
        name: string;
        businessEmail?: string;
        phone?: string;
        address?: string;
      },
    ) => {
      if (!supabase) return;
      setUpdatingId(organization.id);
      const { error } = await supabase.rpc(
        "update_platform_organization_profile",
        {
          p_organization_id: organization.id,
          p_name: values.name,
          p_business_email: values.businessEmail ?? null,
          p_phone: values.phone ?? null,
          p_address: values.address ?? null,
        },
      );
      setUpdatingId(undefined);
      if (error) {
        api.error(error.message);
        return;
      }
      api.success("Organisation profile updated.");
      await load();
    },
    [api, load],
  );
  const updateStoreStatus = useCallback(
    async (store: Store, status: "active" | "inactive") => {
      if (!supabase || status === store.status) return;
      setUpdatingId(store.id);
      const { error } = await supabase.rpc("set_platform_store_status", {
        p_store_id: store.id,
        p_status: status,
      });
      setUpdatingId(undefined);
      if (error) {
        api.error(error.message);
        return;
      }
      api.success(`${store.name} is now ${status}.`);
      await load();
    },
    [api, load],
  );
  const resendInvite = useCallback(
    async (organizationId: string, staffId: string) => {
      if (!supabase) return;
      const { error } = await supabase.functions.invoke(
        "platform-organization-operations",
        { body: { action: "resend_invite", organizationId, staffId } },
      );
      if (error) {
        api.error(error.message);
        return;
      }
      api.success("Access email has been resent.");
    },
    [api],
  );
  const pageProps: PageProps = {
    organizations,
    subscriptions,
    stores,
    loading,
    plans,
    onPlanChange: updatePlan,
    onProfileUpdate: updateProfile,
    onStoreStatusChange: updateStoreStatus,
    onResendInvite: resendInvite,
    onStatusChange: updateStatus,
    updatingId,
    onRefresh: () => void load(),
  };

  const activeMenu = pathname.startsWith("/platform/organisations")
    ? "organizations"
    : pathname.startsWith("/platform/plans")
      ? "plans"
      : pathname.startsWith("/platform/audit")
        ? "audit"
        : pathname.startsWith("/platform/analytics")
          ? "analytics"
          : pathname.startsWith("/platform/support")
            ? "support"
            : pathname.startsWith("/platform/status")
              ? "status"
              : pathname.startsWith("/platform/operations")
                ? "operations"
                : pathname.startsWith("/platform/team")
                  ? "team"
                  : "dashboard";
  const can = (
    area:
      | "organizations"
      | "plans"
      | "analytics"
      | "audit"
      | "support"
      | "status"
      | "operations"
      | "team",
  ) =>
    platformRole === "owner" ||
    (platformRole === "operator" &&
      [
        "organizations",
        "plans",
        "analytics",
        "audit",
        "status",
        "operations",
      ].includes(area)) ||
    (platformRole === "support" &&
      ["organizations", "audit", "support"].includes(area)) ||
    (platformRole === "finance" && ["analytics", "audit"].includes(area)) ||
    (platformRole === "viewer" && ["analytics", "audit"].includes(area));
  const menuItems = [
    { key: "dashboard", icon: <BarChartOutlined />, label: "Dashboard" },
    ...(can("organizations")
      ? [
          {
            key: "organizations",
            icon: <BankOutlined />,
            label: "Organisations",
          },
        ]
      : []),
    ...(can("plans")
      ? [
          {
            key: "plans",
            icon: <DollarOutlined />,
            label: "Plans & entitlements",
          },
        ]
      : []),
    ...(can("analytics")
      ? [{ key: "analytics", icon: <BarChartOutlined />, label: "Analytics" }]
      : []),
    ...(can("audit")
      ? [
          {
            key: "audit",
            icon: <FileSearchOutlined />,
            label: "Platform audit log",
          },
        ]
      : []),
    ...(can("support")
      ? [
          {
            key: "support",
            icon: <CustomerServiceOutlined />,
            label: "Support & safety",
          },
        ]
      : []),
    ...(can("status")
      ? [
          {
            key: "status",
            icon: <NotificationOutlined />,
            label: "System status",
          },
        ]
      : []),
    ...(can("operations")
      ? [
          {
            key: "operations",
            icon: <GlobalOutlined />,
            label: "SaaS operations",
          },
        ]
      : []),
    { key: "team", icon: <TeamOutlined />, label: "Platform team" },
  ];
  const routeFor = (key: string) =>
    key === "dashboard"
      ? "/platform"
      : key === "organizations"
        ? "/platform/organisations"
        : `/platform/${key}`;
  const restricted = (
    <Card>Your platform role does not have access to this area.</Card>
  );
  return (
    <Layout className="app-shell platform-shell min-h-screen">
      {holder}
      <Sider
        width={236}
        theme={mode === "dark" ? "dark" : "light"}
        className={`app-sider platform-sider fixed bottom-0 left-0 top-0 z-30${
          mobileNavOpen ? " is-open" : ""
        }`}
      >
        <div className="px-6 py-7">
          <Typography.Text className="brand-wordmark font-bold tracking-[.16em]">
            KRONIQ
          </Typography.Text>
          <p className="brand-subtitle mb-0 mt-1 text-sm">Platform control</p>
        </div>
        <Menu
          theme={mode === "dark" ? "dark" : "light"}
          mode="inline"
          selectedKeys={[activeMenu]}
          className="!border-0 !bg-transparent"
          items={menuItems}
          onClick={({ key }) => {
            navigate(routeFor(key));
            setMobileNavOpen(false);
          }}
        />
      </Sider>
      {mobileNavOpen && (
        <button
          type="button"
          className="platform-menu-dismiss md:hidden"
          aria-label="Close platform navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <Layout
        className="platform-content-shell"
        style={{ marginLeft: 236, width: "calc(100% - 236px)" }}
      >
        <Header
          className="app-header fixed right-0 top-0 z-20 !h-auto px-4 py-2 md:px-8"
          style={{ left: 236 }}
        >
          <div className="mx-auto flex min-h-[44px] max-w-7xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                aria-label="Open platform navigation menu"
                className="platform-menu-trigger !flex !h-9 !w-9 !items-center !justify-center !rounded-full md:!hidden"
                icon={<MenuOutlined />}
                onClick={() => setMobileNavOpen(true)}
              />
              <h1 className="mb-0 truncate text-xl font-semibold tracking-tight text-slate-900">
                Platform control
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-sm">
                <Avatar
                  size={30}
                  icon={<UserOutlined />}
                  className="!bg-[#0B1121] !text-white"
                />
                <span className="mx-2 hidden text-xs font-semibold capitalize text-slate-700 sm:inline">
                  {platformRole}
                </span>
              </div>
              <Tooltip
                title={mode === "dark" ? "Use light theme" : "Use dark theme"}
              >
                <Button
                  aria-label="Toggle colour theme"
                  className="theme-toggle !flex !h-9 !w-9 !items-center !justify-center !rounded-full"
                  icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
                  onClick={toggleTheme}
                />
              </Tooltip>
              <Tooltip title="Sign out">
                <Button
                  aria-label="Sign out"
                  className="!flex !h-9 !w-9 !items-center !justify-center !rounded-full !border-slate-200 !text-slate-600"
                  icon={<LogoutOutlined />}
                  onClick={() => void supabase?.auth.signOut()}
                />
              </Tooltip>
            </div>
          </div>
        </Header>
        <div className="pt-20">
          <Content className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
            <Routes>
              <Route
                path="/platform"
                element={
                  <PlatformDashboard
                    organizations={organizations}
                    stores={stores}
                    subscriptions={subscriptions}
                  />
                }
              />
              <Route
                path="/platform/organisations"
                element={
                  can("organizations") ? (
                    <OrganizationList {...pageProps} />
                  ) : (
                    restricted
                  )
                }
              />
              <Route
                path="/platform/organisations/:organizationId"
                element={
                  can("organizations") ? (
                    <OrganizationDetail {...pageProps} />
                  ) : (
                    restricted
                  )
                }
              />
              <Route
                path="/platform/plans"
                element={
                  can("plans") ? <PlansPage plans={plans} /> : restricted
                }
              />
              <Route
                path="/platform/analytics"
                element={
                  can("analytics") ? <PlatformAnalyticsPage /> : restricted
                }
              />
              <Route
                path="/platform/audit"
                element={can("audit") ? <PlatformAuditLogPage /> : restricted}
              />
              <Route
                path="/platform/support"
                element={
                  can("support") ? (
                    <PlatformSupportPage organizations={organizations} />
                  ) : (
                    restricted
                  )
                }
              />
              <Route
                path="/platform/status"
                element={can("status") ? <PlatformStatusPage /> : restricted}
              />
              <Route
                path="/platform/operations"
                element={
                  can("operations") ? <PlatformOperationsPage /> : restricted
                }
              />
              <Route
                path="/platform/team"
                element={<PlatformTeamPage currentRole={platformRole} />}
              />
            </Routes>
          </Content>
        </div>
        <Footer className="app-footer px-4 py-4 text-center text-xs md:px-8">
          Copyright © {new Date().getFullYear()} · Powered by Kroniq
        </Footer>
      </Layout>
    </Layout>
  );
}

export function PlatformAccessDenied() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <Card className="w-full max-w-md text-center">
        <Typography.Title level={3}>Platform access required</Typography.Title>
        <Typography.Paragraph type="secondary">
          This area is reserved for Kronicle platform administrators.
        </Typography.Paragraph>
        <Button
          type="primary"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          Return to POS
        </Button>
      </Card>
    </div>
  );
}
