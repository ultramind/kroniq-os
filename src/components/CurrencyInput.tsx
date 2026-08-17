import { InputNumber, type InputNumberProps } from 'antd'

type CurrencyInputProps = InputNumberProps<number>

/** A numeric input that groups Naira amounts as they are entered. */
export function CurrencyInput({ formatter, parser, prefix, ...props }: CurrencyInputProps) {
  return (
    <InputNumber
      {...props}
      prefix={prefix ?? '₦'}
      formatter={
        formatter ??
        ((value) => {
          if (value === undefined || value === null) return ''
          const [whole, decimal] = String(value).split('.')
          const grouped = Number(whole || 0).toLocaleString('en-NG')
          return decimal === undefined ? grouped : `${grouped}.${decimal}`
        })
      }
      parser={parser ?? ((value) => Number((value ?? '').replace(/[^0-9.-]/g, '')))}
    />
  )
}
