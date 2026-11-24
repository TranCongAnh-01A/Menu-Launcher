use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::fs;
use tokio::sync::{Mutex, RwLock};

use crate::core::logger::AppLogger;

/// Số bản sao lưu giữ lại trong thư mục `backups`.
const MAX_BACKUPS: usize = 10;
/// Khoảng cách tối thiểu giữa 2 lần tạo bản sao lưu. Nếu không có ngưỡng này,
/// một thao tác thêm hàng loạt sẽ xoay vòng hết sạch backup chỉ trong vài giây.
const BACKUP_INTERVAL: Duration = Duration::from_secs(300);

const BACKUP_PREFIX: &str = "menu_data_";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Group {
    pub id: String,
    pub ten: String,
    pub thu_tu: i32,
}

/// Thứ tự hiển thị của mục chính là vị trí trong `MenuData::muc` — không có
/// trường thứ tự riêng, để tránh hai nguồn sự thật lệch nhau.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Item {
    pub id: String,
    pub ten: String,
    pub duong_dan: String,
    pub loai: String,
    pub icon_cache: String,
    pub nhom_id: String,
    pub ton_tai: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MenuData {
    pub phien_ban_schema: i32,
    pub nhom_danh_sach: Vec<Group>,
    pub muc: Vec<Item>,
}

impl Default for MenuData {
    fn default() -> Self {
        Self {
            phien_ban_schema: 3,
            nhom_danh_sach: vec![Group {
                id: "grp-default".to_string(),
                ten: "Khác".to_string(),
                thu_tu: 0,
            }],
            muc: vec![],
        }
    }
}

