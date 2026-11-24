use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::os::windows::ffi::OsStrExt;
use serde::Serialize;
use tauri::State;
use crate::core::data_service::{AppState, Item};
use std::os::windows::process::CommandExt;

static ITEM_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Kết quả của thao tác thêm mục. Serialize thành object có trường phân loại
/// `trang_thai`, thay vì ghép chuỗi JSON bằng tay (tên chứa `\`, xuống dòng hay
/// ký tự điều khiển sẽ tạo ra JSON hỏng mà phía frontend không parse được).
#[derive(Debug, Serialize)]
#[serde(tag = "trang_thai", rename_all = "snake_case")]
pub enum AddItemResult {
    /// Thêm mới, hoặc chuyển nhóm sau khi người dùng đã xác nhận.
    Added,
    /// Tự chuyển từ một nhóm đã bị xóa — không cần hỏi.
    MovedOrphan,
    /// Đã có sẵn trong đúng nhóm này.
    AlreadyExists,
    /// Đang nằm ở một nhóm khác còn hợp lệ — cần người dùng xác nhận.
    NeedsConfirm { ten: String, nhom_hien_tai: String },
}

/// Trích xuất icon + tên hiển thị trên thread blocking.
///
/// `get_icon_and_name` làm việc với COM, đọc đĩa và encode PNG — chạy thẳng trong
/// một `async fn` sẽ chặn worker của tokio hàng trăm mili-giây mỗi mục.
async fn extract_icon_and_name(
    state: &Arc<AppState>,
    path: String,
) -> Result<(Option<String>, String), String> {
    let app_data_dir = state
        .data_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .to_path_buf();

    tauri::async_runtime::spawn_blocking(move || {
        crate::core::icon_manager::get_icon_and_name(&path, &app_data_dir)
    })
    .await
    .map_err(|e| format!("Lỗi khi trích xuất icon: {}", e))
}

#[tauri::command]
pub async fn get_all_items(state: State<'_, Arc<AppState>>) -> Result<Vec<Item>, String> {
    let data = state.data.read().await;

    // `icon_cache` lưu trên đĩa là tên file; mở rộng thành đường dẫn tuyệt đối cho
    // giao diện dùng với convertFileSrc.
    Ok(data
        .muc
        .iter()
        .map(|item| {
            let mut item = item.clone();
            if !item.icon_cache.is_empty() {
                item.icon_cache = state
                    .icons_dir
                    .join(&item.icon_cache)
                    .to_string_lossy()
                    .to_string();
            }
            item
        })
        .collect())
}

