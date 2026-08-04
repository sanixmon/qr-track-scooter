import ScooterCard from './ScooterCard'

export default function ScooterGrid({ scooters }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {scooters.map(s => <ScooterCard key={s.id} scooter={s} />)}
    </div>
  )
}