/// Đường dẫn có phải link web hay không.
pub fn is_web_link(duong_dan: &str) -> bool {
    let lower = duong_dan.to_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

/// Mục có còn hợp lệ hay không. Link web luôn được coi là hợp lệ vì không thể
/// kiểm tra bằng hệ thống tệp.
pub fn path_is_valid(duong_dan: &str) -> bool {
    is_web_link(duong_dan) || Path::new(duong_dan).exists()
}

/// Lấy phần tên file của `icon_cache`.
///
/// `icon_cache` được lưu dưới dạng **tên file** để `menu_data.json` không phụ
/// thuộc vào vị trí thư mục người dùng. Hàm này cũng dùng để migrate dữ liệu cũ
/// vốn lưu đường dẫn tuyệt đối.
pub fn icon_file_name(icon_cache: &str) -> String {
    Path::new(icon_cache)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
}

pub struct AppState {
    pub data: RwLock<MenuData>,
    pub data_path: PathBuf,
    pub backup_dir: PathBuf,
    pub icons_dir: PathBuf,
    pub logger: AppLogger,
    /// Thời điểm tạo bản sao lưu gần nhất, dùng để giới hạn tần suất backup.
    last_backup: Mutex<Option<Instant>>,
    /// Khoá tuần tự hoá `save()`: serialize + backup + ghi tmp + rename phải chạy
    /// nguyên khối, nếu không hai lần lưu gần nhau dùng chung file `.tmp` và bản
    /// cũ có thể đè bản mới.
    save_lock: Mutex<()>,
}

impl AppState {
    pub async fn new(app_data_dir: PathBuf) -> Result<Arc<Self>, String> {
        let data_dir = app_data_dir.join("DesktopMenuLauncher");
        if !data_dir.exists() {
            fs::create_dir_all(&data_dir)
                .await
                .map_err(|e| e.to_string())?;
        }

        let logger = AppLogger::new(&data_dir);
        logger.info("Khởi động ứng dụng Desktop Menu Launcher");

        let data_path = data_dir.join("menu_data.json");
        let backup_dir = data_dir.join("backups");

        let (mut data, recovered) = load_or_recover(&data_path, &backup_dir, &logger).await;

        // Tự động kiểm tra và dọn dẹp các mục mồ côi (nhóm không còn tồn tại) -> gán về grp-default
        let valid_group_ids: std::collections::HashSet<String> =
            data.nhom_danh_sach.iter().map(|g| g.id.clone()).collect();
        let mut cleaned = false;
        for item in data.muc.iter_mut() {
            if !valid_group_ids.contains(&item.nhom_id) {
                item.nhom_id = "grp-default".to_string();
                cleaned = true;
            }

            // Migrate dữ liệu cũ: icon_cache từng được lưu là đường dẫn tuyệt đối,
            // nên đổi tên người dùng hoặc dời thư mục dữ liệu là hỏng toàn bộ icon.
            if !item.icon_cache.is_empty() {
                let file_name = icon_file_name(&item.icon_cache);
                if file_name != item.icon_cache {
                    item.icon_cache = file_name;
                    cleaned = true;
                }
            }
        }

        let state = Arc::new(Self {
            data: RwLock::new(data),
            data_path,
            backup_dir,
            icons_dir: data_dir.join("icons"),
            logger,
            last_backup: Mutex::new(None),
            save_lock: Mutex::new(()),
        });

        // Ghi lại ngay nếu vừa khôi phục từ backup hoặc vừa dọn mục mồ côi,
        // để file trên đĩa khớp với dữ liệu đang dùng.
        if cleaned || recovered {
            if let Err(e) = state.save().await {
                state
                    .logger
                    .error(&format!("Không ghi được dữ liệu sau khi khôi phục: {}", e));
            }
        }

        Ok(state)
    }

    pub async fn save(&self) -> Result<(), String> {
        // Giữ khoá ghi suốt serialize → ghi → rename. Serialize nằm TRONG khoá để
        // lần ghi sau luôn mang dữ liệu mới hơn lần ghi trước.
        let _guard = self.save_lock.lock().await;

        // Serialize rồi nhả read lock ngay, không giữ lock xuyên suốt thao tác I/O.
        let content = {
            let data = self.data.read().await;
            serde_json::to_string_pretty(&*data).map_err(|e| e.to_string())?
        };

        // 1. Sao lưu trạng thái CŨ trước khi ghi đè, để bản backup là một điểm khôi
        //    phục thật sự (trước đây backup được tạo sau khi ghi nên chỉ lặp lại
        //    đúng nội dung vừa ghi).
        self.create_backup_if_due().await;

        let temp_path = self.data_path.with_extension("json.tmp");

        // 2. Ghi ra file tạm
        fs::write(&temp_path, content)
            .await
            .map_err(|e| format!("Lỗi ghi file tạm: {}", e))?;

        // 3. Đổi tên file tạm đè lên file chính (Atomic trên NTFS)
        fs::rename(&temp_path, &self.data_path)
            .await
            .map_err(|e| format!("Lỗi rename file atomic: {}", e))?;

        Ok(())
    }

    /// Xoá các file trong `icons_dir` mà không mục nào tham chiếu.
    ///
    /// Chạy một lần lúc khởi động (nền). Không xoá icon ngay khi xoá mục để thao
    /// tác Hoàn tác còn icon tuỳ chỉnh. Trả về số file đã xoá.
    pub async fn cleanup_orphan_icons(&self) -> usize {
        let used: std::collections::HashSet<String> = {
            let data = self.data.read().await;
            data.muc
                .iter()
                .filter(|i| !i.icon_cache.is_empty())
                .map(|i| icon_file_name(&i.icon_cache))
                .collect()
        };

        // Menu trống (lần đầu chạy, hoặc file dữ liệu hỏng vừa được thay bằng bản
        // rỗng) thì không dọn: tránh xoá sạch icon khi chưa chắc dữ liệu đúng.
        if used.is_empty() {
            return 0;
        }

        let mut entries = match fs::read_dir(&self.icons_dir).await {
            Ok(e) => e,
            Err(_) => return 0,
        };

        let mut removed = 0usize;
        while let Ok(Some(entry)) = entries.next_entry().await {
            let is_file = entry.file_type().await.map(|t| t.is_file()).unwrap_or(false);
            if !is_file {
                continue;
            }
            // Bỏ qua file mới tạo (< 1 giờ): có thể là icon vừa trích cho một mục
            // đang được thêm, chưa kịp ghi vào dữ liệu.
            let is_recent = entry
                .metadata()
                .await
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.elapsed().ok())
                .map(|age| age < std::time::Duration::from_secs(3600))
                .unwrap_or(true);
            if is_recent {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !used.contains(&name) && fs::remove_file(entry.path()).await.is_ok() {
                removed += 1;
            }
        }

        if removed > 0 {
            self.logger
                .info(&format!("Đã dọn {} file icon mồ côi", removed));
        }
        removed
    }

    async fn create_backup_if_due(&self) {
        // Không có gì để sao lưu (lần chạy đầu, hoặc file hỏng vừa bị cách ly).
        if !self.data_path.exists() {
            return;
        }

        let mut last = self.last_backup.lock().await;
        if let Some(t) = *last {
            if t.elapsed() < BACKUP_INTERVAL {
                return;
            }
        }

        match self.create_backup().await {
            Ok(()) => *last = Some(Instant::now()),
            Err(e) => self
                .logger
                .warn(&format!("Không tạo được bản sao lưu: {}", e)),
        }
    }

    async fn create_backup(&self) -> Result<(), String> {
        if !self.backup_dir.exists() {
            fs::create_dir_all(&self.backup_dir)
                .await
                .map_err(|e| e.to_string())?;
        }

        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let backup_file = self
            .backup_dir
            .join(format!("{}{}.json", BACKUP_PREFIX, timestamp));

        fs::copy(&self.data_path, &backup_file)
            .await
            .map_err(|e| e.to_string())?;

        // Xoay vòng backup: chỉ giữ lại MAX_BACKUPS bản gần nhất
        let mut backups = list_backups(&self.backup_dir).await;
        backups.sort();
        if backups.len() > MAX_BACKUPS {
            for path in backups.iter().take(backups.len() - MAX_BACKUPS) {
                let _ = fs::remove_file(path).await;
            }
        }

        Ok(())
    }
}

/// Đọc `menu_data.json`. Nếu file hỏng hoặc không đọc được, cách ly file đó lại
/// rồi lần lượt thử khôi phục từ các bản sao lưu (mới nhất trước). Chỉ khi tất cả
/// đều thất bại mới dùng dữ liệu mặc định.
///
/// Trả về `(dữ liệu, đã_khôi_phục)`.
async fn load_or_recover(
    data_path: &Path,
    backup_dir: &Path,
    logger: &AppLogger,
) -> (MenuData, bool) {
    if data_path.exists() {
        match fs::read_to_string(data_path).await {
            Ok(content) => match serde_json::from_str::<MenuData>(&content) {
                Ok(parsed) => return (parsed, false),
                Err(e) => {
                    logger.error(&format!(
                        "menu_data.json bị hỏng ({}). Cách ly file và thử khôi phục từ bản sao lưu.",
                        e
                    ));
                    quarantine(data_path, Some(&content), logger).await;
                }
            },
            Err(e) => {
                logger.error(&format!(
                    "Không đọc được menu_data.json ({}). Cách ly file và thử khôi phục từ bản sao lưu.",
                    e
                ));
                quarantine(data_path, None, logger).await;
            }
        }
    }

    if let Some(recovered) = recover_from_backups(backup_dir, logger).await {
        return (recovered, true);
    }

    if backup_dir.exists() {
        logger.error("Không khôi phục được từ bất kỳ bản sao lưu nào. Khởi tạo dữ liệu mặc định.");
    }
    (MenuData::default(), false)
}

/// Đổi tên file hỏng thành `menu_data.corrupt.<timestamp>.json` để thao tác lưu kế
/// tiếp không ghi đè mất. File này nằm ngoài thư mục `backups` nên không bị xoay vòng.
async fn quarantine(data_path: &Path, content: Option<&str>, logger: &AppLogger) {
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let target = data_path.with_file_name(format!("menu_data.corrupt.{}.json", timestamp));

    if fs::rename(data_path, &target).await.is_ok() {
        logger.warn(&format!("Đã cách ly file hỏng tại: {}", target.display()));
        return;
    }

    // Rename thất bại (file đang bị khóa). Nếu đã đọc được nội dung thì ghi ra bản sao.
    if let Some(content) = content {
        if fs::write(&target, content).await.is_ok() {
            logger.warn(&format!(
                "Không đổi tên được file hỏng, đã sao chép nội dung sang: {}",
                target.display()
            ));
            return;
        }
    }

    logger.error(
        "Không cách ly được file menu_data.json hỏng — dữ liệu gốc có thể bị ghi đè ở lần lưu kế tiếp.",
    );
}

/// Thử từng bản sao lưu theo thứ tự mới nhất trước, trả về bản đầu tiên parse được.
async fn recover_from_backups(backup_dir: &Path, logger: &AppLogger) -> Option<MenuData> {
    if !backup_dir.exists() {
        return None;
    }

    let mut backups = list_backups(backup_dir).await;
    backups.sort(); // timestamp cố định độ dài nên sort chuỗi = sort theo thời gian

    for path in backups.iter().rev() {
        match fs::read_to_string(path).await {
            Ok(content) => match serde_json::from_str::<MenuData>(&content) {
                Ok(parsed) => {
                    logger.info(&format!(
                        "Đã khôi phục dữ liệu từ bản sao lưu: {}",
                        path.display()
                    ));
                    return Some(parsed);
                }
                Err(e) => logger.warn(&format!(
                    "Bản sao lưu {} cũng bị hỏng ({}), thử bản cũ hơn.",
                    path.display(),
                    e
                )),
            },
            Err(e) => logger.warn(&format!(
                "Không đọc được bản sao lưu {} ({}), thử bản cũ hơn.",
                path.display(),
                e
            )),
        }
    }

    None
}

async fn list_backups(backup_dir: &Path) -> Vec<PathBuf> {
    let mut backups = Vec::new();
    let mut entries = match fs::read_dir(backup_dir).await {
        Ok(entries) => entries,
        Err(_) => return backups,
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        if !entry
            .file_type()
            .await
            .map(|t| t.is_file())
            .unwrap_or(false)
        {
            continue;
        }
        let path = entry.path();
        if path.extension().unwrap_or_default() != "json" {
            continue;
        }
        let is_backup = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.starts_with(BACKUP_PREFIX))
            .unwrap_or(false);
        if is_backup {
            backups.push(path);
        }
    }

    backups
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static TEST_COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_root() -> PathBuf {
        let n = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "dml_test_{}_{}",
            std::process::id(),
            n
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("DesktopMenuLauncher")).unwrap();
        root
    }

    fn sample_data(group_name: &str) -> MenuData {
        let mut data = MenuData::default();
        data.nhom_danh_sach[0].ten = group_name.to_string();
        data
    }

    fn sample_item(icon_cache: &str) -> Item {
        Item {
            id: "item-1".to_string(),
            ten: "App".to_string(),
            duong_dan: r"C:\App\app.exe".to_string(),
            loai: "exe".to_string(),
            icon_cache: icon_cache.to_string(),
            nhom_id: "grp-default".to_string(),
            ton_tai: true,
        }
    }

    fn quarantine_files(root: &Path) -> Vec<PathBuf> {
        std::fs::read_dir(root.join("DesktopMenuLauncher"))
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("menu_data.corrupt."))
                    .unwrap_or(false)
            })
            .collect()
    }

    #[tokio::test]
    async fn concurrent_saves_do_not_fail() {
        let root = temp_root();
        let state = AppState::new(root.clone()).await.unwrap();

        let mut handles = Vec::new();
        for i in 0..20 {
            let st = state.clone();
            handles.push(tokio::spawn(async move {
                {
                    let mut data = st.data.write().await;
                    data.nhom_danh_sach[0].ten = format!("Nhom {}", i);
                }
                st.save().await
            }));
        }
        for h in handles {
            h.await.unwrap().expect("save đồng thời phải thành công");
        }

        // File cuối cùng phải parse được và khớp với dữ liệu trong bộ nhớ.
        let on_disk: MenuData =
            serde_json::from_str(&std::fs::read_to_string(&state.data_path).unwrap()).unwrap();
        let in_mem = state.data.read().await.nhom_danh_sach[0].ten.clone();
        assert_eq!(on_disk.nhom_danh_sach[0].ten, in_mem);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn loads_valid_file_without_quarantine() {
        let root = temp_root();
        let dir = root.join("DesktopMenuLauncher");
        std::fs::write(
            dir.join("menu_data.json"),
            serde_json::to_string(&sample_data("Nhom Goc")).unwrap(),
        )
        .unwrap();

        let state = AppState::new(root.clone()).await.unwrap();

        assert_eq!(state.data.read().await.nhom_danh_sach[0].ten, "Nhom Goc");
        assert!(quarantine_files(&root).is_empty());
    }

    #[tokio::test]
    async fn recovers_from_backup_when_file_is_corrupt() {
        let root = temp_root();
        let dir = root.join("DesktopMenuLauncher");
        let backups = dir.join("backups");
        std::fs::create_dir_all(&backups).unwrap();

        std::fs::write(dir.join("menu_data.json"), "{ day la file hong").unwrap();
        // Bản cũ hợp lệ + bản mới hỏng: phải bỏ qua bản mới, lấy bản cũ.
        std::fs::write(
            backups.join("menu_data_20260101_000000.json"),
            serde_json::to_string(&sample_data("Ban Cu")).unwrap(),
        )
        .unwrap();
        std::fs::write(backups.join("menu_data_20260102_000000.json"), "{ hong not").unwrap();

        let state = AppState::new(root.clone()).await.unwrap();

        assert_eq!(state.data.read().await.nhom_danh_sach[0].ten, "Ban Cu");
        // File hỏng phải được giữ lại, không bị ghi đè mất.
        let quarantined = quarantine_files(&root);
        assert_eq!(quarantined.len(), 1);
        assert_eq!(
            std::fs::read_to_string(&quarantined[0]).unwrap(),
            "{ day la file hong"
        );
        // Dữ liệu khôi phục phải được ghi lại xuống đĩa.
        let on_disk = std::fs::read_to_string(dir.join("menu_data.json")).unwrap();
        assert!(on_disk.contains("Ban Cu"));
    }

    #[tokio::test]
    async fn falls_back_to_default_when_no_backup_is_usable() {
        let root = temp_root();
        let dir = root.join("DesktopMenuLauncher");
        std::fs::write(dir.join("menu_data.json"), "khong phai json").unwrap();

        let state = AppState::new(root.clone()).await.unwrap();

        let data = state.data.read().await;
        assert_eq!(data.nhom_danh_sach.len(), 1);
        assert_eq!(data.nhom_danh_sach[0].id, "grp-default");
        assert!(data.muc.is_empty());
        drop(data);
        assert_eq!(quarantine_files(&root).len(), 1);
    }

    #[tokio::test]
    async fn backup_is_throttled_across_repeated_saves() {
        let root = temp_root();
        let dir = root.join("DesktopMenuLauncher");
        std::fs::write(
            dir.join("menu_data.json"),
            serde_json::to_string(&sample_data("Goc")).unwrap(),
        )
        .unwrap();

        let state = AppState::new(root.clone()).await.unwrap();
        for _ in 0..5 {
            state.save().await.unwrap();
        }

        // 5 lần lưu liên tiếp chỉ được tạo đúng 1 bản sao lưu, thay vì xoay vòng hết slot.
        assert_eq!(list_backups(&state.backup_dir).await.len(), 1);
    }

    #[tokio::test]
    async fn migrates_absolute_icon_paths_to_file_names() {
        let root = temp_root();
        let dir = root.join("DesktopMenuLauncher");

        let mut data = sample_data("Nhom");
        data.muc.push(sample_item(
            r"C:\Users\nguoi_cu\AppData\Roaming\app\icons\abc123.png",
        ));
        std::fs::write(
            dir.join("menu_data.json"),
            serde_json::to_string(&data).unwrap(),
        )
        .unwrap();

        let state = AppState::new(root.clone()).await.unwrap();

        assert_eq!(state.data.read().await.muc[0].icon_cache, "abc123.png");
        // Migration phải được ghi xuống đĩa, không chỉ nằm trong bộ nhớ.
        let on_disk = std::fs::read_to_string(dir.join("menu_data.json")).unwrap();
        assert!(!on_disk.contains("nguoi_cu"));
        assert!(on_disk.contains("abc123.png"));
    }

    #[tokio::test]
    async fn leaves_plain_file_names_untouched() {
        let root = temp_root();
        let dir = root.join("DesktopMenuLauncher");

        let mut data = sample_data("Nhom");
        data.muc.push(sample_item("abc123.png"));
        std::fs::write(
            dir.join("menu_data.json"),
            serde_json::to_string(&data).unwrap(),
        )
        .unwrap();

        let state = AppState::new(root.clone()).await.unwrap();

        assert_eq!(state.data.read().await.muc[0].icon_cache, "abc123.png");
        assert_eq!(state.icons_dir, dir.join("icons"));
    }

    #[test]
    fn icon_file_name_handles_both_formats() {
        assert_eq!(icon_file_name(r"C:\a\b\hash.png"), "hash.png");
        assert_eq!(icon_file_name("hash.png"), "hash.png");
        assert_eq!(icon_file_name(""), "");
    }
}
