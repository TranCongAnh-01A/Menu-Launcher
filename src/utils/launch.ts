import { LaunchResult } from '../api';

/** Số tên mục hỏng được liệt kê trước khi rút gọn thành "và N mục khác". */
const MAX_NAMES = 3;

/**
 * Gộp kết quả khởi chạy hàng loạt thành một thông báo trung thực — nêu đích danh
 * mục nào không mở được, thay vì luôn báo "đã mở thành công N ứng dụng".
 */
export function summarizeLaunchResult(
  result: LaunchResult
): { message: string; type: 'success' | 'warning' } {
  const failedCount = result.that_bai.length;

  if (failedCount === 0) {
    return { message: `Đã mở ${result.da_mo} ứng dụng`, type: 'success' };
  }

  const names = result.that_bai.slice(0, MAX_NAMES).join(', ');
  const more = failedCount > MAX_NAMES ? ` và ${failedCount - MAX_NAMES} mục khác` : '';
  const failedPart = `Không mở được: ${names}${more}`;

  return {
    message: result.da_mo > 0 ? `Đã mở ${result.da_mo} ứng dụng. ${failedPart}` : failedPart,
    type: 'warning',
  };
}
