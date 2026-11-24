import type { Item } from '../api';

/** Nhóm ảo ở sidebar — không lưu vào dữ liệu. */
export const HAY_DUNG_ID = '__hay_dung__';
export const GAN_DAY_ID = '__gan_day__';
export const VIRTUAL_LIMIT = 20;

export function isVirtualGroup(id: string): boolean {
  return id === HAY_DUNG_ID || id === GAN_DAY_ID;
}

/** Hay dùng: top 20 theo số lần mở (> 0), ngang nhau thì mở gần đây hơn xếp trước. */
export function topUsed(items: Item[], limit = VIRTUAL_LIMIT): Item[] {
  return items
    .filter((i) => i.so_lan_mo > 0)
    .sort((a, b) => b.so_lan_mo - a.so_lan_mo || (b.lan_mo_cuoi ?? 0) - (a.lan_mo_cuoi ?? 0))
    .slice(0, limit);
}

/** Gần đây: top 20 theo lần mở cuối. */
export function recentlyUsed(items: Item[], limit = VIRTUAL_LIMIT): Item[] {
  return items
    .filter((i) => i.lan_mo_cuoi != null)
    .sort((a, b) => (b.lan_mo_cuoi ?? 0) - (a.lan_mo_cuoi ?? 0))
    .slice(0, limit);
}

/** Nhóm thật dùng làm đích khi thêm mục mới (nhóm ảo / Tất cả -> Khác). */
export function realGroupOrDefault(id: string | null | undefined): string {
  return !id || id === 'tatca' || isVirtualGroup(id) ? 'grp-default' : id;
}