#[tauri::command]
pub async fn add_item(path: String, nhom_id: String, force_move: Option<bool>, state: State<'_, Arc<AppState>>) -> Result<AddItemResult, String> {
    let trimmed_path = path.trim().to_string();
    if trimmed_path.is_empty() {
        return Err("Đường dẫn không được để trống".into());
    }
    let (icon_file, ten) = extract_icon_and_name(&state, trimmed_path.clone()).await?;

    let path_lower = trimmed_path.to_lowercase();
    let loai = if path_lower.starts_with("http://") || path_lower.starts_with("https://") || path_lower.ends_with(".url") {
        "link".to_string()
    } else if std::path::Path::new(&trimmed_path).is_dir() {
        "folder".to_string()
    } else if path_lower.ends_with(".exe") || path_lower.ends_with(".lnk") {
        "exe".to_string()
    } else {
        "doc".to_string()
    };

    // Chỉ lưu tên file — đường dẫn tuyệt đối làm dữ liệu phụ thuộc vị trí thư mục.
    let icon_cache = icon_file.unwrap_or_default();

    let mut data = state.data.write().await;

    // Không chấp nhận nhóm đích không tồn tại: mục sẽ thành mồ côi, biến mất khỏi
    // giao diện và chỉ được dọn về grp-default ở lần khởi động sau.
    if !data.nhom_danh_sach.iter().any(|g| g.id == nhom_id) {
        return Err("Nhóm đích không còn tồn tại. Vui lòng chọn lại nhóm.".into());
    }

    let norm_path = trimmed_path.replace('/', "\\").to_lowercase();

    // Tìm vị trí của item nếu đã tồn tại
    let existing_index = data.muc.iter().position(|i| i.duong_dan.replace('/', "\\").to_lowercase() == norm_path);

    if let Some(idx) = existing_index {
        let current_nhom_id = data.muc[idx].nhom_id.clone();
        let item_ten = data.muc[idx].ten.clone();
        let group_exists = data.nhom_danh_sach.iter().any(|g| g.id == current_nhom_id);

        if current_nhom_id == nhom_id {
            // Đã tồn tại trong đúng nhóm này
            return Ok(AddItemResult::AlreadyExists);
        }

        if !group_exists {
            // Nhóm mồ côi (đã bị xóa) → tự động chuyển không cần hỏi
            let item = &mut data.muc[idx];
            item.nhom_id = nhom_id;
            if item.icon_cache.is_empty() && !icon_cache.is_empty() {
                item.icon_cache = icon_cache;
            }
            item.ton_tai = true;
            drop(data);
            state.save().await?;
            return Ok(AddItemResult::MovedOrphan);
        }

        // Item tồn tại ở nhóm khác còn hợp lệ
        if force_move.unwrap_or(false) {
            // Người dùng đã xác nhận → chuyển nhóm
            let item = &mut data.muc[idx];
            item.nhom_id = nhom_id;
            if item.icon_cache.is_empty() && !icon_cache.is_empty() {
                item.icon_cache = icon_cache;
            }
            item.ton_tai = true;
            drop(data);
            state.save().await?;
            return Ok(AddItemResult::Added);
        } else {
            // Cần xác nhận từ người dùng → trả thông tin nhóm cũ
            let group_name = data.nhom_danh_sach.iter()
                .find(|g| g.id == current_nhom_id)
                .map(|g| g.ten.clone())
                .unwrap_or_else(|| "Không rõ".to_string());
            drop(data);
            return Ok(AddItemResult::NeedsConfirm {
                ten: item_ten,
                nhom_hien_tai: group_name,
            });
        }
    }

    state.logger.info(&format!("Thêm ứng dụng mới [{}] - {}", ten, trimmed_path));
    
    let unique_id = format!(
        "item-{}-{}",
        chrono::Local::now().timestamp_nanos_opt().unwrap_or_else(|| chrono::Local::now().timestamp_millis() * 1_000_000),
        ITEM_COUNTER.fetch_add(1, Ordering::Relaxed)
    );

    let new_item = Item::new(unique_id, ten, trimmed_path, loai, icon_cache, nhom_id);
    data.muc.push(new_item);
    drop(data); // Giải phóng write lock trước khi save (save sẽ acquire read lock)
    
    state.save().await?;

    Ok(AddItemResult::Added)
}

/// Chuyển chuỗi sang dạng UTF-16 kết thúc bằng NUL cho các API Win32.
fn to_wide<S: AsRef<std::ffi::OsStr>>(s: S) -> Vec<u16> {
    s.as_ref().encode_wide().chain(std::iter::once(0)).collect()
}

/// Gọi ShellExecuteW với verb chỉ định. Trả về false nếu Windows từ chối mở
/// (mã trả về <= 32).
fn shell_execute(path: &str, verb: windows::core::PCWSTR) -> bool {
    // ShellExecuteW cần COM (STA) trên thread gọi; ComGuard cân bằng Init/Uninit.
    let _com = crate::core::icon_manager::ComGuard::new();
    let wide_path = to_wide(path);

    // Đặt thư mục làm việc về thư mục chứa tệp — nhiều ứng dụng portable cần điều này.
    let wide_dir: Option<Vec<u16>> = if crate::core::data_service::is_web_link(path) {
        None
    } else {
        std::path::Path::new(path)
            .parent()
            .filter(|p| p.is_dir())
            .map(to_wide)
    };

    let lp_dir = match &wide_dir {
        Some(d) => windows::core::PCWSTR(d.as_ptr()),
        None => windows::core::PCWSTR::null(),
    };

    unsafe {
        let hinstance = windows::Win32::UI::Shell::ShellExecuteW(
            None,
            verb,
            windows::core::PCWSTR(wide_path.as_ptr()),
            windows::core::PCWSTR::null(),
            lp_dir,
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        );
        (hinstance.0 as usize) > 32
    }
}

