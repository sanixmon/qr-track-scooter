import { useEffect } from 'react'
import { MySwal } from '../utils/swal'

export default function StatusToggleResult({ result, onClose }) {
  useEffect(() => {
    if (!result) return

    const isSuccess = result.success
    const isCheckout = result.action === 'checkout'

    MySwal.fire({
      icon: isSuccess ? 'success' : 'error',
      title: isSuccess
        ? (isCheckout ? 'Scooter Diambil' : 'Scooter Dikembalikan')
        : 'Gagal',
      text: result.message,
      confirmButtonText: 'OK',
      timer: isSuccess ? 3500 : undefined,
      timerProgressBar: isSuccess,
    }).then(() => {
      if (onClose) onClose()
    })
  }, [result, onClose])

  return null
}
