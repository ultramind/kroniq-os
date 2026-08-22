import type { ReceiptItem, Sale } from '../types'
import { formatNaira } from './currency'
import { getStoredOfflineWorkspace } from './offlineWorkspace'
import { getStoreSettings } from './storeSettings'

export type PrinterSettings = {
  printerName?: string
  paperWidth: '58mm' | '80mm'
}

const fallbackSettings: PrinterSettings = { paperWidth: '80mm' }

function settingsKey() {
  const workspace = getStoredOfflineWorkspace()
  return `kroniqos-printer:${workspace?.userId ?? 'device'}:${workspace?.organizationId ?? 'default'}`
}

export function getPrinterSettings(): PrinterSettings {
  try {
    return { ...fallbackSettings, ...JSON.parse(localStorage.getItem(settingsKey()) ?? '{}') }
  } catch {
    return fallbackSettings
  }
}

export function savePrinterSettings(settings: PrinterSettings) {
  localStorage.setItem(settingsKey(), JSON.stringify(settings))
}

async function getQz() {
  const module = await import('qz-tray')
  return module.default ?? module
}

let connectingQz: Promise<any> | undefined

async function connectQz() {
  const qz = await getQz()
  if (qz.websocket.isActive()) return qz
  // React Strict Mode and a manual “Find printers” tap can overlap during
  // startup. QZ Tray mutates one shared websocket instance, so opening two
  // connections concurrently corrupts its handshake.
  if (!connectingQz) {
    connectingQz = qz.websocket
      .connect({ retries: 1, delay: 0 })
      .then(() => qz)
      .finally(() => {
        connectingQz = undefined
      })
  }
  return await connectingQz
}

export async function findSystemPrinters(): Promise<string[]> {
  const qz = await connectQz()
  const printers = await qz.printers.find()
  return Array.isArray(printers) ? printers : [printers]
}

export async function printTestReceipt(printerName: string, paperWidth: PrinterSettings['paperWidth']) {
  const qz = await connectQz()
  const config = qz.configs.create(printerName, {
    units: 'mm',
    size: { width: paperWidth === '58mm' ? 58 : 80, height: 70 },
    rasterize: true,
    scaleContent: true,
    jobName: 'Kroniqos printer test',
  })
  await qz.print(config, [
    {
      type: 'pixel',
      format: 'html',
      flavor: 'plain',
      data: '<main style="font-family:Arial,sans-serif;text-align:center;padding:8px"><strong>Kroniqos</strong><br/><span style="font-size:12px">Printer connected successfully</span></main>',
    },
  ])
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }
    return entities[character]
  })
}