/// Mở đường dẫn bằng shell mặc định, có fallback qua crate `open`.
fn launch_path_blocking(path: &str) -> bool {
    shell_execute(path, windows::core::w!("open")) || open::that(path).is_ok()
}

/// Chạy `launch_path_blocking` trên thread blocking để không chặn worker tokio.
async fn launch_path(path: &str) -> bool {
    let path = path.to_string();
    tauri::async_runtime::spawn_blocking(move || launch_path_blocking(&path))
        .await
        .unwrap_or(false)
}

/// Mở bằng quyền Administrator (verb `runas`) trên thread blocking.
async fn launch_path_as_admin(path: &str) -> bool {
    let path = path.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        shell_execute(&path, windows::core::w!("runas"))
    })
    .await
    .unwrap_or(false)
}

/// Kiểm tra tồn tại trên thread blocking: ổ mạng/UNC offline có thể treo lâu.
async fn path_is_valid_async(path: &str) -> bool {
    let path = path.to_string();
    tauri::async_runtime::spawn_blocking(move || crate::core::data_service::path_is_valid(&path))
        .await
        .unwrap_or(false)
}

async fn find_item(state: &Arc<AppState>, id: &str) -> Result<(String, String), String> {
    let data = state.data.read().await;
    data.muc
        .iter()
        .find(|i| i.id == id)
        .map(|i| (i.ten.clone(), i.duong_dan.clone()))
        .ok_or_else(|| "Không tìm thấy ứng dụng".to_string())
}

/// Cập nhật cờ `ton_tai` của một mục, chỉ ghi đĩa khi giá trị thực sự đổi.
async fn update_item_existence(state: &Arc<AppState>, id: &str, exists: bool) {
    let changed = {
        let mut data = state.data.write().await;
        match data.muc.iter_mut().find(|i| i.id == id) {
            Some(item) if item.ton_tai != exists => {
                item.ton_tai = exists;
                true
            }
            _ => false,
        }
    };

    if changed {
        let _ = state.save().await;
    }
}

/// Ghi nhận lượt mở cho các mục: tăng `so_lan_mo`, đặt `lan_mo_cuoi`, rồi lưu.
/// Không bao giờ chặn việc mở — lỗi lưu chỉ được log. Dùng chung cho mọi đường
/// mở mục (và để khay / workspace ở giai đoạn sau gọi lại).
pub async fn record_launch(state: &Arc<AppState>, ids: &[String]) {
    if ids.is_empty() {
        return;
    }
    let now = chrono::Local::now().timestamp_millis();
    {
        let mut data = state.data.write().await;
        for id in ids {
            if let Some(item) = data.muc.iter_mut().find(|i| &i.id == id) {
                item.so_lan_mo = item.so_lan_mo.saturating_add(1);
                item.lan_mo_cuoi = Some(now);
            }
        }
    }
    if let Err(e) = state.save().await {
        state
            .logger
            .warn(&format!("Không lưu được lượt mở: {}", e));
    }
}

/// Xoá lịch sử sử dụng (số lần mở + lần mở cuối) của một mục.
#[tauri::command]
pub async fn reset_item_usage(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    {
        let mut data = state.data.write().await;
        let item = data
            .muc
            .iter_mut()
            .find(|i| i.id == id)
            .ok_or_else(|| "Không tìm thấy ứng dụng".to_string())?;
        item.so_lan_mo = 0;
        item.lan_mo_cuoi = None;
    }
    state.save().await
}

fn is_script(path_lower: &str) -> bool {
    path_lower.ends_with(".bat")
        || path_lower.ends_with(".ps1")
        || path_lower.ends_with(".cmd")
        || path_lower.ends_with(".vbs")
}

