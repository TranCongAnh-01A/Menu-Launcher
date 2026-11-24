//! Menu khay hệ thống: mô hình menu (hàm thuần, test được) + dựng / dựng lại menu.

use std::sync::Arc;

use tauri::{
    menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Manager, Wry,
};

use crate::core::data_service::{AppState, Item, MenuData};

/// Id cố định của biểu tượng khay, để `tray_by_id` lấy lại và `set_menu`.
pub const TRAY_ID: &str = "main";
/// Số mục ở "Hay dùng" / "Gần đây".
pub const TOP_N: usize = 8;
/// Số mục tối đa mỗi nhóm trong menu khay.
pub const MAX_PER_GROUP: usize = 30;
/// Độ dài nhãn tối đa (ký tự) để menu không quá rộng.
const MAX_LABEL_CHARS: usize = 60;

/// Một phần tử của menu khay (không phụ thuộc Tauri).
#[derive(Debug, Clone, PartialEq)]
pub enum TrayEntry {
    /// Mục bấm được; `id` là `show` / `quit` / `item:<id>` / `ws:<id>`.
    Action { id: String, label: String },
    Separator,
    Submenu { label: String, children: Vec<TrayEntry> },
}

/// Nhãn an toàn cho menu Windows: `&` là phím tắt nên phải nhân đôi; cắt ngắn.
pub fn menu_label(s: &str) -> String {
    let t: String = s.trim().chars().take(MAX_LABEL_CHARS).collect();
    let t = if t.is_empty() { "(không tên)".to_string() } else { t };
    t.replace('&', "&&")
}

fn item_entry(item: &Item) -> TrayEntry {
    TrayEntry::Action {
        id: format!("item:{}", item.id),
        label: menu_label(&item.ten),
    }
}

/// Top-N mục dùng nhiều nhất (`so_lan_mo` > 0), hoà thì mục mở gần đây hơn lên trước.
pub fn top_used(data: &MenuData, n: usize) -> Vec<&Item> {
    let mut v: Vec<&Item> = data.muc.iter().filter(|i| i.so_lan_mo > 0).collect();
    v.sort_by(|a, b| {
        b.so_lan_mo
            .cmp(&a.so_lan_mo)
            .then(b.lan_mo_cuoi.cmp(&a.lan_mo_cuoi))
    });
    v.truncate(n);
    v
}

/// Top-N mục mở gần nhất.
pub fn recent(data: &MenuData, n: usize) -> Vec<&Item> {
    let mut v: Vec<&Item> = data.muc.iter().filter(|i| i.lan_mo_cuoi.is_some()).collect();
    v.sort_by(|a, b| b.lan_mo_cuoi.cmp(&a.lan_mo_cuoi));
    v.truncate(n);
    v
}

/// Dựng mô hình menu khay từ dữ liệu:
/// Mở Launcher | Hay dùng ▸ | Gần đây ▸ | mỗi nhóm ▸ | Workspace ▸ | Thoát.
/// Submenu rỗng (nhóm không có mục, chưa có lịch sử, chưa có workspace) bị ẩn.
pub fn build_tray_model(data: &MenuData) -> Vec<TrayEntry> {
    let mut out = vec![
        TrayEntry::Action { id: "show".into(), label: "Mở Launcher".into() },
        TrayEntry::Separator,
    ];

    let top = top_used(data, TOP_N);
    if !top.is_empty() {
        out.push(TrayEntry::Submenu {
            label: "Hay dùng".into(),
            children: top.into_iter().map(item_entry).collect(),
        });
    }
    let rec = recent(data, TOP_N);
    if !rec.is_empty() {
        out.push(TrayEntry::Submenu {
            label: "Gần đây".into(),
            children: rec.into_iter().map(item_entry).collect(),
        });
    }

    out.push(TrayEntry::Separator);

    let mut groups = data.nhom_danh_sach.clone();
    groups.sort_by_key(|g| g.thu_tu);
    for g in &groups {
        let children: Vec<TrayEntry> = data
            .muc
            .iter()
            .filter(|i| i.nhom_id == g.id)
            .take(MAX_PER_GROUP)
            .map(item_entry)
            .collect();
        if !children.is_empty() {
            out.push(TrayEntry::Submenu { label: menu_label(&g.ten), children });
        }
    }

    let mut ws = data.workspaces.clone();
    ws.sort_by_key(|w| w.thu_tu);
    if !ws.is_empty() {
        out.push(TrayEntry::Submenu {
            label: "Workspace".into(),
            children: ws
                .iter()
                .map(|w| TrayEntry::Action { id: format!("ws:{}", w.id), label: menu_label(&w.ten) })
                .collect(),
        });
    }

    out.push(TrayEntry::Separator);
    out.push(TrayEntry::Action { id: "quit".into(), label: "Thoát".into() });
    out
}

/// Chuyển mô hình thành `Menu` Tauri.
pub fn build_menu(app: &AppHandle, model: &[TrayEntry]) -> tauri::Result<Menu<Wry>> {
    let mut builder = MenuBuilder::new(app);
    for entry in model {
        match entry {
            TrayEntry::Action { id, label } => {
                builder = builder.item(&MenuItemBuilder::with_id(id.as_str(), label).build(app)?);
            }
            TrayEntry::Separator => builder = builder.separator(),
            TrayEntry::Submenu { label, children } => {
                let mut sub = SubmenuBuilder::new(app, label);
                for c in children {
                    if let TrayEntry::Action { id, label } = c {
                        sub = sub.item(&MenuItemBuilder::with_id(id.as_str(), label).build(app)?);
                    }
                }
                builder = builder.item(&sub.build()?);
            }
        }
    }
    builder.build()
}

