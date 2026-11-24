//! Quét Desktop / Start Menu để gợi ý ứng dụng. CHỈ ĐỌC: không di chuyển,
//! xoá hay sửa bất kỳ file nào.

use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct Candidate {
    pub ten: String,
    pub duong_dan: String,
    /// "desktop" | "startmenu"
    pub nguon: String,
    /// Thư mục con (tương đối so với gốc quét), rỗng nếu nằm ngay gốc.
    pub thu_muc_con: String,
}

/// Ứng viên thô, kèm đích của shortcut (nếu đọc được) để lọc / bỏ trùng.
#[derive(Debug, Clone)]
pub struct RawCandidate {
    pub cand: Candidate,
    pub target: Option<String>,
}

const MAX_DEPTH_START_MENU: usize = 6;
const MAX_RESULTS: usize = 3000;

pub fn normalize_path(p: &str) -> String {
    p.replace('/', "\\").to_lowercase()
}

/// Tách tên thành các từ (chữ + số).
fn tokens(s: &str) -> Vec<String> {
    s.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect()
}

/// Shortcut gỡ cài đặt / trợ giúp / readme — không nên gợi ý.
pub fn is_noise(ten: &str, target: Option<&str>) -> bool {
    let lower = ten.to_lowercase();
    if lower.contains("uninstall")
        || lower.contains("gỡ cài đặt")
        || lower.contains("gỡ bỏ")
        || lower.contains("go cai dat")
        || lower.contains("release notes")
        || lower.contains("read me")
        || lower.contains("user guide")
    {
        return true;
    }
    for t in tokens(ten) {
        if t.starts_with("unins") || t == "readme" || t == "help" || t == "manual" || t == "license" {
            return true;
        }
    }
    if let Some(tg) = target {
        let file = Path::new(tg)
            .file_name()
            .map(|f| f.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let stem = file.rsplit_once('.').map(|(s, _)| s.to_string()).unwrap_or(file.clone());
        if stem.contains("uninstall") || stem.starts_with("unins") || stem == "uninst" {
            return true;
        }
        let ext = file.rsplit_once('.').map(|(_, e)| e).unwrap_or("");
        if matches!(ext, "chm" | "txt" | "pdf" | "html" | "htm" | "rtf" | "md" | "hlp") {
            return true;
        }
    }
    false
}

/// Lọc: bỏ nhiễu, bỏ mục đã có trong menu (theo đường dẫn hoặc đích đã chuẩn
/// hoá), bỏ trùng giữa các nguồn (Desktop được ưu tiên vì nằm trước).
pub fn filter_candidates(raw: Vec<RawCandidate>, existing: &HashSet<String>) -> Vec<Candidate> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::new();
    for r in raw {
        if is_noise(&r.cand.ten, r.target.as_deref()) {
            continue;
        }
        let path_key = normalize_path(&r.cand.duong_dan);
        let target_key = r.target.as_deref().map(normalize_path);
        if existing.contains(&path_key) || target_key.as_ref().is_some_and(|t| existing.contains(t)) {
            continue;
        }
        // Khóa trùng: ưu tiên đích thật; không có đích thì dùng chính đường dẫn.
        let key = target_key.unwrap_or(path_key);
        if !seen.insert(key) {
            continue;
        }
        out.push(r.cand);
        if out.len() >= MAX_RESULTS {
            break;
        }
    }
    out
}

fn is_candidate_ext(path: &Path) -> bool {
    matches!(
        path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref(),
        Some("lnk") | Some("url") | Some("exe")
    )
}

/// Duyệt thư mục (chỉ đọc) tới `max_depth` cấp thư mục con.
fn walk(root: &Path, dir: &Path, depth: usize, max_depth: usize, nguon: &str, out: &mut Vec<RawCandidate>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut entries: Vec<PathBuf> = rd.filter_map(|e| e.ok().map(|e| e.path())).collect();
    entries.sort();
    for p in entries {
        if p.is_dir() {
            if depth < max_depth {
                walk(root, &p, depth + 1, max_depth, nguon, out);
            }
            continue;
        }
        if !is_candidate_ext(&p) {
            continue;
        }
        let ten = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        if ten.is_empty() {
            continue;
        }
        let thu_muc_con = p
            .parent()
            .and_then(|par| par.strip_prefix(root).ok())
            .map(|r| r.to_string_lossy().to_string())
            .unwrap_or_default();
        let target = if p.extension().is_some_and(|e| e.eq_ignore_ascii_case("lnk")) {
            crate::core::icon_manager::resolve_shortcut(&p.to_string_lossy()).0
        } else {
            None
        };
        out.push(RawCandidate {
            cand: Candidate {
                ten,
                duong_dan: p.to_string_lossy().to_string(),
                nguon: nguon.to_string(),
                thu_muc_con,
            },
            target,
        });
    }
}

