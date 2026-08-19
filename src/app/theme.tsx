import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type ThemeMode = 'light' | 'dark'
type ThemeContextValue = { mode: ThemeMode; toggleTheme: () => void }

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const sharedTokens = {
  colorPrimary: '#0B1121',
  colorInfo: '#0B1121',
  // Shared with the Offline-first status indicator across the product.
  colorSuccess: '#15803d',
  colorSuccessBg: '#f0fdf4',
  colorSuccessBorder: '#bbf7d0',
  colorWarning: '#d97706',
  colorWarningBg: '#fffbeb',
  colorWarningBorder: '#fde68a',
  borderRadius: 4,
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(
    () => (localStorage.getItem('naira-pos-theme') as ThemeMode) || 'light',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = mode
    localStorage.setItem('naira-pos-theme', mode)
  }, [mode])

  const value = useMemo(
    () => ({ mode, toggleTheme: () => setMode((current) => (current === 'light' ? 'dark' : 'light')) }),
    [mode],
  )
  const isDark = mode === 'dark'

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        theme={{
          algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            ...sharedTokens,
            colorPrimary: isDark ? '#cbd5e1' : '#0B1121',
            colorInfo: isDark ? '#cbd5e1' : '#0B1121',
            colorBgBase: isDark ? '#09090b' : '#fafafa',
            colorBgContainer: isDark ? '#111113' : '#ffffff',
            colorText: isDark ? '#fafafa' : '#18181b',
            colorTextSecondary: isDark ? '#a1a1aa' : '#71717a',
            colorBorder: isDark ? '#27272a' : '#e4e4e7',
          },
          components: {
            Layout: {
              bodyBg: isDark ? '#09090b' : '#fafafa',
              headerBg: isDark ? '#09090b' : '#ffffff',
              siderBg: isDark ? '#111113' : '#ffffff',
            },
            Menu: isDark
              ? {
                  darkItemBg: '#111113',
                  darkSubMenuItemBg: '#111113',
                  darkItemSelectedBg: '#27272a',
                  darkItemHoverBg: '#1f1f22',
                }
              : { itemSelectedBg: '#e8edf5', itemHoverBg: '#f1f5f9', itemSelectedColor: '#0B1121' },
            Button: { controlHeight: 40, primaryShadow: '0 6px 18px rgb(124 58 237 / 22%)' },
            Card: { colorBgContainer: isDark ? '#111113' : '#ffffff' },
          },
        }}
      >
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