#[tauri::command]
pub async fn open_item(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let (ten, path) = find_item(&state, &id).await?;

    if !path_is_valid_async(&path).await {
        // Đồng bộ lại trạng thái để giao diện đánh dấu mục này là không còn hợp lệ.
        update_item_existence(&state, &id, false).await;
        state
            .logger
            .warn(&format!("Không tìm thấy tệp khi mở [{}] - {}", ten, path));
        return Err(format!(
            "Không tìm thấy tệp của \"{}\". Tệp có thể đã bị di chuyển hoặc xóa.",
            ten
        ));
    }

    if is_script(&path.to_lowercase()) {
        state
            .logger
            .warn(&format!("CẢNH BÁO BẢO MẬT: Mở file script [{}] - {}", ten, path));
    } else {
        state.logger.info(&format!("Mở ứng dụng [{}] - {}", ten, path));
    }

    if !launch_path(&path).await {
        state
            .logger
            .error(&format!("Mở thất bại [{}] - {}", ten, path));
        return Err(format!(
            "Windows không mở được \"{}\". Có thể chưa có ứng dụng nào được gán cho loại tệp này.",
            ten
        ));
    }

    // Mục từng bị đánh dấu hỏng nhưng nay mở được → khôi phục trạng thái.
    update_item_existence(&state, &id, true).await;
    record_launch(&state, std::slice::from_ref(&id)).await;
    Ok(())
}

#[tauri::command]
pub async fn open_item_as_admin(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let (ten, path) = find_item(&state, &id).await?;

    if crate::core::data_service::is_web_link(&path) {
        return Err("Không thể mở liên kết web dưới quyền Administrator".into());
    }

    if !path_is_valid_async(&path).await {
        update_item_existence(&state, &id, false).await;
        return Err(format!(
            "Không tìm thấy tệp của \"{}\". Tệp có thể đã bị di chuyển hoặc xóa.",
            ten
        ));
    }

    state.logger.warn(&format!(
        "Mở ứng dụng dưới quyền ADMINISTRATOR: [{}] - {}",
        ten, path
    ));

    if !launch_path_as_admin(&path).await {
        return Err("Người dùng đã hủy hoặc không thể cấp quyền Administrator".into());
    }

    update_item_existence(&state, &id, true).await;
    record_launch(&state, std::slice::from_ref(&id)).await;
    Ok(())
}

/// Kết quả khởi chạy hàng loạt — báo rõ mục nào không mở được thay vì chỉ đếm.
#[derive(Debug, Serialize)]
pub struct LaunchResult {
    pub da_mo: u32,
    pub that_bai: Vec<String>,
}

/// Khởi chạy đúng danh sách mục do giao diện gửi lên.
///
/// Nhận `ids` thay vì `group_id` để số lượng thực thi luôn khớp với số đang hiển
/// thị — trước đây backend chạy toàn bộ nhóm, bỏ qua bộ lọc tìm kiếm của người dùng.
#[tauri::command]
pub async fn launch_items(
    ids: Vec<String>,
    state: State<'_, Arc<AppState>>,
) -> Result<LaunchResult, String> {
    // Giữ đúng thứ tự do frontend gửi lên.
    let targets: Vec<(String, String, String)> = {
        let data = state.data.read().await;
        ids.iter()
            .filter_map(|id| data.muc.iter().find(|i| &i.id == id))
            .map(|i| (i.id.clone(), i.ten.clone(), i.duong_dan.clone()))
            .collect()
    };

    let mut result = LaunchResult {
        da_mo: 0,
        that_bai: Vec::new(),
    };

    let mut launched_ids: Vec<String> = Vec::new();
    for (index, (id, ten, path)) in targets.iter().enumerate() {
        if index > 0 {
            tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
        }

        if !path_is_valid_async(path).await {
            update_item_existence(&state, id, false).await;
            result.that_bai.push(ten.clone());
            continue;
        }

        if launch_path(path).await {
            result.da_mo += 1;
            launched_ids.push(id.clone());
        } else {
            result.that_bai.push(ten.clone());
        }
    }

    record_launch(&state, &launched_ids).await;

    state.logger.info(&format!(
        "Khởi chạy đồng loạt: {} thành công, {} thất bại",
        result.da_mo,
        result.that_bai.len()
    ));

    Ok(result)
}

