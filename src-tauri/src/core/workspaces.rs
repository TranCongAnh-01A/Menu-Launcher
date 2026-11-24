//! Logic thuần của Workspace (không đụng IO / Tauri) để test được độc lập.

use crate::core::data_service::{MenuData, Workspace};

/// Độ trễ tối đa giữa hai app (10 giây).
pub const MAX_DELAY_MS: u32 = 10_000;
/// Độ dài tối đa của tên workspace (ký tự).
pub const MAX_NAME_CHARS: usize = 50;

/// Chuẩn hoá tên: cắt khoảng trắng, giới hạn độ dài; rỗng → lỗi.
fn clean_name(ten: &str) -> Result<String, String> {
    let t = ten.trim();
    if t.is_empty() {
        return Err("Tên workspace không được để trống".into());
    }
    Ok(t.chars().take(MAX_NAME_CHARS).collect())
}

/// Bỏ id trùng (giữ lần đầu) và id không còn là mục nào.
fn sanitize_ids(data: &MenuData, ids: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    ids.into_iter()
        .filter(|id| data.muc.iter().any(|i| &i.id == id) && seen.insert(id.clone()))
        .collect()
}

/// Danh sách workspace theo `thu_tu`.
pub fn sorted(data: &MenuData) -> Vec<Workspace> {
    let mut list = data.workspaces.clone();
    list.sort_by_key(|w| w.thu_tu);
    list
}

/// Thêm workspace rỗng ở cuối danh sách.
pub fn add_workspace(data: &mut MenuData, id: String, ten: &str) -> Result<Workspace, String> {
    let ws = Workspace {
        id,
        ten: clean_name(ten)?,
        thu_tu: data.workspaces.len() as i32,
        muc_ids: vec![],
        do_tre_ms: 500,
    };
    data.workspaces.push(ws.clone());
    Ok(ws)
}

/// Cập nhật tên, danh sách mục (giữ thứ tự gửi lên) và độ trễ.
pub fn update_workspace(
    data: &mut MenuData,
    id: &str,
    ten: &str,
    muc_ids: Vec<String>,
    do_tre_ms: u32,
) -> Result<(), String> {
    let ten = clean_name(ten)?;
    let muc_ids = sanitize_ids(data, muc_ids);
    let ws = data
        .workspaces
        .iter_mut()
        .find(|w| w.id == id)
        .ok_or_else(|| "Không tìm thấy workspace".to_string())?;
    ws.ten = ten;
    ws.muc_ids = muc_ids;
    ws.do_tre_ms = do_tre_ms.min(MAX_DELAY_MS);
    Ok(())
}

/// Xoá workspace; trả về true nếu có xoá.
pub fn delete_workspace(data: &mut MenuData, id: &str) -> bool {
    let before = data.workspaces.len();
    data.workspaces.retain(|w| w.id != id);
    normalize_order(data);
    data.workspaces.len() != before
}

/// Sắp lại theo danh sách id gửi lên; id không có trong danh sách xếp sau cùng.
pub fn reorder_workspaces(data: &mut MenuData, ids: &[String]) {
    for w in data.workspaces.iter_mut() {
        w.thu_tu = ids
            .iter()
            .position(|i| i == &w.id)
            .map(|p| p as i32)
            .unwrap_or(i32::MAX);
    }
    normalize_order(data);
}

/// Sắp theo `thu_tu` rồi đánh lại 0..n.
fn normalize_order(data: &mut MenuData) {
    data.workspaces.sort_by_key(|w| w.thu_tu);
    for (i, w) in data.workspaces.iter_mut().enumerate() {
        w.thu_tu = i as i32;
    }
}

/// Gỡ id mục khỏi mọi workspace (gọi khi xoá mục).
pub fn remove_item_from_workspaces(data: &mut MenuData, item_id: &str) {
    for w in data.workspaces.iter_mut() {
        w.muc_ids.retain(|i| i != item_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::data_service::Item;

    fn data_with_items(n: usize) -> MenuData {
        let mut d = MenuData::default();
        for i in 0..n {
            d.muc.push(Item::new(
                format!("i{}", i),
                format!("Mục {}", i),
                format!("C:\\x{}.exe", i),
                "app".into(),
                String::new(),
                "grp-default".into(),
            ));
        }
        d
    }

    #[test]
    fn add_rejects_empty_name_and_truncates() {
        let mut d = data_with_items(0);
        assert!(add_workspace(&mut d, "w1".into(), "   ").is_err());
        let ws = add_workspace(&mut d, "w1".into(), &"a".repeat(80)).unwrap();
        assert_eq!(ws.ten.chars().count(), MAX_NAME_CHARS);
        assert_eq!(d.workspaces.len(), 1);
    }

    #[test]
    fn update_sanitizes_ids_and_clamps_delay() {
        let mut d = data_with_items(3);
        add_workspace(&mut d, "w1".into(), "Làm việc").unwrap();
        update_workspace(
            &mut d,
            "w1",
            " Mới ",
            vec!["i2".into(), "i0".into(), "i2".into(), "ghost".into()],
            99_999,
        )
        .unwrap();
        let w = &d.workspaces[0];
        assert_eq!(w.ten, "Mới");
        assert_eq!(w.muc_ids, vec!["i2", "i0"]);
        assert_eq!(w.do_tre_ms, MAX_DELAY_MS);
        assert!(update_workspace(&mut d, "nope", "x", vec![], 0).is_err());
    }

    #[test]
    fn delete_and_reorder_keep_contiguous_order() {
        let mut d = data_with_items(0);
        for id in ["a", "b", "c"] {
            add_workspace(&mut d, id.into(), id).unwrap();
        }
        reorder_workspaces(&mut d, &["c".into(), "a".into()]);
        let ids: Vec<_> = sorted(&d).into_iter().map(|w| w.id).collect();
        assert_eq!(ids, vec!["c", "a", "b"]);
        assert!(delete_workspace(&mut d, "a"));
        assert!(!delete_workspace(&mut d, "a"));
        let w = sorted(&d);
        assert_eq!(w.iter().map(|w| w.thu_tu).collect::<Vec<_>>(), vec![0, 1]);
    }

    #[test]
    fn delete_item_removes_id_from_all_workspaces() {
        let mut d = data_with_items(3);
        add_workspace(&mut d, "w1".into(), "A").unwrap();
        add_workspace(&mut d, "w2".into(), "B").unwrap();
        update_workspace(&mut d, "w1", "A", vec!["i0".into(), "i1".into()], 0).unwrap();
        update_workspace(&mut d, "w2", "B", vec!["i1".into(), "i2".into()], 0).unwrap();
        remove_item_from_workspaces(&mut d, "i1");
        assert_eq!(d.workspaces[0].muc_ids, vec!["i0"]);
        assert_eq!(d.workspaces[1].muc_ids, vec!["i2"]);
    }
}
