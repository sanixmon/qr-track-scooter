import { Wifi, WifiOff, Wrench, Layers } from 'lucide-react'

export default function DashboardStats({ scooters }) {
  const online  = scooters.filter(s => s.status === 'in-use').length
  const offline = scooters.filter(s => s.status === 'rusak').length
  const maint   = scooters.filter(s => s.status === 'maintenance').length
  const total   = scooters.length

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Online"
        sub="Sedang digunakan"
        value={online}
        icon={Wifi}
        valueColor="text-[var(--color-accent)]"
        iconBg="bg-[var(--color-accent-subtle)]"
        iconColor="text-[var(--color-accent)]"
      />
      <StatCard
        label="Offline"
        sub="Rusak di outlet"
        value={offline}
        icon={WifiOff}
        valueColor="text-[var(--color-red)]"
        iconBg="bg-[var(--color-red-subtle)]"
        iconColor="text-[var(--color-red)]"
      />
      <StatCard
        label="Maintenance"
        sub="Dalam perbaikan"
        value={maint}
        icon={Wrench}
        valueColor="text-[var(--color-warning)]"
        iconBg="bg-[var(--color-warning-subtle)]"
        iconColor="text-[var(--color-warning)]"
      />
      <StatCard
        label="Total Unit"
        sub="Seluruh armada"
        value={total}
        icon={Layers}
        valueColor="text-[var(--color-text)]"
        iconBg="bg-[var(--color-surface-3)]"
        iconColor="text-[var(--color-muted)]"
      />
    </div>
  )
}

function StatCard({ label, sub, value, icon: Icon, valueColor, iconBg, iconColor }) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm hover:shadow-md hover:border-[var(--color-border-2)] transition-all px-4 py-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg} ${iconColor} group-hover:scale-105 transition-transform`}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <p className={`text-[22px] font-bold leading-none ${valueColor}`}>{value}</p>
        <p className="mt-1 truncate text-[11px] text-[var(--color-muted)]">{label}</p>
        <p className="truncate text-[10px] text-[var(--color-subtle)]">{sub}</p>
      </div>
    </div>
  )
}
