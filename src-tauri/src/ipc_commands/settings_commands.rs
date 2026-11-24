use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use crate::core::data_service::AppState;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut};

/// Phím tắt toàn cục đang hoạt động. Lưu lại để khi đổi phím mà phím mới bị ứng
/// dụng khác chiếm thì vẫn giữ được phím cũ, thay vì `unregister_all()` mất hết.
#[derive(Default)]
pub struct ActiveShortcut(std::sync::Mutex<Option<Shortcut>>);

/// Xử lý khi phím tắt được bấm: ẩn/hiện cửa sổ chính.
fn handle_shortcut_event(
    app: &AppHandle,
    event: tauri_plugin_global_shortcut::ShortcutEvent,
) {
    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
        if let Some(window) = app.get_webview_window("main") {
            let is_visible = window.is_visible().unwrap_or(false);
            let is_minimized = window.is_minimized().unwrap_or(false);

            if is_visible && !is_minimized {
                // Đang hiện → ẩn ngay lập tức, bất kể focus
                let _ = window.hide();
            } else {
                // Đang ẩn/minimized → hiện lên + focus, giữ nguyên vị trí
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
                // Phát event để Frontend tự focus nội dung DOM
                let _ = app.emit("app-window-shown", ());
            }
        }
    }
}

/// Phím chức năng F1–F24 là những phím duy nhất được phép đăng ký đơn lẻ (không
/// kèm phím bổ trợ), vì chúng hiếm khi dùng để nhập liệu.
fn is_function_key(code: Code) -> bool {
    matches!(
        code,
        Code::F1
            | Code::F2
            | Code::F3
            | Code::F4
            | Code::F5
            | Code::F6
            | Code::F7
            | Code::F8
            | Code::F9
            | Code::F10
            | Code::F11
            | Code::F12
            | Code::F13
            | Code::F14
            | Code::F15
            | Code::F16
            | Code::F17
            | Code::F18
            | Code::F19
            | Code::F20
            | Code::F21
            | Code::F22
            | Code::F23
            | Code::F24
    )
}

#[tauri::command]
pub async fn register_global_shortcut(
    app: AppHandle,
    shortcut_str: String,
    active: State<'_, ActiveShortcut>,
) -> Result<(), String> {
    let clean_str = shortcut_str.trim();
    if clean_str.is_empty() {
        let _ = app.global_shortcut().unregister_all();
        *active.0.lock().unwrap_or_else(|e| e.into_inner()) = None;
        return Ok(());
    }

    let shortcut: Shortcut = clean_str
        .parse()
        .map_err(|e| format!("Tổ hợp phím '{}' không hợp lệ: {:?}", clean_str, e))?;

    // Chặn phím đơn không có phím bổ trợ: phím tắt toàn cục sẽ chiếm phím đó trên
    // toàn hệ thống, khiến người dùng không gõ được nó ở bất kỳ ứng dụng nào khác.
    // Kiểm tra trước khi unregister để lần đăng ký hỏng không làm mất phím tắt đang chạy.
    if shortcut.mods.is_empty() && !is_function_key(shortcut.key) {
        return Err(format!(
            "Phím tắt '{}' sẽ chiếm phím này trên toàn hệ thống. Hãy thêm phím bổ trợ (Ctrl, Alt, Shift hoặc Super), hoặc dùng phím chức năng F1–F12.",
            clean_str
        ));
    }

    let previous = *active.0.lock().unwrap_or_else(|e| e.into_inner());

    // Đăng ký lại đúng phím đang chạy: không cần làm gì.
    if previous == Some(shortcut) {
        return Ok(());
    }

    // Đăng ký phím MỚI trước, chỉ gỡ phím cũ khi thành công. Nếu phím mới bị ứng
    // dụng khác chiếm thì phím cũ vẫn còn nguyên (không bị mất như `unregister_all`).
    let result = app
        .global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            handle_shortcut_event(app, event);
        });

    if let Err(e) = result {
        // Phòng trường hợp phím cũ đã bị gỡ ngoài ý muốn: đăng ký lại cho chắc.
        if let Some(old) = previous {
            if !app.global_shortcut().is_registered(old) {
                let _ = app
                    .global_shortcut()
                    .on_shortcut(old, |app, _s, event| handle_shortcut_event(app, event));
            }
        }
        return Err(format!("Không thể đăng ký phím tắt: {:?}", e));
    }

    if let Some(old) = previous {
        let _ = app.global_shortcut().unregister(old);
    }
    *active.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(shortcut);

    Ok(())
}

#[tauri::command]
pub async fn unregister_global_shortcut(
    app: AppHandle,
    active: State<'_, ActiveShortcut>,
) -> Result<(), String> {
    let _ = app.global_shortcut().unregister_all();
    *active.0.lock().unwrap_or_else(|e| e.into_inner()) = None;
    Ok(())
}

/// Ghi lỗi phía giao diện vào file log.
///
/// Bản release chạy không có console lẫn devtools, nên đây là cách duy nhất để
/// một lỗi render còn lại dấu vết mà người dùng có thể gửi lại được.
#[tauri::command]
pub async fn log_frontend_error(
    message: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    // Stack trace có thể rất dài — cắt bớt để không phình file log.
    let truncated: String = message.chars().take(4000).collect();
    state.logger.error(&format!("[GIAO DIỆN] {}", truncated));
    Ok(())
}

/// Quét lại toàn bộ mục, trả về số mục không còn tồn tại trên máy.
#[tauri::command]
pub async fn rescan_validity(state: State<'_, Arc<AppState>>) -> Result<u32, String> {
    // Kiểm tra file ngoài lock (ổ mạng offline có thể treo lâu).
    let targets: Vec<(String, String)> = {
        let data = state.data.read().await;
        data.muc
            .iter()
            .map(|i| (i.id.clone(), i.duong_dan.clone()))
            .collect()
    };
    let results = tauri::async_runtime::spawn_blocking(move || {
        targets
            .into_iter()
            .map(|(id, path)| {
                let ok = crate::core::data_service::path_is_valid(&path);
                (id, ok)
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| format!("Lỗi khi kiểm tra tệp: {}", e))?;

    let mut changed = false;
    let mut invalid_count = 0u32;
    {
        let mut data = state.data.write().await;
        for (id, exists) in results {
            // Bỏ qua mục đã bị xoá trong lúc kiểm tra.
            if let Some(item) = data.muc.iter_mut().find(|i| i.id == id) {
                if !exists {
                    invalid_count += 1;
                }
                if item.ton_tai != exists {
                    item.ton_tai = exists;
                    changed = true;
                }
            }
        }
    }

    if changed {
        state.save().await?;
    }
    Ok(invalid_count)
}

#[tauri::command]
pub async fn set_always_on_top(always_on_top: bool, window: tauri::Window) -> Result<(), String> {
    window.set_always_on_top(always_on_top).map_err(|e| e.to_string())
}

/// Ẩn cửa sổ xuống khay — dùng cho phím Escape, giống các launcher khác.
#[tauri::command]
pub async fn hide_window(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_data_folder(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    if let Some(parent) = state.data_path.parent() {
        open::that(parent).map_err(|e| e.to_string())?;
    }
    Ok(())
}