/// Xóa một mục và trả về vị trí cũ của nó, để thao tác Hoàn tác khôi phục đúng chỗ.
#[tauri::command]
pub async fn delete_item(id: String, state: State<'_, Arc<AppState>>) -> Result<usize, String> {
    let mut data = state.data.write().await;

    let index = data
        .muc
        .iter()
        .position(|i| i.id == id)
        .ok_or_else(|| "Không tìm thấy ứng dụng".to_string())?;
    let removed = data.muc.remove(index);

    // Không xoá file icon ở đây: Hoàn tác cần icon tuỳ chỉnh. Icon mồ côi được
    // dọn một lần lúc khởi động (cleanup_orphan_icons).

    drop(data);
    state
        .logger
        .info(&format!("Xóa ứng dụng [{}] - ID: {}", removed.ten, id));
    state.save().await?;
    Ok(index)
}

/// Khôi phục nguyên trạng một mục vừa bị xóa (thao tác Hoàn tác).
///
/// Khác `add_item`: giữ nguyên id, tên tùy chỉnh và vị trí cũ. Trước đây phần
/// Hoàn tác phải thêm mới rồi dò lại theo đường dẫn để gán lại tên — cách đó làm
/// mất vị trí và hỏng khi việc chuẩn hóa đường dẫn hai bên lệch nhau.
#[tauri::command]
pub async fn restore_item(
    item: Item,
    vi_tri: Option<usize>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut restored = item;

    // Giao diện nhận icon_cache đã mở rộng thành đường dẫn tuyệt đối, nên phải
    // rút gọn lại về tên file trước khi lưu.
    restored.icon_cache = crate::core::data_service::icon_file_name(&restored.icon_cache);

    // File icon cache có thể đã mất → tạo lại.
    if restored.icon_cache.is_empty() || !state.icons_dir.join(&restored.icon_cache).exists() {
        let (icon_file, _) = extract_icon_and_name(&state, restored.duong_dan.clone()).await?;
        restored.icon_cache = icon_file.unwrap_or_default();
    }

    restored.ton_tai = path_is_valid_async(&restored.duong_dan).await;

    let mut data = state.data.write().await;

    // Bấm Hoàn tác nhiều lần, hoặc mục đã được thêm lại bằng cách khác.
    if data.muc.iter().any(|i| i.id == restored.id) {
        return Ok(());
    }

    // Nhóm cũ có thể đã bị xóa trong lúc toast còn hiển thị.
    if !data.nhom_danh_sach.iter().any(|g| g.id == restored.nhom_id) {
        restored.nhom_id = "grp-default".to_string();
    }
    data.ensure_default_group();

    let index = vi_tri.unwrap_or(data.muc.len()).min(data.muc.len());
    let ten = restored.ten.clone();
    data.muc.insert(index, restored);

    drop(data);
    state
        .logger
        .info(&format!("Hoàn tác xóa: đã khôi phục [{}]", ten));
    state.save().await?;
    Ok(())
}

#[tauri::command]
pub async fn rename_item(id: String, ten_moi: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut data = state.data.write().await;
    if let Some(item) = data.muc.iter_mut().find(|i| i.id == id) {
        item.ten = ten_moi.clone();
    } else {
        return Err("Không tìm thấy ứng dụng".into());
    }
    drop(data);
    state.logger.info(&format!("Đổi tên ứng dụng ID: {} thành '{}'", id, ten_moi));
    state.save().await?;
    Ok(())
}

