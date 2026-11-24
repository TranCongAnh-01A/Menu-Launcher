import { addItem } from '../api';

/** Chữ ký của hàm `confirm` từ NotificationContext. */
type ConfirmFn = (
  message: string,
  options?: { title?: string; confirmText?: string; cancelText?: string }
) => Promise<boolean>;

export interface AddItemsOutcome {
  successCount: number;
  /** Các mục bị bỏ qua vì đã tồn tại, hoặc người dùng chọn giữ nguyên nhóm cũ. */
  skipped: string[];
  errors: string[];
}

/**
 * Thêm một loạt đường dẫn vào nhóm, hỏi xác nhận khi mục đã nằm ở nhóm khác.
 *
 * Dùng chung cho cả hộp thoại "Thêm mục" và luồng kéo-thả file, để hai nơi không
 * thể xử lý kết quả lệch nhau.
 */
export async function addItemsToGroup(
  paths: string[],
  groupId: string,
  confirm: ConfirmFn
): Promise<AddItemsOutcome> {
  const outcome: AddItemsOutcome = { successCount: 0, skipped: [], errors: [] };

  for (const rawPath of paths) {
    const path = rawPath.trim();
    if (!path) continue;

    try {
      const result = await addItem(path, groupId);

      switch (result.trang_thai) {
        case 'added':
        case 'moved_orphan':
          outcome.successCount++;
          break;

        case 'already_exists':
          outcome.skipped.push(path);
          break;

        case 'needs_confirm': {
          const confirmed = await confirm(
            `"${result.ten}" đang nằm ở nhóm "${result.nhom_hien_tai}".\nBạn có muốn chuyển sang nhóm hiện tại không?`,
            { title: 'Phát hiện trùng lặp', confirmText: 'Chuyển nhóm', cancelText: 'Giữ nguyên' }
          );
          if (confirmed) {
            await addItem(path, groupId, true);
            outcome.successCount++;
          } else {
            outcome.skipped.push(path);
          }
          break;
        }
      }
    } catch (e) {
      outcome.errors.push(String(e));
    }
  }

  return outcome;
}

/** Gộp kết quả thành một thông báo duy nhất. Trả về null nếu không có gì để báo. */
export function summarizeAddOutcome(
  outcome: AddItemsOutcome
): { message: string; type: 'success' | 'warning' | 'info' } | null {
  const { successCount, skipped, errors } = outcome;

  if (successCount > 0) {
    const warnings = errors.length + skipped.length;
    return warnings > 0
      ? {
          message: `Đã thêm ${successCount} mục. ${warnings} mục bị bỏ qua (trùng lặp hoặc lỗi).`,
          type: 'warning',
        }
      : { message: `Đã thêm thành công ${successCount} mục vào Menu`, type: 'success' };
  }

  if (errors.length > 0) {
    return { message: errors[0], type: 'warning' };
  }

  if (skipped.length > 0) {
    return { message: 'Tất cả mục đã tồn tại hoặc được giữ nguyên nhóm cũ.', type: 'info' };
  }

  return null;
}
