/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { brand: { 500: '#167843', 600: '#116b38' } } } },
  plugins: [],
}
