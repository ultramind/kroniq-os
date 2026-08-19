import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Radio,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { DeleteOutlined, EditOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons'
import { formatNaira } from '../../lib/currency'
import { supabase } from '../../supabase'
import type { Product, Role } from '../../types'
import { ProductPackagingModal } from './ProductPackagingModal'
import { CurrencyInput } from '../../components/CurrencyInput'

const { Text } = Typography
const MAX_IMAGES = 2
type Values = {
  name: string
  sku: string
  price: number
  costPrice: number
  minimumSellingPrice?: number
  active: boolean
  description?: string
  imageUrl?: string
  imageUrls?: string[]
  onlinePublished?: boolean
  featured?: boolean
}
type Props = { products: Product[]; role: Role; onSave: (product: Product, values: Values) => Promise<void> }

export function ProductManagement({ products, role, onSave }: Props) {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Product>()
  const [packagingProduct, setPackagingProduct] = useState<Product>()
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form] = Form.useForm<Values>()
  const [api, holder] = message.useMessage()
  const rows = useMemo(
    () =>
      products.filter((product) =>
        `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [products, search],
  )

  function currentImages(): string[] {
    return ((form.getFieldValue('imageUrls') as string[] | undefined) ?? []).slice(0, MAX_IMAGES)
  }

  async function save(values: Values) {
    if (!editing) return
    setSaving(true)
    try {
      const imageUrls = (values.imageUrls ?? []).slice(0, MAX_IMAGES)
      await onSave(editing, { ...values, imageUrls, imageUrl: imageUrls[0] })
      setEditing(undefined)
    } finally {
      setSaving(false)
    }
  }

  async function uploadImage(file: File) {
    if (!editing) throw new Error('Select a product first.')
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
    if (file.size > 5 * 1024 * 1024) throw new Error('Each image must be 5 MB or smaller.')
    if (currentImages().length >= MAX_IMAGES)
      throw new Error(`A product can have a maximum of ${MAX_IMAGES} images.`)
    if (!supabase) throw new Error('Image storage is not configured.')

    setUploading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: profile, error: profileError } = user
        ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle()
        : { data: null, error: null }
      if (profileError || !profile) throw new Error(profileError?.message ?? 'Store profile not found.')

      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${profile.store_id}/${editing.id}/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage
        .from('product-images')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error

      const { data: url } = supabase.storage.from('product-images').getPublicUrl(path)
      form.setFieldValue('imageUrls', [...currentImages(), url.publicUrl])
      api.success('Image uploaded. Save product changes to publish it.')
    } finally {
      setUploading(false)
    }
  }

  function openEditor(product: Product) {
    setEditing(product)
    form.setFieldsValue({
      name: product.name,
      sku: product.sku,
      price: product.price,
      costPrice: product.costPrice,
      minimumSellingPrice: product.minimumSellingPrice,
      active: product.active !== false,
      description: product.description,
      imageUrls: product.imageUrls?.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [],
      onlinePublished: product.onlinePublished,
      featured: product.featured,
    })
  }

  const columns = [
    {
      title: 'Product',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, product: Product) => (
        <div>
          <Text strong>{name}</Text>
          <br />
          <Text type="secondary" className="text-xs">
            SKU {product.sku} · {product.category}
          </Text>
        </div>
      ),
    },
    {
      title: 'Selling price',
      dataIndex: 'price',
      key: 'price',
      render: (price: number, product: Product) => (
        <div>
          {formatNaira(price)}
          <br />
          <Text type="secondary" className="text-xs">
            {product.minimumSellingPrice === undefined
              ? 'Fixed price'
              : `Floor ${formatNaira(product.minimumSellingPrice)}`}
          </Text>
        </div>
      ),
    },
    {
      title: 'Stock',
      dataIndex: 'stock',
      key: 'stock',
      render: (stock: number) => <Tag color={stock < 10 ? 'gold' : 'green'}>{stock}</Tag>,
    },
    {
      title: 'Online',
      key: 'online',
      render: (_: unknown, product: Product) => (
        <Tag color={product.onlinePublished ? 'green' : 'default'}>
          {product.onlinePublished ? 'Published' : 'Draft'}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'edit',
      render: (_: unknown, product: Product) =>
        role !== 'cashier' && (
          <Space>
            <Button icon={<InboxOutlined />} onClick={() => setPackagingProduct(product)}>
              Packs
            </Button>
            <Button icon={<EditOutlined />} onClick={() => openEditor(product)}>
              Edit
            </Button>
          </Space>
        ),
    },
  ]

  return (
    <>
      {holder}
      <Card title="Product catalogue">
        <Input.Search
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search product or SKU"
          className="mb-4 max-w-md"
          allowClear
        />
        <Table columns={columns} dataSource={rows} rowKey="id" pagination={{ pageSize: 12 }} />
      </Card>
      <Modal
        title="Edit product"
        open={Boolean(editing)}
        onCancel={() => setEditing(undefined)}
        onOk={() => void form.submit()}
        confirmLoading={saving}
        okText="Save changes"
        destroyOnClose
        width={780}
        className="wide-modal"
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="name" label="Product name" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="sku" label="SKU / barcode" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="description" label="Online description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="imageUrls" hidden>
            <Input />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => {
              const images = currentImages()
              return (
                <div className="mb-5">
                  <div className="mb-2 flex items-center justify-between">
                    <Text strong>Product images</Text>
                    <Text type="secondary" className="text-xs">
                      {images.length} / {MAX_IMAGES}
                    </Text>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {images.map((url, index) => (
                      <div
                        key={url}
                        className="relative h-[76px] w-[76px] overflow-hidden border border-slate-200"
                      >
                        <Image width={76} height={76} className="object-cover" src={url} preview />
                        <Button
                          danger
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          aria-label={`Remove image ${index + 1}`}
                          className="!absolute right-0 top-0 !bg-white"
                          onClick={() =>
                            form.setFieldValue(
                              'imageUrls',
                              images.filter((_, imageIndex) => imageIndex !== index),
                            )
                          }
                        />
                      </div>
                    ))}
                    {images.length < MAX_IMAGES && role !== 'cashier' && (
                      <Upload
                        accept="image/*"
                        showUploadList={false}
                        customRequest={({ file, onSuccess, onError }) => {
                          void uploadImage(file as File)
                            .then(() => onSuccess?.({}))
                            .catch((error: Error) => {
                              api.error(error.message || 'Could not upload image.')
                              onError?.(error)
                            })
                        }}
                      >
                        <Button icon={<UploadOutlined />} loading={uploading}>
                          Upload image
                        </Button>
                      </Upload>
                    )}
                  </div>
                  <Text type="secondary" className="mt-2 block text-xs">
                    Maximum 2 images per product. Each image can be up to 5 MB.
                  </Text>
                </div>
              )
            }}
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="costPrice" label="Cost price (₦)" rules={[{ required: true }]}>
              <CurrencyInput min={0} precision={2} size="large" className="w-full" />
            </Form.Item>
            <Form.Item name="price" label="Selling price (₦)" rules={[{ required: true }]}>
              <CurrencyInput min={0} precision={2} size="large" className="w-full" />
            </Form.Item>
          </div>
          <Form.Item
            name="minimumSellingPrice"
            label="Cashier price floor (₦)"
            extra="Optional. When set, cashiers can agree a lower price down to this amount. Managers/admins can go below it with a reason."
          >
            <CurrencyInput min={0} precision={2} size="large" className="w-full" />
          </Form.Item>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Form.Item name="onlinePublished" label="Online storefront">
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                options={[
                  { label: 'Draft', value: false },
                  { label: 'Published', value: true },
                ]}
              />
            </Form.Item>
            <Form.Item name="active" label="Available for sale">
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                options={[
                  { label: 'Inactive', value: false },
                  { label: 'Active', value: true },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="featured" label="Featured on storefront" valuePropName="checked">
            <Switch checkedChildren="Featured" unCheckedChildren="Regular" />
          </Form.Item>
        </Form>
      </Modal>
      <ProductPackagingModal
        product={packagingProduct}
        open={Boolean(packagingProduct)}
        onClose={() => setPackagingProduct(undefined)}
      />
    </>
  )
}