export function receiptHtml({
  sale,
  items,
  companyName,
  logoUrl,
}: {
  sale: Sale
  items: ReceiptItem[]
  companyName: string
  logoUrl?: string
}) {
  const settings = getStoreSettings()
  const initialPayment = sale.creditInitialPayment ?? 0
  const balance = Math.max(0, sale.total - initialPayment)
  const creditOrOrder = sale.paymentMethod === 'credit' || sale.paymentMethod === 'order'
  const lineItems = items
    .map(
      (item) =>
        `<tr><td><strong>${escapeHtml(item.productName)}</strong><br><span>${item.quantity} × ${formatNaira(item.unitPrice)}</span></td><td>${formatNaira(item.quantity * item.unitPrice)}</td></tr>`,
    )
    .join('')
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="" style="max-height:38px;max-width:150px;object-fit:contain;margin-bottom:5px">`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}body{font-family:Arial,sans-serif;color:#111;font-size:12px;line-height:1.35}.receipt{padding:7px 8px}.center{text-align:center}.name{font-size:17px;font-weight:800;margin:0 0 2px}.muted{font-size:10px;color:#444}.rule{border:0;border-top:1px dashed #555;margin:9px 0}.meta{font-size:11px}.meta div{display:flex;justify-content:space-between;gap:8px;margin:2px 0}.items{width:100%;border-collapse:collapse}.items td{padding:5px 0;vertical-align:top}.items td:last-child{text-align:right;white-space:nowrap}.items span{font-size:10px;color:#444}.total{display:flex;justify-content:space-between;font-size:15px;font-weight:800;margin-top:8px}.summary{font-size:11px;margin-top:7px}.summary div{display:flex;justify-content:space-between;margin:3px 0}.footer{text-align:center;font-size:10px;margin-top:12px;color:#444}</style></head><body><main class="receipt"><div class="center">${logo}<p class="name">${escapeHtml(companyName)}</p><div class="muted">${escapeHtml(settings.address || 'Sales receipt')}${settings.phone ? ` · ${escapeHtml(settings.phone)}` : ''}</div></div><hr class="rule"><div class="meta"><div><span>Receipt</span><strong>${escapeHtml(sale.receiptNo)}</strong></div><div><span>Date</span><span>${escapeHtml(new Date(sale.createdAt).toLocaleString('en-NG'))}</span></div><div><span>Payment</span><span>${escapeHtml(sale.paymentMethod.replace('_', ' '))}</span></div></div><hr class="rule"><table class="items"><tbody>${lineItems}</tbody></table><hr class="rule"><div class="total"><span>Total</span><span>${formatNaira(sale.total)}</span></div>${creditOrOrder ? `<div class="summary"><div><span>${sale.paymentMethod === 'order' ? 'Amount paid' : 'Initial deposit'}</span><span>${formatNaira(initialPayment)}</span></div><div><strong>Balance due</strong><strong>${formatNaira(balance)}</strong></div></div>` : ''}<div class="footer">${escapeHtml(settings.receiptFooter || 'Thank you for shopping with us.')}</div></main></body></html>`
}

export function receiptShareText({
  sale,
  items,
  companyName,
}: {
  sale: Sale
  items: ReceiptItem[]
  companyName: string
}) {
  const settings = getStoreSettings()
  const initialPayment = sale.creditInitialPayment ?? 0
  const balance = Math.max(0, sale.total - initialPayment)
  const lines = [
    companyName,
    settings.address,
    settings.phone,
    '',
    `Receipt: ${sale.receiptNo}`,
    `Date: ${new Date(sale.createdAt).toLocaleString('en-NG')}`,
    `Payment: ${sale.paymentMethod.replace('_', ' ')}`,
    '',
    ...items.map(
      (item) =>
        `${item.productName}\n${item.quantity} × ${formatNaira(item.unitPrice)} = ${formatNaira(item.quantity * item.unitPrice)}`,
    ),
    '',
    `TOTAL: ${formatNaira(sale.total)}`,
  ].filter(Boolean)
  if (sale.paymentMethod === 'credit' || sale.paymentMethod === 'order') {
    lines.push(
      `${sale.paymentMethod === 'order' ? 'Amount paid' : 'Initial deposit'}: ${formatNaira(initialPayment)}`,
      `Balance due: ${formatNaira(balance)}`,
    )
  }
  lines.push('', settings.receiptFooter || 'Thank you for shopping with us.')
  return lines.join('\n')
}

export async function printReceiptDirect(input: {
  sale: Sale
  items: ReceiptItem[]
  companyName: string
  logoUrl?: string
}) {
  const settings = getPrinterSettings()
  if (!settings.printerName) throw new Error('Choose a printer in Settings → Printing first.')
  const qz = await connectQz()
  const config = qz.configs.create(settings.printerName, {
    units: 'mm',
    size: { width: settings.paperWidth === '58mm' ? 58 : 80, height: 297 },
    rasterize: true,
    scaleContent: true,
    jobName: `Kroniqos receipt ${input.sale.receiptNo}`,
  })
  await qz.print(config, [{ type: 'pixel', format: 'html', flavor: 'plain', data: receiptHtml(input) }])
}
