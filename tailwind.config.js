/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0b0d12',
          800: '#111420',
          700: '#161a28',
          600: '#1d2233',
          500: '#262c41',
          400: '#3a4260'
        },
        accent: {
          DEFAULT: '#f43f7f',
          soft: '#ff6b9d',
          deep: '#c81e5b'
        },
        teal: {
          glow: '#2dd4bf'
        },
        /** 遥测数据用的青色：和粉色主色分工——粉是操作，青是读数 */
        data: {
          DEFAULT: '#38e0d0',
          dim: '#1b8f88',
          deep: '#0e3f42'
        }
      },
      fontFamily: {
        sans: [
          '"Segoe UI"',
          '"Microsoft YaHei UI"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif'
        ],
        mono: [
          '"JetBrains Mono"',
          '"Cascadia Mono"',
          'Consolas',
          '"SF Mono"',
          'ui-monospace',
          'monospace'
        ]
      },
      boxShadow: {
        card: '0 10px 30px -12px rgba(0,0,0,.65)',
        glow: '0 0 0 1px rgba(244,63,127,.35), 0 8px 30px -8px rgba(244,63,127,.35)',
        hud: 'inset 0 1px 0 0 rgba(255,255,255,.06), 0 8px 24px -14px rgba(0,0,0,.9)',
        'data-glow': '0 0 0 1px rgba(56,224,208,.35), 0 0 18px -6px rgba(56,224,208,.45)'
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        },
        'pulse-dot': {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '.35', transform: 'scale(.82)' }
        },
        'meter-flow': {
          '100%': { backgroundPosition: '-24px 0' }
        }
      },
      animation: {
        'fade-up': 'fade-up .28s ease-out both',
        shimmer: 'shimmer 1.4s infinite',
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
        'meter-flow': 'meter-flow .7s linear infinite'
      }
    }
  },
  plugins: []
}
