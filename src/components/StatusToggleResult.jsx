import { useEffect } from 'react'
import { showToastNotification } from '../utils/swal'

export default function StatusToggleResult({ result, onClose }) {
  useEffect(() => {
    if (!result) return

    const isSuccess = result.success
    const isCheckout = result.action === 'checkout'

    showToastNotification({
      icon: isSuccess ? 'success' : 'error',
      title: isSuccess
        ? (isCheckout ? 'Scooter Diambil' : 'Scooter Dikembalikan')
        : 'Gagal',
      text: result.message,
    }).then(() => {
      if (onClose) onClose()
    })
  }, [result, onClose])

  return null
}
