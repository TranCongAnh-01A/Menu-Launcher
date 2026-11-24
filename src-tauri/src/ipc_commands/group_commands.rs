use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::State;
use crate::core::data_service::{AppState, Group};

static GROUP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
pub async fn get_all_groups(state: State<'_, Arc<AppState>>) -> Result<Vec<Group>, String> {
    let data = state.data.read().await;
    let mut groups = data.nhom_danh_sach.clone();
    groups.sort_by_key(|g| g.thu_tu);
    Ok(groups)
}

#[tauri::command]
pub async fn add_group(ten: String, state: State<'_, Arc<AppState>>) -> Result<Group, String> {
    let clean_ten = ten.trim();
    if clean_ten.is_empty() {
        return Err("Tên nhóm không được để trống".into());
    }
    let truncated_ten = clean_ten.chars().take(50).collect::<String>();

    let mut data = state.data.write().await;
    let unique_id = format!(
        "grp-{}-{}",
        chrono::Local::now().timestamp_nanos_opt().unwrap_or_else(|| chrono::Local::now().timestamp_millis() * 1_000_000),
        GROUP_COUNTER.fetch_add(1, Ordering::Relaxed)
    );

    let new_group = Group {
        id: unique_id,
        ten: truncated_ten,
        thu_tu: data.nhom_danh_sach.len() as i32,
    };
    data.nhom_danh_sach.push(new_group.clone());
    drop(data);
    
    state.save().await?;
    Ok(new_group)
}

#[tauri::command]
pub async fn rename_group(id: String, ten_moi: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let clean_ten = ten_moi.trim();
    if clean_ten.is_empty() {
        return Err("Tên nhóm không được để trống".into());
    }
    let truncated_ten = clean_ten.chars().take(50).collect::<String>();

    let mut data = state.data.write().await;
    if let Some(group) = data.nhom_danh_sach.iter_mut().find(|g| g.id == id) {
        group.ten = truncated_ten;
    }
    drop(data);
    state.save().await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_group(id: String, xu_ly: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    if id == "grp-default" {
        return Err("Cannot delete default group".into());
    }

    let mut data = state.data.write().await;
    data.nhom_danh_sach.retain(|g| g.id != id);

    if xu_ly == "xoa" {
        // Giữ nguyên file icon (Hoàn tác có thể cần); dọn mồ côi lúc khởi động.
        data.muc.retain(|item| item.nhom_id != id);
    } else {
        // "giu_lai"
        for item in data.muc.iter_mut() {
            if item.nhom_id == id {
                item.nhom_id = "grp-default".to_string();
            }
        }
    }
    
    // Normalize thu_tu
    let mut groups = std::mem::take(&mut data.nhom_danh_sach);
    groups.sort_by_key(|g| g.thu_tu);
    for (i, g) in groups.iter_mut().enumerate() {
        g.thu_tu = i as i32;
    }
    data.nhom_danh_sach = groups;

    drop(data);
    state.save().await?;
    Ok(())
}

#[tauri::command]
pub async fn reorder_groups(danh_sach_id: Vec<String>, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut data = state.data.write().await;
    
    for (i, id) in danh_sach_id.iter().enumerate() {
        if let Some(group) = data.nhom_danh_sach.iter_mut().find(|g| g.id == *id) {
            group.thu_tu = i as i32;
        }
    }
    
    // Normalize and sort in-place
    let mut groups = std::mem::take(&mut data.nhom_danh_sach);
    groups.sort_by_key(|g| g.thu_tu);
    for (i, g) in groups.iter_mut().enumerate() {
        g.thu_tu = i as i32;
    }
    data.nhom_danh_sach = groups;
    
    drop(data);
    state.save().await?;
    Ok(())
}

