/** Type breakdown: SD vs SJ summary cards */
export default function TypeSummary({ scooters }) {
  const groups = {
    sd: { label: 'SD (Standar)', available: 0, inUse: 0, maintenance: 0 },
    sj: { label: 'SJ (Jumbo)', available: 0, inUse: 0, maintenance: 0 }
  }

  scooters.forEach(s => {
    const g = groups[s.type]
    if (!g) return
    if (s.status === 'available') g.available++
    else if (s.status === 'in-use') g.inUse++
    else if (s.status === 'maintenance') g.maintenance++
  })

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
          Ringkasan Per Jenis
        </h2>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {Object.entries(groups).map(([key, g]) => (
          <div key={key} className="flex flex-col gap-1.5 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide
                ${key === 'sd'
                  ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                  : 'bg-[var(--color-surface-3)] text-[var(--color-muted)]'
                }`}
              >
                {key.toUpperCase()}
              </span>
              <span className="text-[13px] font-medium text-[var(--color-text)]">{g.label}</span>
            </div>

            <div className="flex items-center gap-3 text-[11px] font-medium">
              <span className="text-[var(--color-green)]">{g.available} tersedia</span>
              <span className="text-[var(--color-border)]">·</span>
              <span className="text-[var(--color-red)]">{g.inUse} dipakai</span>
              {g.maintenance > 0 && (
                <>
                  <span className="text-[var(--color-border)]">·</span>
                  <span className="text-[var(--color-warning)]">{g.maintenance} dirawat</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
