import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Kiểm tra bản cập nhật trên GitHub Releases.
 *
 * Trả về `null` khi đang là bản mới nhất. Ném lỗi khi không kiểm tra được
 * (mất mạng, chưa có release, pubkey chưa cấu hình...) — nơi gọi tự quyết định
 * có báo người dùng hay im lặng.
 */
export async function checkForUpdate(): Promise<Update | null> {
  return await check();
}

/** Tải, cài bản cập nhật rồi khởi động lại ứng dụng. */
export async function installUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