fn known_folder(id: &windows::core::GUID, fallback: Option<PathBuf>) -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{SHGetKnownFolderPath, KF_FLAG_DEFAULT};
    unsafe {
        if let Ok(pw) = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None) {
            let s = pw.to_string().ok();
            CoTaskMemFree(Some(pw.0 as *const _));
            if let Some(s) = s {
                return Some(PathBuf::from(s));
            }
        }
    }
    fallback
}

/// Quét và trả ứng viên đã lọc. Chạy trên thread blocking (có COM).
pub fn scan_blocking(existing_paths: &[String]) -> Vec<Candidate> {
    use windows::Win32::UI::Shell::{FOLDERID_CommonPrograms, FOLDERID_Desktop, FOLDERID_Programs, FOLDERID_PublicDesktop};
    let _com = crate::core::icon_manager::ComGuard::new();

    // Tập "đã có": đường dẫn của mục + đích của các mục .lnk đã thêm.
    let mut existing: HashSet<String> = HashSet::new();
    for p in existing_paths {
        existing.insert(normalize_path(p));
        if p.to_lowercase().ends_with(".lnk") {
            if let Some(t) = crate::core::icon_manager::resolve_shortcut(p).0 {
                existing.insert(normalize_path(&t));
            }
        }
    }

    let user_desktop = known_folder(&FOLDERID_Desktop, std::env::var_os("USERPROFILE").map(|u| PathBuf::from(u).join("Desktop")));
    let public_desktop = known_folder(&FOLDERID_PublicDesktop, std::env::var_os("PUBLIC").map(|u| PathBuf::from(u).join("Desktop")));
    let user_start = known_folder(
        &FOLDERID_Programs,
        std::env::var_os("APPDATA").map(|u| PathBuf::from(u).join(r"Microsoft\Windows\Start Menu\Programs")),
    );
    let common_start = known_folder(
        &FOLDERID_CommonPrograms,
        std::env::var_os("ProgramData").map(|u| PathBuf::from(u).join(r"Microsoft\Windows\Start Menu\Programs")),
    );

    let mut raw = Vec::new();
    // Desktop: file ở gốc + 1 cấp thư mục con.
    for d in [user_desktop, public_desktop].into_iter().flatten() {
        walk(&d, &d, 0, 1, "desktop", &mut raw);
    }
    // Start Menu: đệ quy.
    for d in [user_start, common_start].into_iter().flatten() {
        walk(&d, &d, 0, MAX_DEPTH_START_MENU, "startmenu", &mut raw);
    }
    filter_candidates(raw, &existing)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(ten: &str, path: &str, target: Option<&str>, nguon: &str) -> RawCandidate {
        RawCandidate {
            cand: Candidate {
                ten: ten.into(),
                duong_dan: path.into(),
                nguon: nguon.into(),
                thu_muc_con: String::new(),
            },
            target: target.map(|s| s.to_string()),
        }
    }

    #[test]
    fn uninstallers_and_help_are_noise() {
        assert!(is_noise("Uninstall Foo", None));
        assert!(is_noise("Gỡ cài đặt Foo", None));
        assert!(is_noise("unins000", None));
        assert!(is_noise("Foo", Some(r"C:\Foo\unins000.exe")));
        assert!(is_noise("Foo", Some(r"C:\Foo\uninstall.exe")));
        assert!(is_noise("Foo Help", None));
        assert!(is_noise("README", None));
        assert!(is_noise("Foo docs", Some(r"C:\Foo\docs.chm")));
        assert!(!is_noise("Visual Studio Code", Some(r"C:\VSC\Code.exe")));
        assert!(!is_noise("HelpNDoc", None));
    }

    #[test]
    fn filter_drops_existing_noise_and_duplicates() {
        let mut existing = HashSet::new();
        existing.insert(normalize_path(r"C:\Users\u\Desktop\Have.lnk"));
        existing.insert(normalize_path(r"C:\Apps\Tool.exe"));
        let list = vec![
            raw("Have", r"C:\Users\u\Desktop\Have.lnk", None, "desktop"),
            raw("Tool", r"C:\SM\Tool.lnk", Some(r"c:/apps/tool.exe"), "startmenu"),
            raw("Uninstall X", r"C:\SM\Uninstall X.lnk", None, "startmenu"),
            raw("App", r"C:\Users\u\Desktop\App.lnk", Some(r"C:\App\app.exe"), "desktop"),
            raw("App", r"C:\SM\App.lnk", Some(r"C:\APP\app.exe"), "startmenu"),
            raw("Other", r"C:\SM\Other.lnk", None, "startmenu"),
        ];
        let out = filter_candidates(list, &existing);
        let names: Vec<_> = out.iter().map(|c| (c.ten.as_str(), c.nguon.as_str())).collect();
        assert_eq!(names, vec![("App", "desktop"), ("Other", "startmenu")]);
    }
}
