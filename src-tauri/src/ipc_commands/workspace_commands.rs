use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::State;
use crate::core::data_service::{AppState, Workspace};
use crate::core::workspaces;
use super::item_commands::{launch_ordered, LaunchResult};

static WS_COUNTER: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
pub async fn get_workspaces(state: State<'_, Arc<AppState>>) -> Result<Vec<Workspace>, String> {
    let data = state.data.read().await;
    Ok(workspaces::sorted(&data))
}

#[tauri::command]
pub async fn add_workspace(ten: String, state: State<'_, Arc<AppState>>) -> Result<Workspace, String> {
    let id = format!(
        "ws-{}-{}",
        chrono::Local::now().timestamp_millis(),
        WS_COUNTER.fetch_add(1, Ordering::Relaxed)
    );
    let ws = {
        let mut data = state.data.write().await;
        workspaces::add_workspace(&mut data, id, &ten)?
    };
    state.save().await?;
    Ok(ws)
}

#[tauri::command]
pub async fn update_workspace(
    id: String,
    ten: String,
    muc_ids: Vec<String>,
    do_tre_ms: u32,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    {
        let mut data = state.data.write().await;
        workspaces::update_workspace(&mut data, &id, &ten, muc_ids, do_tre_ms)?;
    }
    state.save().await
}

#[tauri::command]
pub async fn delete_workspace(id: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let removed = {
        let mut data = state.data.write().await;
        workspaces::delete_workspace(&mut data, &id)
    };
    if removed {
        state.save().await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn reorder_workspaces(ids: Vec<String>, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    {
        let mut data = state.data.write().await;
        workspaces::reorder_workspaces(&mut data, &ids);
    }
    state.save().await
}

/// Mở workspace (dùng chung cho lệnh IPC và menu khay).
pub async fn launch_workspace_core(state: &Arc<AppState>, id: &str) -> Result<LaunchResult, String> {
    let (ids, delay) = {
        let data = state.data.read().await;
        let ws = data
            .workspaces
            .iter()
            .find(|w| w.id == id)
            .ok_or_else(|| "Không tìm thấy workspace".to_string())?;
        (ws.muc_ids.clone(), ws.do_tre_ms as u64)
    };
    state.logger.info(&format!("Chạy workspace [{}] — {} mục", id, ids.len()));
    // launch_ordered bỏ qua mục đã xoá và gọi record_launch.
    Ok(launch_ordered(state, &ids, delay).await)
}

#[tauri::command]
pub async fn launch_workspace(id: String, state: State<'_, Arc<AppState>>) -> Result<LaunchResult, String> {
    launch_workspace_core(&state, &id).await
}
