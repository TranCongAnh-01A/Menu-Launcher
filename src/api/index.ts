import { invoke } from '@tauri-apps/api/core';

export interface Group {
  id: string;
  ten: string;
  thu_tu: number;
}

/** Thứ tự hiển thị là vị trí trong mảng trả về, không có trường thứ tự riêng. */
export interface Item {
  id: string;
  ten: string;
  duong_dan: string;
  loai: string;
  icon_cache: string;
  nhom_id: string;
  ton_tai: boolean;
}

// === GROUPS ===
export async function getAllGroups(): Promise<Group[]> {
  try {
    return await invoke<Group[]>('get_all_groups');
  } catch (e) {
    console.error('Error in getAllGroups:', e);
    // Return dummy data for browser preview if Tauri is not available
    if (window.__TAURI_INTERNALS__ === undefined) {
      return [{ id: 'grp-default', ten: 'Khác', thu_tu: 0 }];
    }
    throw e;
  }
}

export async function addGroup(ten: string): Promise<Group> {
  try {
    return await invoke<Group>('add_group', { ten });
  } catch (e) {
    console.error('Error in addGroup:', e);
    if (window.__TAURI_INTERNALS__ === undefined) {
      return { id: `grp-${Date.now()}`, ten, thu_tu: 99 };
    }
    throw e;
  }
}

