/**
 * Tìm kiếm thông minh cho danh sách mục: không phân biệt hoa thường / dấu tiếng
 * Việt, hiểu chữ cái đầu ("vsc" -> "Visual Studio Code") và gõ thiếu chữ
 * (subsequence). Hàm thuần, không phụ thuộc React.
 */

/** Các trường tối thiểu cần để xếp hạng (tương thích `Item`). */
export interface SearchableItem {
  ten: string;
  duong_dan: string;
  tham_so?: string;
  so_lan_mo?: number;
  lan_mo_cuoi?: number | null;
}

/** Chuẩn hoá: lowercase, bỏ dấu tiếng Việt (NFD + bỏ dấu kết hợp, đ -> d). */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

/** Tách thành các "từ" (chuỗi chữ-số liên tục) kèm vị trí bắt đầu. */
function words(s: string): string[] {
  return s.split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Điểm khớp của `q` (đã chuẩn hoá) với một trường (đã chuẩn hoá); 0 = không khớp.
 * Thứ bậc: chuỗi con liên tục > đầu từ / chữ cái đầu > subsequence.
 */
export function scoreField(q: string, field: string): number {
  if (!q || !field) return 0;

  // 1. Chuỗi con liên tục — cao nhất; thưởng khi ở đầu chuỗi hoặc đầu từ.
  const idx = field.indexOf(q);
  if (idx >= 0) {
    const atWordStart = idx === 0 || /[^a-z0-9]/.test(field[idx - 1]);
    return 1000 + (idx === 0 ? 200 : atWordStart ? 100 : 0) - Math.min(idx, 100) * 0.5
      - Math.min(field.length - q.length, 100) * 0.2;
  }

  // 2a. Mỗi từ của truy vấn là tiền tố của một từ riêng trong trường ("vis stu").
  const fWords = words(field);
  const qTokens = q.split(/\s+/).filter(Boolean);
  if (qTokens.length > 1) {
    let from = 0;
    let ok = true;
    for (const t of qTokens) {
      const at = fWords.findIndex((w, i) => i >= from && w.startsWith(t));
      if (at < 0) {
        ok = false;
        break;
      }
      from = at + 1;
    }
    if (ok) return 800;
  }

  // 2b. Chữ cái đầu các từ ("vsc" -> Visual Studio Code).
  const compact = q.replace(/\s+/g, '');
  const initials = fWords.map((w) => w[0]).join('');
  if (compact.length >= 2) {
    const ii = initials.indexOf(compact);
    if (ii >= 0) return 700 + (ii === 0 ? 50 : 0);
  }

  // 3. Subsequence (fuzzy): các ký tự xuất hiện đúng thứ tự, khoảng cách không quá xa.
  if (compact.length >= 2) {
    let pos = -1;
    let first = -1;
    for (const ch of compact) {
      pos = field.indexOf(ch, pos + 1);
      if (pos < 0) return 0;
      if (first < 0) first = pos;
    }
    const span = pos - first + 1;
    if (span > compact.length * 4 + 4) return 0;
    return Math.max(50, 400 - (span - compact.length) * 8 - first * 2);
  }
  return 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Điểm của một mục với truy vấn đã chuẩn hoá; 0 = không khớp. */
export function scoreItem(q: string, item: SearchableItem, now: number): number {
  const byName = scoreField(q, normalize(item.ten));
  const byPath = scoreField(q, normalize(item.duong_dan)) * 0.35;
  const byArgs = scoreField(q, normalize(item.tham_so ?? '')) * 0.3;
  const match = Math.max(byName, byPath, byArgs);
  if (match <= 0) return 0;

  // Thưởng nhỏ: dùng nhiều + mở gần đây (không đủ để vượt khớp tốt hơn một bậc).
  const usage = 30 * Math.log((item.so_lan_mo ?? 0) + 1);
  const age = item.lan_mo_cuoi ? Math.max(0, now - item.lan_mo_cuoi) : Infinity;
  const recency = Number.isFinite(age) ? 40 * Math.exp(-age / (7 * DAY_MS)) : 0;
  return match + usage + recency;
}

/**
 * Lọc + xếp hạng. Truy vấn rỗng trả nguyên danh sách. Ngang điểm giữ thứ tự gốc.
 */
export function searchItems<T extends SearchableItem>(
  items: T[],
  query: string,
  now: number = Date.now()
): T[] {
  const q = normalize(query).trim();
  if (!q) return items;
  return items
    .map((item, index) => ({ item, index, score: scoreItem(q, item, now) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}
