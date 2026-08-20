import { create } from 'zustand'
import type { CartItem, PaymentMethod, Product, Role } from './types'
import { playCheckoutSound } from './lib/checkoutSound'

type PosState = {
  cart: CartItem[]
  role: Role
  search: string
  paymentMethod: PaymentMethod
  discountPercent: number
  setRole: (role: Role) => void
  setSearch: (search: string) => void
  setPaymentMethod: (method: PaymentMethod) => void
  setDiscountPercent: (value: number) => void
  replaceCart: (cart: CartItem[]) => void
  addToCart: (product: Product) => void
  addToCartQuantity: (
    product: Product,
    quantity: number,
    agreedPrice?: number,
    priceOverrideReason?: string,
  ) => void
  updateQuantity: (id: string, quantity: number) => void
  updateUnitPrice: (id: string, price: number) => void
  clearCart: () => void
  resetSession: () => void
}

export const usePosStore = create<PosState>((set) => ({
  cart: [],
  role: 'cashier',
  search: '',
  paymentMethod: 'cash',
  discountPercent: 0,
  setRole: (role) => set({ role }),
  setSearch: (search) => set({ search }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setDiscountPercent: (discountPercent) => set({ discountPercent }),
  replaceCart: (cart) => set({ cart }),
  addToCart: (product) =>
    set((state) => {
      const item = state.cart.find((cartItem) => cartItem.id === product.id)
      if (item) {
        playCheckoutSound('add')
        return {
          cart: state.cart.map((cartItem) =>
            cartItem.id === product.id
              ? { ...cartItem, quantity: Math.min(cartItem.quantity + 1, product.stock) }
              : cartItem,
          ),
        }
      }
      if (!product.stock) return state
      playCheckoutSound('add')
      return { cart: [...state.cart, { ...product, quantity: 1 }] }
    }),
  addToCartQuantity: (product, quantity, agreedPrice = product.price, priceOverrideReason) =>
    set((state) => {
      const quantityToAdd = Math.max(0, Math.floor(quantity))
      if (!quantityToAdd || !product.stock) return state
      playCheckoutSound('add')
      const item = state.cart.find((cartItem) => cartItem.id === product.id)
      if (item)
        return {
          cart: state.cart.map((cartItem) =>
            cartItem.id === product.id
              ? {
                  ...cartItem,
                  price: agreedPrice,
                  listPrice: cartItem.listPrice ?? product.price,
                  priceOverrideReason,
                  quantity: Math.min(cartItem.quantity + quantityToAdd, product.stock),
                }
              : cartItem,
          ),
        }
      return {
        cart: [
          ...state.cart,
          {
            ...product,
            price: agreedPrice,
            listPrice: product.price,
            priceOverrideReason,
            quantity: Math.min(quantityToAdd, product.stock),
          },
        ],
      }
    }),
  updateQuantity: (id, quantity) =>
    set((state) => ({
      cart:
        quantity < 1
          ? state.cart.filter((item) => item.id !== id)
          : state.cart.map((item) => (item.id === id ? { ...item, quantity } : item)),
    })),
  updateUnitPrice: (id, price) =>
    set((state) => ({
      cart: state.cart.map((item) =>
        item.id === id ? { ...item, price: Math.max(0, Number.isFinite(price) ? price : item.price) } : item,
      ),
    })),
  clearCart: () => {
    playCheckoutSound('clear')
    set({ cart: [], search: '', paymentMethod: 'cash', discountPercent: 0 })
  },
  resetSession: () =>
    set({ cart: [], search: '', paymentMethod: 'cash', discountPercent: 0, role: 'cashier' }),
}))
