import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

export const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2200,
  timerProgressBar: true,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  customClass: {
    popup: 'rounded-lg border border-[var(--color-border-2)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-lg px-3 py-2 font-sans mt-2 mr-2',
    title: 'text-[12px] font-semibold text-[var(--color-text)] m-0 p-0',
    htmlContainer: 'text-[11px] text-[var(--color-muted)] m-0 p-0',
  },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer)
    toast.addEventListener('mouseleave', Swal.resumeTimer)
  }
})

export const showToastNotification = ({ icon = 'success', title, text }) => {
  return Toast.fire({
    icon,
    title: title || text,
    text: title && text ? text : undefined
  })
}

export const MySwal = Swal.mixin({
  heightAuto: false,
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
  return showToastNotification({ icon: 'success', title, text })
}

export const showErrorAlert = (title, text) => {
  return showToastNotification({ icon: 'error', title, text })
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

// Dialog for starting maintenance: asks location (outlet/luar) + issue (kendala)
export const showMaintenanceDialog = ({ title, text, defaultValue = '' }) => {
  const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  return MySwal.fire({
    title,
    text,
    html: `
      <div class="text-left space-y-4">
        <div>
          <label class="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">Lokasi Perbaikan</label>
          <select id="swal-maint-location" class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none">
            <option value="outlet">Di Outlet</option>
            <option value="luar">Keluar / Di Luar</option>
          </select>
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">Kendala / Kerusakan</label>
          <input id="swal-maint-issue" class="swal2-input" placeholder="Contoh: Baterai drop, rem blong" value="${escapeHtml(defaultValue)}" />
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-[var(--color-muted)] mb-1">Catatan Tambahan (opsional)</label>
          <textarea id="swal-maint-note" class="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] outline-none" rows="2" placeholder="Detail kondisi, suku cadang, dll."></textarea>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Mulai Maintenance',
    cancelButtonText: 'Batal',
    reverseButtons: true,
    preConfirm: () => {
      const location = document.getElementById('swal-maint-location').value
      const issue = document.getElementById('swal-maint-issue').value.trim()
      if (!issue) {
        Swal.showValidationMessage('Kendala / kerusakan wajib diisi')
        return false
      }
      const note = document.getElementById('swal-maint-note').value.trim()
      return { location, issue, note }
    }
  })
}