export async function renameGroup(id: string, tenMoi: string): Promise<void> {
  try {
    await invoke('rename_group', { id, tenMoi });
  } catch (e) {
    console.error('Error in renameGroup:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

export async function deleteGroup(id: string, xuLy: 'xoa' | 'giu_lai'): Promise<void> {
  try {
    await invoke('delete_group', { id, xuLy });
  } catch (e) {
    console.error('Error in deleteGroup:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

export async function reorderGroups(danhSachId: string[]): Promise<void> {
  try {
    await invoke('reorder_groups', { danhSachId });
  } catch (e) {
    console.error('Error in reorderGroups:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

// === ITEMS ===
export async function getAllItems(): Promise<Item[]> {
  try {
    return await invoke<Item[]>('get_all_items');
  } catch (e) {
    console.error('Error in getAllItems:', e);
    if (window.__TAURI_INTERNALS__ === undefined) {
      return [];
    }
    throw e;
  }
}

/** Kết quả trả về từ lệnh `add_item` phía Rust (enum có tag `trang_thai`). */
export type AddItemResult =
  | { trang_thai: 'added' }
  | { trang_thai: 'moved_orphan' }
  | { trang_thai: 'already_exists' }
  | { trang_thai: 'needs_confirm'; ten: string; nhom_hien_tai: string };

export async function addItem(
  path: string,
  nhomId: string,
  forceMove?: boolean
): Promise<AddItemResult> {
  try {
    return await invoke<AddItemResult>('add_item', { path, nhomId, forceMove: forceMove ?? false });
  } catch (e) {
    console.error('Error in addItem:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return { trang_thai: 'added' };
    throw e;
  }
}

export async function openItem(id: string): Promise<void> {
  try {
    await invoke('open_item', { id });
  } catch (e) {
    console.error('Error in openItem:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

/** Trả về vị trí cũ của mục, dùng để khôi phục đúng chỗ khi Hoàn tác. */
export async function deleteItem(id: string): Promise<number> {
  try {
    return await invoke<number>('delete_item', { id });
  } catch (e) {
    console.error('Error in deleteItem:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return 0;
    throw e;
  }
}

/**
 * Khôi phục nguyên trạng một mục vừa xóa — giữ id, tên tùy chỉnh và vị trí cũ.
 * Dùng cho nút Hoàn tác, khác `addItem` vốn tạo một mục hoàn toàn mới.
 */
export async function restoreItem(item: Item, viTri?: number): Promise<void> {
  try {
    await invoke('restore_item', { item, viTri });
  } catch (e) {
    console.error('Error in restoreItem:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

export async function renameItem(id: string, tenMoi: string): Promise<void> {
  try {
    await invoke('rename_item', { id, tenMoi });
  } catch (e) {
    console.error('Error in renameItem:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

/** Sắp xếp lại thứ tự của các mục theo danh sách ID. */
export async function reorderItems(danhSachId: string[]): Promise<void> {
  try {
    await invoke('reorder_items', { danhSachId });
  } catch (e) {
    console.error('Error in reorderItems:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

/** Chuyển một mục sang nhóm mới. */
export async function moveItemToGroup(id: string, nhomIdMoi: string): Promise<void> {
  try {
    await invoke('move_item_to_group', { id, nhomIdMoi });
  } catch (e) {
    console.error('Error in moveItemToGroup:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

/** Trả về số mục không còn tồn tại trên máy. */
export async function rescanValidity(): Promise<number> {
  try {
    return await invoke<number>('rescan_validity');
  } catch (e) {
    console.error('Error in rescanValidity:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return 0;
    throw e;
  }
}

export async function setAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
  try {
    await invoke('set_always_on_top', { alwaysOnTop });
  } catch (e) {
    console.error('Error in setAlwaysOnTop:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

/** Ẩn cửa sổ xuống khay hệ thống. */
export async function hideWindow(): Promise<void> {
  try {
    await invoke('hide_window');
  } catch (e) {
    console.error('Error in hideWindow:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

export async function showInFolder(path: string): Promise<void> {
  try {
    await invoke('show_in_folder', { path });
  } catch (e) {
    console.error('Error in showInFolder:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

/** Ghi lỗi giao diện vào file log của ứng dụng. */
export async function logFrontendError(message: string): Promise<void> {
  try {
    await invoke('log_frontend_error', { message });
  } catch (e) {
    console.error('Error in logFrontendError:', e);
  }
}

export async function openDataFolder(): Promise<void> {
  try {
    await invoke('open_data_folder');
  } catch (e) {
    console.error('Error in openDataFolder:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

export async function openItemAsAdmin(id: string): Promise<void> {
  try {
    await invoke('open_item_as_admin', { id });
  } catch (e) {
    console.error('Error in openItemAsAdmin:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

export interface LaunchResult {
  da_mo: number;
  /** Tên các mục không mở được. */
  that_bai: string[];
}

/**
 * Khởi chạy đúng danh sách mục được chỉ định.
 *
 * Nhận `ids` thay vì `groupId` để số lượng chạy luôn khớp với số đang hiển thị
 * trên giao diện (tôn trọng cả bộ lọc tìm kiếm).
 */
export async function launchItems(ids: string[]): Promise<LaunchResult> {
  try {
    return await invoke<LaunchResult>('launch_items', { ids });
  } catch (e) {
    console.error('Error in launchItems:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return { da_mo: 0, that_bai: [] };
    throw e;
  }
}

export async function registerGlobalShortcut(shortcutStr: string): Promise<void> {
  try {
    await invoke('register_global_shortcut', { shortcutStr });
  } catch (e) {
    console.error('Error in registerGlobalShortcut:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

export async function unregisterGlobalShortcut(): Promise<void> {
  try {
    await invoke('unregister_global_shortcut');
  } catch (e) {
    console.error('Error in unregisterGlobalShortcut:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

/** Đặt icon tùy chỉnh từ file ảnh hoặc exe/dll. */
export async function setItemIcon(id: string, sourcePath: string): Promise<void> {
  try {
    await invoke('set_item_icon', { id, sourcePath });
  } catch (e) {
    console.error('Error in setItemIcon:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}

/** Trả icon về mặc định. */
export async function resetItemIcon(id: string): Promise<void> {
  try {
    await invoke('reset_item_icon', { id });
  } catch (e) {
    console.error('Error in resetItemIcon:', e);
    if (window.__TAURI_INTERNALS__ === undefined) return;
    throw e;
  }
}