#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<(), String> {
    // Chuẩn hoá: đổi / thành \, bỏ tiền tố \\?\ nếu có
    let norm_path = path
        .replace('/', "\\")
        .trim_start_matches(r"\\?\")
        .to_string();

    if std::path::Path::new(&norm_path).exists() {
        // raw_arg: giữ nguyên chuỗi, tự thêm dấu nháy quanh đường dẫn
        std::process::Command::new("explorer")
            .raw_arg(format!("/select,\"{}\"", norm_path))
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        if let Some(parent) = std::path::Path::new(&norm_path).parent() {
            if parent.exists() {
                open::that(parent).map_err(|e| e.to_string())?;
                return Ok(());
            }
        }
        Err("Đường dẫn tệp không tồn tại trên hệ thống".into())
    }
}
/// Bỏ id trùng, giữ lần xuất hiện đầu tiên.
fn dedupe_ids(ids: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    ids.iter().filter(|id| seen.insert((*id).clone())).cloned().collect()
}

#[cfg(test)]
mod reorder_tests {
    use super::dedupe_ids;

    #[test]
    fn dedupe_keeps_first_occurrence() {
        let ids: Vec<String> = ["a", "b", "a", "c", "b"].iter().map(|s| s.to_string()).collect();
        assert_eq!(dedupe_ids(&ids), vec!["a", "b", "c"]);
    }
}

/// Sắp xếp lại thứ tự hiển thị của các ứng dụng theo danh sách ID truyền vào.
#[tauri::command]
pub async fn reorder_items(danh_sach_id: Vec<String>, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut data = state.data.write().await;

    // Tìm các vị trí slot hiện tại trong data.muc của các id được yêu cầu sắp xếp
    let mut indices: Vec<usize> = Vec::new();
    let mut ordered_items: Vec<Item> = Vec::new();

    for id in &dedupe_ids(&danh_sach_id) {
        if let Some(pos) = data.muc.iter().position(|i| &i.id == id) {
            indices.push(pos);
            ordered_items.push(data.muc[pos].clone());
        }
    }

    // Sắp xếp các index tăng dần để giữ nguyên cấu trúc vị trí tổng thể
    let mut sorted_indices = indices;
    sorted_indices.sort_unstable();

    // Điền các item đã theo thứ tự mới vào lại các vị trí slot
    for (idx, item) in sorted_indices.into_iter().zip(ordered_items) {
        data.muc[idx] = item;
    }

    drop(data);
    state.logger.info(&format!("Sắp xếp lại thứ tự {} ứng dụng", danh_sach_id.len()));
    state.save().await?;
    Ok(())
}

/// Di chuyển một ứng dụng sang nhóm mới.
#[tauri::command]
pub async fn move_item_to_group(
    id: String,
    nhom_id_moi: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut data = state.data.write().await;

    // Kiểm tra nhóm mới có tồn tại trong danh sách nhóm không
    if !data.nhom_danh_sach.iter().any(|g| g.id == nhom_id_moi) {
        return Err("Nhóm đích không tồn tại".into());
    }

    let item = data
        .muc
        .iter_mut()
        .find(|i| i.id == id)
        .ok_or_else(|| "Không tìm thấy ứng dụng".to_string())?;

    let ten = item.ten.clone();
    item.nhom_id = nhom_id_moi.clone();

    drop(data);
    state.logger.info(&format!(
        "Chuyển ứng dụng [{}] sang nhóm ID: {}",
        ten, nhom_id_moi
    ));
    state.save().await?;
    Ok(())
}
/// Xóa file icon tùy chỉnh cũ (chỉ file `custom-*`, vì icon mặc định được dùng chung giữa các mục).
async fn remove_custom_icon_file(state: &Arc<AppState>, icon_cache: &str) {
    if icon_cache.starts_with("custom-") {
        let _ = tokio::fs::remove_file(state.icons_dir.join(icon_cache)).await;
    }
}

