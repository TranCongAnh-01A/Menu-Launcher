pub mod core;
pub mod ipc_commands;

use ipc_commands::item_commands::*;
use ipc_commands::group_commands::*;
use ipc_commands::settings_commands::*;
use ipc_commands::workspace_commands::*;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

/// Biểu tượng khay hệ thống đã tạo được hay chưa.
///
/// Quyết định hành vi khi đóng cửa sổ: có khay thì thu nhỏ xuống khay, không có
/// khay thì phải thoát hẳn — nếu không người dùng sẽ mất mọi cách tắt ứng dụng.
static TRAY_AVAILABLE: AtomicBool = AtomicBool::new(false);

/// Hiện hộp thoại lỗi ở tầng hệ điều hành.
///
/// Bản release chạy với `windows_subsystem = "windows"` nên không có console:
/// panic lúc khởi động sẽ biến mất không dấu vết đối với người dùng.
#[cfg(target_os = "windows")]
fn show_fatal_error(message: &str) {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let to_wide = |s: &str| -> Vec<u16> {
        std::ffi::OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    };

    let text = to_wide(message);
    let caption = to_wide("Desktop Menu Launcher");

    unsafe {
        MessageBoxW(
            None,
            windows::core::PCWSTR(text.as_ptr()),
            windows::core::PCWSTR(caption.as_ptr()),
            MB_ICONERROR | MB_OK,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn show_fatal_error(message: &str) {
    eprintln!("{}", message);
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn window_subclass_proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _uidsubclass: usize,
    _refdata: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{WM_SYSCOMMAND, SC_KEYMENU};
    use windows::Win32::UI::Shell::DefSubclassProc;

    if msg == WM_SYSCOMMAND {
        // Chặn SC_KEYMENU (khi ấn Alt hoặc Alt + Space mở System Menu của Windows)
        if (wparam.0 as u32 & 0xFFF0) == SC_KEYMENU {
            return windows::Win32::Foundation::LRESULT(0);
        }
    }

    DefSubclassProc(hwnd, msg, wparam, lparam)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ActiveShortcut::default())
        .setup(|app| {
            // Chặn System Menu mặc định của Windows ở tầng Native Win32
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(hwnd) = window.hwnd() {
                    let hwnd_win = windows::Win32::Foundation::HWND(hwnd.0 as _);
                    unsafe {
                        let _ = windows::Win32::UI::Shell::SetWindowSubclass(
                            hwnd_win,
                            Some(window_subclass_proc),
                            1001,
                            0,
                        );
                    }
                }
            }

            let app_data_dir = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            
            // Thất bại ở đây thường là hết dung lượng hoặc không có quyền ghi
            // AppData — báo cho người dùng thay vì panic im lặng.
            let state = match tauri::async_runtime::block_on(
                core::data_service::AppState::new(app_data_dir),
            ) {
                Ok(state) => state,
                Err(e) => {
                    show_fatal_error(&format!(
                        "Không khởi tạo được dữ liệu ứng dụng:\n\n{}\n\n\
                         Hãy kiểm tra quyền ghi vào thư mục AppData và dung lượng ổ đĩa.",
                        e
                    ));
                    std::process::exit(1);
                }
            };

            app.manage(state.clone());

            // Dọn file icon mồ côi một lần lúc khởi động (nền).
            let cleanup_state = state.clone();
            tauri::async_runtime::spawn(async move {
                cleanup_state.cleanup_orphan_icons().await;
            });

            // Tự động quét kiểm tra tính hợp lệ của file (background validation) sau 1.5s
            let app_handle = app.handle().clone();
            let state_clone = state.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                // Kiểm tra file ngoài lock, trong spawn_blocking: ổ mạng/UNC offline
                // có thể treo hàng chục giây, không được giữ khoá dữ liệu lúc đó.
                let targets: Vec<(String, String)> = {
                    let data = state_clone.data.read().await;
                    data.muc
                        .iter()
                        .map(|i| (i.id.clone(), i.duong_dan.clone()))
                        .collect()
                };
                let results = tauri::async_runtime::spawn_blocking(move || {
                    targets
                        .into_iter()
                        .map(|(id, path)| {
                            let ok = core::data_service::path_is_valid(&path);
                            (id, ok)
                        })
                        .collect::<Vec<_>>()
                })
                .await
                .unwrap_or_default();

                let mut changed = false;
                {
                    let mut data = state_clone.data.write().await;
                    for (id, exists) in results {
                        // Bỏ qua id đã bị xoá trong lúc kiểm tra.
                        if let Some(item) = data.muc.iter_mut().find(|i| i.id == id) {
                            if item.ton_tai != exists {
                                item.ton_tai = exists;
                                changed = true;
                            }
                        }
                    }
                }
                if changed {
                    let _ = state_clone.save().await;
                    let _ = app_handle.emit("app-items-changed", ());
                }
            });

            // Tạo Menu cho System Tray.
            //
            // Khay hệ thống không phải lúc nào cũng tạo được (shell bị lỗi, chính
            // sách nhóm chặn...). Gói trong closure để lỗi không làm chết setup —
            // ứng dụng vẫn chạy được, chỉ là không có khay.
            let tray_result = (|| -> tauri::Result<()> {
                // Menu dựng từ dữ liệu hiện tại; sau đó task nền dựng lại mỗi khi dữ liệu đổi.
                let model = {
                    let data = tauri::async_runtime::block_on(state.data.read());
                    core::tray::build_tray_model(&data)
                };
                let menu = core::tray::build_menu(app.handle(), &model)?;

                let mut tray_builder = TrayIconBuilder::with_id(core::tray::TRAY_ID)
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                                let _ = app.emit("app-window-shown", ());
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        other => {
                            // `item:<id>` mở mục, `ws:<id>` chạy workspace (có record_launch).
                            if let Some(state) = app.try_state::<std::sync::Arc<core::data_service::AppState>>() {
                                let state = state.inner().clone();
                                let app = app.clone();
                                let other = other.to_string();
                                tauri::async_runtime::spawn(async move {
                                    if let Some(id) = other.strip_prefix("item:") {
                                        if let Err(e) = ipc_commands::item_commands::open_item_core(&state, id).await {
                                            state.logger.warn(&format!("Mở từ khay thất bại: {}", e));
                                        }
                                    } else if let Some(id) = other.strip_prefix("ws:") {
                                        if let Err(e) = ipc_commands::workspace_commands::launch_workspace_core(&state, id).await {
                                            state.logger.warn(&format!("Chạy workspace từ khay thất bại: {}", e));
                                        }
                                    } else {
                                        return;
                                    }
                                    // Cho giao diện (nếu đang mở) cập nhật số lần mở.
                                    let _ = app.emit("app-items-changed", ());
                                });
                            }
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let is_visible = window.is_visible().unwrap_or(false);
                                let is_minimized = window.is_minimized().unwrap_or(false);
                                let is_focused = window.is_focused().unwrap_or(false);

                                if is_visible && !is_minimized && is_focused {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                    let _ = app.emit("app-window-shown", ());
                                }
                            }
                        }
                    });

                // Icon có thể vắng mặt nếu bundle thiếu — vẫn tạo khay, chỉ là không có icon.
                if let Some(icon) = app.default_window_icon() {
                    tray_builder = tray_builder.icon(icon.clone());
                }

                tray_builder.build(app)?;
                Ok(())
            })();

            match tray_result {
                Ok(()) => {
                    TRAY_AVAILABLE.store(true, Ordering::Relaxed);
                    // Dựng lại menu khay (gộp ~300 ms) sau mỗi lần dữ liệu được lưu.
                    core::tray::spawn_tray_rebuild_task(app.handle().clone(), state.clone());
                }
                Err(e) => state.logger.error(&format!(
                    "Không tạo được biểu tượng khay hệ thống: {}. \
                     Đóng cửa sổ sẽ thoát hẳn ứng dụng.",
                    e
                )),
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if TRAY_AVAILABLE.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    // Không có khay để mở lại — chặn đóng ở đây sẽ khiến ứng dụng
                    // chạy ngầm mà người dùng không thể tắt ngoài Task Manager.
                    window.app_handle().exit(0);
                }
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
                let _ = app.emit("app-window-shown", ());
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_all_items,
            add_item,
            open_item,
            open_item_as_admin,
            launch_items,
            delete_item,
            restore_item,
            rename_item,
            reorder_items,
            move_item_to_group,
            get_all_groups,
            add_group,
            rename_group,
            delete_group,
            reorder_groups,
            log_frontend_error,
            rescan_validity,
            set_always_on_top,
            hide_window,
            show_in_folder,
            open_data_folder,
            register_global_shortcut,
            unregister_global_shortcut,
            set_item_icon,
            reset_item_icon,
            reset_item_usage,
            add_custom_item,
            update_item_details,
            detect_browsers,
            scan_shortcuts,
            get_workspaces,
            add_workspace,
            update_workspace,
            delete_workspace,
            reorder_workspaces,
            launch_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