/// Dựng lại menu khay từ dữ liệu hiện tại (không làm gì nếu chưa có khay).
pub async fn rebuild_tray_menu(app: &AppHandle) {
    let Some(state) = app.try_state::<Arc<AppState>>() else { return };
    let model = {
        let data = state.data.read().await;
        build_tray_model(&data)
    };
    let handle = app.clone();
    // Thao tác menu của OS chạy trên thread chính cho chắc.
    let res = app.run_on_main_thread(move || {
        if let Some(tray) = handle.tray_by_id(TRAY_ID) {
            match build_menu(&handle, &model) {
                Ok(menu) => {
                    let _ = tray.set_menu(Some(menu));
                }
                Err(e) => {
                    if let Some(st) = handle.try_state::<Arc<AppState>>() {
                        st.logger.warn(&format!("Không dựng lại được menu khay: {}", e));
                    }
                }
            }
        }
    });
    if let Err(e) = res {
        state.logger.warn(&format!("Không dựng lại được menu khay: {}", e));
    }
}

/// Task nền: mỗi lần dữ liệu được lưu → đợi ~300 ms (gộp các lần lưu liên tiếp) → dựng lại.
pub fn spawn_tray_rebuild_task(app: AppHandle, state: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        loop {
            state.changed.notified().await;
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            rebuild_tray_menu(&app).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::data_service::{Group, Workspace};

    fn item(id: &str, nhom: &str, so_lan: u32, cuoi: Option<i64>) -> Item {
        let mut i = Item::new(
            id.into(),
            format!("Mục {}", id),
            "C:\\a.exe".into(),
            "app".into(),
            String::new(),
            nhom.into(),
        );
        i.so_lan_mo = so_lan;
        i.lan_mo_cuoi = cuoi;
        i
    }

    fn submenu<'a>(model: &'a [TrayEntry], label: &str) -> Option<&'a Vec<TrayEntry>> {
        model.iter().find_map(|e| match e {
            TrayEntry::Submenu { label: l, children } if l == label => Some(children),
            _ => None,
        })
    }

    #[test]
    fn empty_data_has_only_show_and_quit() {
        let model = build_tray_model(&MenuData::default());
        let ids: Vec<_> = model
            .iter()
            .filter_map(|e| match e {
                TrayEntry::Action { id, .. } => Some(id.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(ids, vec!["show", "quit"]);
        assert!(!model.iter().any(|e| matches!(e, TrayEntry::Submenu { .. })));
    }

    #[test]
    fn top_used_and_recent_are_limited_and_ordered() {
        let mut d = MenuData::default();
        for n in 0..12 {
            d.muc.push(item(&format!("i{}", n), "grp-default", n as u32, Some(n as i64)));
        }
        d.muc.push(item("never", "grp-default", 0, None));
        let model = build_tray_model(&d);
        let hot = submenu(&model, "Hay dùng").unwrap();
        assert_eq!(hot.len(), TOP_N);
        assert_eq!(hot[0], TrayEntry::Action { id: "item:i11".into(), label: "Mục i11".into() });
        let rec = submenu(&model, "Gần đây").unwrap();
        assert_eq!(rec.len(), TOP_N);
        assert!(!rec
            .iter()
            .any(|e| matches!(e, TrayEntry::Action { id, .. } if id == "item:never")));
    }

    #[test]
    fn groups_limited_empty_hidden_workspace_listed() {
        let mut d = MenuData::default();
        d.nhom_danh_sach.push(Group { id: "g2".into(), ten: "Rỗng".into(), thu_tu: 1 });
        d.nhom_danh_sach.push(Group { id: "g3".into(), ten: "A & B".into(), thu_tu: 2 });
        for n in 0..40 {
            d.muc.push(item(&format!("d{}", n), "grp-default", 0, None));
        }
        d.muc.push(item("x", "g3", 0, None));
        d.workspaces.push(Workspace {
            id: "w1".into(),
            ten: "Học".into(),
            thu_tu: 0,
            muc_ids: vec![],
            do_tre_ms: 0,
        });
        let model = build_tray_model(&d);
        assert_eq!(submenu(&model, "Khác").unwrap().len(), MAX_PER_GROUP);
        assert!(submenu(&model, "Rỗng").is_none());
        assert!(submenu(&model, "A && B").is_some());
        let ws = submenu(&model, "Workspace").unwrap();
        assert_eq!(ws[0], TrayEntry::Action { id: "ws:w1".into(), label: "Học".into() });
        assert_eq!(
            model.last().unwrap(),
            &TrayEntry::Action { id: "quit".into(), label: "Thoát".into() }
        );
    }

    #[test]
    fn menu_label_escapes_and_truncates() {
        assert_eq!(menu_label("Tom & Jerry"), "Tom && Jerry");
        assert_eq!(menu_label(&"x".repeat(100)).chars().count(), MAX_LABEL_CHARS);
        assert_eq!(menu_label("  "), "(không tên)");
    }
}
