/**
 * Có lớp phủ nào đang mở không (modal, context menu).
 *
 * Các phím tắt điều hướng toàn cục phải nhường quyền cho lớp phủ: khi hộp thoại
 * đang mở, Enter/Escape/mũi tên thuộc về nó chứ không phải danh sách bên dưới.
 *
 * Mọi modal trong dự án đều dùng class `.modal-backdrop`; các lớp phủ khác đánh
 * dấu bằng thuộc tính `data-overlay`.
 */
export function hasOpenOverlay(): boolean {
  return document.querySelector('.modal-backdrop, [data-overlay]') !== null;
}

/** Sự kiện yêu cầu đưa con trỏ về ô tìm kiếm. */
export const FOCUS_SEARCH_EVENT = 'app-focus-search';