/// Đặt icon tùy chỉnh từ file ảnh (png/jpg/webp/ico...) hoặc từ exe/dll (lấy icon bên trong).
#[tauri::command]
pub async fn set_item_icon(
    id: String,
    source_path: String,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    {
        let data = state.data.read().await;
        if !data.muc.iter().any(|i| i.id == id) {
            return Err("Không tìm thấy ứng dụng".into());
        }
    }

    let icons_dir = state.icons_dir.clone();
    let app_data_dir = state
        .data_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .to_path_buf();
    let id_for_name = id.clone();

    // Giải mã + resize ảnh là việc nặng → chạy trên thread blocking, không giữ lock.
    let new_file = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        std::fs::create_dir_all(&icons_dir).map_err(|e| e.to_string())?;
        let file_name = format!(
            "custom-{}-{}.png",
            id_for_name,
            chrono::Local::now().timestamp_millis()
        );

        match image::open(&source_path) {
            Ok(img) => {
                img.thumbnail(256, 256)
                    .save(icons_dir.join(&file_name))
                    .map_err(|e| format!("Không lưu được icon: {}", e))?;
                Ok(file_name)
            }
            // Không phải ảnh → thử trích icon từ exe/dll/lnk.
            Err(_) => crate::core::icon_manager::get_icon_and_name(&source_path, &app_data_dir)
                .0
                .ok_or_else(|| "Không đọc được ảnh hoặc icon từ tệp đã chọn".to_string()),
        }
    })
    .await
    .map_err(|e| format!("Lỗi khi xử lý icon: {}", e))??;

    let old_icon = {
        let mut data = state.data.write().await;
        let item = data
            .muc
            .iter_mut()
            .find(|i| i.id == id)
            .ok_or_else(|| "Không tìm thấy ứng dụng".to_string())?;
        std::mem::replace(&mut item.icon_cache, new_file.clone())
    };

    if old_icon != new_file {
        remove_custom_icon_file(&state, &old_icon).await;
    }
    state.logger.info(&format!("Đổi icon ứng dụng ID: {}", id));
    state.save().await?;
    Ok(())
}

/// Trả icon về mặc định (trích lại từ chính tệp/ứng dụng).
#[tauri::command]
pub async fn reset_item_icon(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let path = {
        let data = state.data.read().await;
        data.muc
            .iter()
            .find(|i| i.id == id)
            .map(|i| i.duong_dan.clone())
            .ok_or_else(|| "Không tìm thấy ứng dụng".to_string())?
    };

    let (icon_file, _) = extract_icon_and_name(&state, path).await?;
    let new_file = icon_file.unwrap_or_default();

    let old_icon = {
        let mut data = state.data.write().await;
        let item = data
            .muc
            .iter_mut()
            .find(|i| i.id == id)
            .ok_or_else(|| "Không tìm thấy ứng dụng".to_string())?;
        std::mem::replace(&mut item.icon_cache, new_file)
    };

    remove_custom_icon_file(&state, &old_icon).await;
    state.save().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_variants_serialize_to_tagged_objects() {
        assert_eq!(
            serde_json::to_string(&AddItemResult::Added).unwrap(),
            r#"{"trang_thai":"added"}"#
        );
        assert_eq!(
            serde_json::to_string(&AddItemResult::MovedOrphan).unwrap(),
            r#"{"trang_thai":"moved_orphan"}"#
        );
        assert_eq!(
            serde_json::to_string(&AddItemResult::AlreadyExists).unwrap(),
            r#"{"trang_thai":"already_exists"}"#
        );
    }

    /// Tên chứa dấu nháy kép, dấu `\` hoặc xuống dòng từng làm hỏng chuỗi JSON
    /// ghép tay khiến frontend không parse được và mục bị tính là lỗi.
    #[test]
    fn needs_confirm_escapes_special_characters() {
        let ten = r#"Ten "trong nhay" va \ dau cheo nguoc"#;
        let nhom = "Nhom\nxuong dong\ttab";

        let result = AddItemResult::NeedsConfirm {
            ten: ten.to_string(),
            nhom_hien_tai: nhom.to_string(),
        };

        // Phải parse lại được — chuỗi ghép tay trước đây sinh ra JSON hỏng ở đúng bước này.
        let json = serde_json::to_string(&result).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["trang_thai"], "needs_confirm");
        assert_eq!(parsed["ten"], ten);
        assert_eq!(parsed["nhom_hien_tai"], nhom);
    }

}
