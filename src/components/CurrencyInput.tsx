import { InputNumber, type InputNumberProps } from 'antd'

type CurrencyInputProps = InputNumberProps<number>

/** A numeric input that groups Naira amounts as they are entered. */
export function CurrencyInput({ formatter, parser, prefix, onKeyDown, ...props }: CurrencyInputProps) {
  return (
    <InputNumber
      {...props}
      prefix={prefix ?? '₦'}
      inputMode="decimal"
      pattern="[0-9]*"
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
        if (/^[0-9.]$/.test(event.key)) return
        if (
          [
            'Backspace',
            'Delete',
            'Tab',
            'Enter',
            'Escape',
            'ArrowLeft',
            'ArrowRight',
            'Home',
            'End',
          ].includes(event.key)
        )
          return
        event.preventDefault()
      }}
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
