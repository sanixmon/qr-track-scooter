import { CheckCircle2, CircleDot, Layers, Activity } from 'lucide-react'
import { isToday } from 'date-fns'

export default function DashboardStats({ scooters, activityLog }) {
  const total     = scooters.length
  const available = scooters.filter(s => s.status === 'available').length
  const inUse     = scooters.filter(s => s.status === 'in-use').length
  const todayAct  = activityLog.filter(e => {
    try { return isToday(new Date(e.timestamp)) } catch { return false }
  }).length

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Tersedia"        value={available} icon={CheckCircle2} valueColor="text-[var(--color-green)]"  iconBg="bg-[var(--color-green-subtle)]"  iconColor="text-[var(--color-green)]"  />
      <StatCard label="Digunakan"       value={inUse}     icon={CircleDot}    valueColor="text-[var(--color-red)]"    iconBg="bg-[var(--color-red-subtle)]"    iconColor="text-[var(--color-red)]"    />
      <StatCard label="Total Sepeda"    value={total}     icon={Layers}       valueColor="text-[var(--color-text)]"   iconBg="bg-[var(--color-accent-subtle)]" iconColor="text-[var(--color-accent)]" />
      <StatCard label="Aktivitas Hari Ini" value={todayAct} icon={Activity}  valueColor="text-[var(--color-accent)]" iconBg="bg-[var(--color-accent-subtle)]" iconColor="text-[var(--color-accent)]" />
    </div>
  )
}

function StatCard({ label, value, icon: Icon, valueColor, iconBg, iconColor }) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm hover:shadow-md hover:border-[var(--color-border-2)] transition-all px-4 py-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconColor} group-hover:scale-105 transition-transform`}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <p className={`text-[22px] font-bold leading-none ${valueColor}`}>{value}</p>
        <p className="mt-1 truncate text-[11px] text-[var(--color-muted)]">{label}</p>
      </div>
    </div>
  )
}
