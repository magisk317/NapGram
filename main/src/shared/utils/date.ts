export function formatDate(ts: number | Date, formatStr: string = 'yyyy-MM-dd HH:mm') {
  const date = typeof ts === 'number' ? new Date(ts) : ts
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const H = String(date.getHours()).padStart(2, '0')
  const M = String(date.getMinutes()).padStart(2, '0')

  // Basic replacement for now, expand if needed
  return formatStr
    .replace('yyyy', String(y))
    .replace('MM', m)
    .replace('dd', d)
    .replace('HH', H)
    .replace('mm', M)
}
