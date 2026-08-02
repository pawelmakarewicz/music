export function clean(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/[–—]/g, '-').trim();
}

export function key(value: string): string {
  return clean(value).toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function similarity(left: string, right: string): number {
  const a = key(left); const b = key(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const as = new Set(a.split(' ')); const bs = new Set(b.split(' '));
  const shared = [...as].filter((word) => bs.has(word)).length;
  return (2 * shared) / (as.size + bs.size);
}
