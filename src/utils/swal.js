import Swal from 'sweetalert2'

export const MySwal = Swal.mixin({
  customClass: {
    popup: 'rounded-2xl border border-[var(--color-border-2)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-2xl p-6 font-sans',
    title: 'text-[18px] font-bold text-[var(--color-text)]',
    htmlContainer: 'text-[13px] text-[var(--color-muted)] leading-relaxed',
    confirmButton: 'rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer shadow-sm mx-1',
    cancelButton: 'rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-3)] px-5 py-2.5 text-[13px] font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-border)] cursor-pointer mx-1',
    input: 'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none w-full my-2',
  },
  buttonsStyling: false,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
})

export const showSuccessAlert = (title, text) => {
  return MySwal.fire({
    icon: 'success',
    title,
    text,
    timer: 3500,
    timerProgressBar: true,
    showConfirmButton: true,
    confirmButtonText: 'OK'
  })
}

export const showErrorAlert = (title, text) => {
  return MySwal.fire({
    icon: 'error',
    title,
    text,
    confirmButtonText: 'Tutup'
  })
}

export const showConfirmDialog = ({ title, text, confirmText = 'Ya, Lanjutkan', cancelText = 'Batal', icon = 'warning' }) => {
  return MySwal.fire({
    icon,
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true
  })
}

export const showPromptDialog = ({ title, text, placeholder = '', defaultValue = '', inputType = 'text' }) => {
  return MySwal.fire({
    title,
    text,
    input: inputType,
    inputValue: defaultValue,
    inputPlaceholder: placeholder,
    showCancelButton: true,
    confirmButtonText: 'Simpan',
    cancelButtonText: 'Batal',
    reverseButtons: true
  })
}
