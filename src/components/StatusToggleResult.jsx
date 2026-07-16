import { CheckCircle2, XCircle } from 'lucide-react'
import { useEffect } from 'react'

export default function StatusToggleResult({ result, onClose }) {
  useEffect(() => {
    if (!result) return
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [result, onClose])

  if (!result) return null

  const isSuccess = result.success
  const isCheckout = result.action === 'checkout'

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="sidebar-overlay fixed inset-0 z-[200]"
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 z-[201] -translate-x-1/2 -translate-y-1/2
        w-[320px] max-w-[90vw] animate-pop-in
        rounded-2xl border border-[var(--color-border-2)]
        bg-[var(--color-surface)] p-8 text-center
        shadow-[0_20px_60px_rgba(0,0,0,0.6)]">

        {/* Icon */}
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full
          ${isSuccess
            ? (isCheckout
                ? 'bg-[var(--color-red-subtle)] text-[var(--color-red)]'
                : 'bg-[var(--color-green-subtle)] text-[var(--color-green)]')
            : 'bg-[var(--color-red-subtle)] text-[var(--color-red)]'
          }`}
        >
          {isSuccess
            ? <CheckCircle2 size={28} />
            : <XCircle size={28} />
          }
        </div>

        <h3 className="mb-1.5 text-[16px] font-semibold text-[var(--color-text)]">
          {isSuccess
            ? (isCheckout ? 'Sepeda Diambil' : 'Sepeda Dikembalikan')
            : 'Gagal'}
        </h3>
        <p className="mb-6 text-[13px] leading-relaxed text-[var(--color-muted)]">
          {result.message}
        </p>

        <button
          onClick={onClose}
          className="rounded-lg bg-[var(--color-accent)] px-6 py-2
            text-[13px] font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
        >
          OK
        </button>
      </div>
    </>
  )
}
