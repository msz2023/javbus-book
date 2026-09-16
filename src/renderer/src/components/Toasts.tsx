import { useApp } from '../state'
import { IconCheck, IconClose } from './Icons'

export function Toasts(): JSX.Element {
  const { toasts, dismissToast } = useApp()

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[340px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto animate-fade-up rounded-xl border px-3.5 py-2.5 shadow-card backdrop-blur
            ${
              t.kind === 'err'
                ? 'border-rose-500/30 bg-rose-950/80'
                : t.kind === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-950/80'
                  : 'border-white/10 bg-ink-700/90'
            }`}
        >
          <div className="flex items-start gap-2">
            <span
              className={`mt-0.5 ${
                t.kind === 'err' ? 'text-rose-400' : t.kind === 'ok' ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              {t.kind === 'ok' ? <IconCheck width={14} height={14} /> : <IconClose width={14} height={14} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug text-slate-100">{t.message}</p>
              {t.detail && (
                <p className="mt-0.5 break-all text-[11px] leading-snug text-slate-400">{t.detail}</p>
              )}
            </div>
            <button
              className="text-slate-500 transition-colors hover:text-slate-200"
              onClick={() => dismissToast(t.id)}
            >
              <IconClose width={13} height={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
