const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Super'];

/** F1–F24 — những phím duy nhất được phép dùng đơn lẻ làm phím tắt toàn cục. */
const FUNCTION_KEY = /^F([1-9]|1\d|2[0-4])$/;

/** Thông báo giải thích quy tắc, dùng chung cho toast và nhãn trạng thái. */
export const SHORTCUT_HINT =
  'Cần ít nhất 1 phím bổ trợ (Ctrl, Alt, Shift, Super) kèm 1 phím chính — hoặc một phím chức năng F1–F12.';

/** Tổ hợp phím mặc định, dùng cho lần chạy đầu và khi migrate cấu hình cũ. */
export const DEFAULT_SHORTCUT_KEYS = ['Ctrl', 'Shift', 'M'];

const STORAGE_KEY = 'app_shortcut_keys';
/** Key lưu trữ cũ — vẫn ghi kèm để giữ tương thích ngược. */
const LEGACY_STORAGE_KEY = 'app_global_shortcut';

/** Đọc tổ hợp phím đã lưu (kể cả từ key cũ). Trả về null nếu chưa từng lưu. */
export function readSavedShortcutKeys(): string[] | null {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  return saved ? saved.split('+') : null;
}

/** Như trên, nhưng thay bằng tổ hợp mặc định nếu chưa lưu hoặc giá trị đã lưu không còn hợp lệ. */
export function readShortcutKeysOrDefault(): string[] {
  const saved = readSavedShortcutKeys();
  return saved && isValidShortcut(saved) ? saved : [...DEFAULT_SHORTCUT_KEYS];
}

/**
 * Phím tắt toàn cục có đang bật không — dùng chung cho MainWindow và SettingsModal.
 * Cờ `null` (cấu hình cũ) nhưng đã có phím lưu → coi là bật, trừ khi người dùng đã chọn bỏ qua.
 */
export function isShortcutEnabled(): boolean {
  const flag = localStorage.getItem('app_shortcut_enabled');
  if (flag === 'true') return true;
  if (flag === null) {
    return readSavedShortcutKeys() !== null && localStorage.getItem('app_has_configured_shortcut') !== 'skipped';
  }
  return false;
}

/** Ghi tổ hợp phím vào cả key mới và key cũ. */
export function persistShortcut(keys: string[]): void {
  const value = keys.join('+');
  localStorage.setItem(STORAGE_KEY, value);
  localStorage.setItem(LEGACY_STORAGE_KEY, value);
}

/** Phân giải phím chính (chữ, số, phím chức năng, phím đặc biệt) từ sự kiện bàn phím. */
export function resolveMainKey(e: KeyboardEvent): string {
  if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.keyCode === 32) return 'Space';
  if (/^F\d{1,2}$/i.test(e.key)) return e.key.toUpperCase();
  if (e.key === 'Tab') return 'Tab';
  if (e.key === 'Enter') return 'Enter';
  if (e.key === 'Escape') return 'Escape';
  if (e.key === 'Backspace') return 'Backspace';
  if (e.key === 'Delete') return 'Delete';
  if (e.key === 'Insert') return 'Insert';
  if (e.key === 'Home') return 'Home';
  if (e.key === 'End') return 'End';
  if (e.key === 'PageUp') return 'PageUp';
  if (e.key === 'PageDown') return 'PageDown';
  if (e.key === 'ArrowUp') return 'Up';
  if (e.key === 'ArrowDown') return 'Down';
  if (e.key === 'ArrowLeft') return 'Left';
  if (e.key === 'ArrowRight') return 'Right';
  if (e.key.length === 1) return e.key.toUpperCase();
  if (!['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return e.key;
  return '';
}

/**
 * Kiểm tra tổ hợp phím có an toàn để đăng ký làm phím tắt toàn cục hay không.
 *
 * Phím tắt toàn cục chiếm phím đó trên TOÀN hệ thống, nên một phím đơn như "A"
 * sẽ khiến người dùng không gõ được chữ A ở bất kỳ đâu. Vì vậy bắt buộc phải có
 * phím bổ trợ, trừ các phím chức năng F1–F24.
 *
 * Quy tắc này phải khớp với kiểm tra phía Rust trong `register_global_shortcut`.
 */
export function isValidShortcut(keys: string[]): boolean {
  if (!keys || keys.length === 0) return false;

  const mainKeys = keys.filter((k) => !MODIFIERS.includes(k));
  if (mainKeys.length !== 1) return false;

  const hasModifier = keys.length > mainKeys.length;
  return hasModifier || FUNCTION_KEY.test(mainKeys[0]);
}
