import { ShoppingOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { formatNaira } from '../lib/currency'
import {
  readCustomerDisplay,
  subscribeToCustomerDisplay,
  type CustomerDisplayState,
} from '../features/pos/customerDisplay'

const paymentLabels = {
  cash: 'Cash payment',
  card: 'Card / POS payment',
  transfer: 'Bank transfer',
  credit: 'Credit sale',
  order: 'Customer order',
}

export function CustomerDisplayPage() {
  const [sale, setSale] = useState<CustomerDisplayState>(readCustomerDisplay)
  useEffect(() => subscribeToCustomerDisplay(setSale), [])
  const itemCount = sale.cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <main className="customer-display min-h-screen px-6 py-8 text-white sm:px-12 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-slate-700/70 pb-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center bg-white text-[#0B1121]">
              <ShoppingOutlined />
            </div>
            <div>
              <p className="m-0 text-xs font-semibold uppercase tracking-[.2em] text-slate-400">Kroniqos</p>
              <h1 className="m-0 text-xl font-semibold">Your order</h1>
            </div>
          </div>
          <span className="text-sm text-slate-400">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
        </header>

        <section className="flex flex-1 flex-col justify-center py-10">
          {sale.cart.length === 0 ? (
            <div className="text-center">
              <ShoppingOutlined className="text-5xl text-slate-600" />
              <h2 className="mb-2 mt-6 text-3xl font-semibold">Ready for your order</h2>
              <p className="text-lg text-slate-400">Your items will appear here as they are scanned.</p>
            </div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
              <div className="divide-y divide-slate-800 border-y border-slate-800">
                {sale.cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-6 py-5">
                    <div className="min-w-0">
                      <p className="m-0 truncate text-xl font-medium">{item.name}</p>
                      <p className="mb-0 mt-1 text-sm text-slate-400">
                        {formatNaira(item.price)} × {item.quantity}
                      </p>
                    </div>
                    <p className="m-0 whitespace-nowrap text-xl font-semibold">
                      {formatNaira(item.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
              <aside className="customer-total border border-slate-700 p-7">
                <p className="m-0 text-sm font-medium uppercase tracking-[.14em] text-slate-400">
                  Amount due
                </p>
                <p className="my-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                  {formatNaira(sale.total)}
                </p>
                <p className="m-0 border-t border-slate-700 pt-4 text-sm text-slate-300">
                  {paymentLabels[sale.paymentMethod]}
                </p>
              </aside>
            </div>
          )}
        </section>
        <footer className="border-t border-slate-800 pt-5 text-center text-xs text-slate-500">
          Thank you for shopping with us
        </footer>
      </div>
    </main>
  )
}
