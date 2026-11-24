//! Lập kế hoạch mở mục theo `loai` (thuần túy, không gọi Win32 — dễ kiểm thử).
//! Phần thực thi (ShellExecute / spawn) nằm ở `item_commands.rs`.

use crate::core::data_service::{is_web_link, Item};
use std::path::Path;

/// Cách mở một mục.
#[derive(Debug, Clone, PartialEq)]
pub enum LaunchPlan {
    /// Hành vi cũ: ShellExecute `open` / `runas` trên chính đường dẫn.
    Default,
    /// Chạy file với tham số (loại `lenh`) qua ShellExecute.
    Command {
        file: String,
        params: String,
        dir: Option<String>,
        hide: bool,
    },
    /// Chạy script qua `cmd.exe` / `powershell.exe`.
    Script {
        program: String,
        raw_args: String,
        dir: Option<String>,
        hide: bool,
    },
    /// Mở URL bằng exe trình duyệt chỉ định.
    Browser { exe: String, url: String },
}

fn ext_lower(path: &str) -> String {
    Path::new(path)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// Dòng lệnh chạy script: `.bat/.cmd` qua `cmd.exe /c`, `.ps1` qua PowerShell.
/// Trả về `(program, raw_args)`; `None` nếu phần mở rộng không phải script shell.
///
/// `cmd /c` được bọc thêm một cặp nháy ngoài cùng (`/c ""file" args"`) — đây là
/// dạng duy nhất cmd giữ nguyên các dấu nháy bên trong khi cả file lẫn tham số
/// đều có thể chứa dấu cách / nháy.
pub fn build_script_command(path: &str, tham_so: &str) -> Option<(String, String)> {
    let args = tham_so.trim();
    let tail = if args.is_empty() {
        String::new()
    } else {
        format!(" {}", args)
    };
    match ext_lower(path).as_str() {
        "bat" | "cmd" => Some((
            "cmd.exe".to_string(),
            format!("/c \"\"{}\"{}\"", path, tail),
        )),
        "ps1" => Some((
            "powershell.exe".to_string(),
            format!(
                "-NoProfile -ExecutionPolicy Bypass -File \"{}\"{}",
                path, tail
            ),
        )),
        _ => None,
    }
}

/// Thư mục làm việc: ô người dùng nhập (nếu là thư mục thật) > thư mục chứa file.
pub fn resolve_work_dir(thu_muc_lam_viec: &str, path: &str) -> Option<String> {
    let custom = thu_muc_lam_viec.trim();
    if !custom.is_empty() && Path::new(custom).is_dir() {
        return Some(custom.to_string());
    }
    Path::new(path)
        .parent()
        .filter(|p| p.is_dir())
        .map(|p| p.to_string_lossy().to_string())
}

/// Chọn cách mở cho một mục. `browser_exists` do người gọi kiểm tra trước.
pub fn plan_launch(item: &Item, browser_exists: bool) -> LaunchPlan {
    match item.loai.as_str() {
        "lenh" => LaunchPlan::Command {
            file: item.duong_dan.clone(),
            params: item.tham_so.trim().to_string(),
            dir: resolve_work_dir(&item.thu_muc_lam_viec, &item.duong_dan),
            hide: item.an_console,
        },
        "script" => match build_script_command(&item.duong_dan, &item.tham_so) {
            Some((program, raw_args)) => LaunchPlan::Script {
                program,
                raw_args,
                dir: resolve_work_dir(&item.thu_muc_lam_viec, &item.duong_dan),
                hide: item.an_console,
            },
            // Script lạ (.vbs, .py...): để shell mở kèm tham số.
            None => LaunchPlan::Command {
                file: item.duong_dan.clone(),
                params: item.tham_so.trim().to_string(),
                dir: resolve_work_dir(&item.thu_muc_lam_viec, &item.duong_dan),
                hide: item.an_console,
            },
        },
        _ if is_web_link(&item.duong_dan) && !item.trinh_duyet.trim().is_empty() && browser_exists => {
            LaunchPlan::Browser {
                exe: item.trinh_duyet.trim().to_string(),
                url: item.duong_dan.trim().to_string(),
            }
        }
        _ => LaunchPlan::Default,
    }
}

/// Link web gõ thiếu scheme ("example.com") -> thêm `https://`.
pub fn normalize_url(input: &str) -> String {
    let t = input.trim();
    if is_web_link(t) {
        t.to_string()
    } else {
        format!("https://{}", t)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(loai: &str, path: &str, args: &str) -> Item {
        let mut i = Item::new("id".into(), "t".into(), path.into(), loai.into(), String::new(), "g".into());
        i.tham_so = args.into();
        i
    }

    #[test]
    fn bat_goes_through_cmd_c_with_outer_quotes() {
        let (p, a) = build_script_command(r"C:\a b\run.bat", "/x \"y z\"").unwrap();
        assert_eq!(p, "cmd.exe");
        assert_eq!(a, r#"/c ""C:\a b\run.bat" /x "y z"""#);
        let (_, a) = build_script_command(r"C:\run.CMD", "").unwrap();
        assert_eq!(a, r#"/c ""C:\run.CMD"""#);
    }

    #[test]
    fn ps1_uses_powershell_bypass() {
        let (p, a) = build_script_command(r"C:\s\do.ps1", "-Name 1").unwrap();
        assert_eq!(p, "powershell.exe");
        assert_eq!(
            a,
            r#"-NoProfile -ExecutionPolicy Bypass -File "C:\s\do.ps1" -Name 1"#
        );
    }

    #[test]
    fn unknown_script_has_no_command() {
        assert!(build_script_command(r"C:\x.py", "").is_none());
    }

    #[test]
    fn plan_for_each_type() {
        let s = item("script", r"C:\a\b.bat", "1");
        match plan_launch(&s, false) {
            LaunchPlan::Script { program, .. } => assert_eq!(program, "cmd.exe"),
            o => panic!("{:?}", o),
        }
        let c = item("lenh", r"C:\a\b.exe", " -v ");
        match plan_launch(&c, false) {
            LaunchPlan::Command { params, .. } => assert_eq!(params, "-v"),
            o => panic!("{:?}", o),
        }
        let mut l = item("link", "https://x.com/a?b=1&c=2", "");
        assert_eq!(plan_launch(&l, true), LaunchPlan::Default);
        l.trinh_duyet = r"C:\b\chrome.exe".into();
        assert_eq!(
            plan_launch(&l, true),
            LaunchPlan::Browser { exe: r"C:\b\chrome.exe".into(), url: "https://x.com/a?b=1&c=2".into() }
        );
        // Trình duyệt không còn tồn tại -> quay về mặc định.
        assert_eq!(plan_launch(&l, false), LaunchPlan::Default);
        assert_eq!(plan_launch(&item("exe", r"C:\a.exe", ""), true), LaunchPlan::Default);
    }

    #[test]
    fn url_normalization() {
        assert_eq!(normalize_url(" example.com/x "), "https://example.com/x");
        assert_eq!(normalize_url("http://a.b"), "http://a.b");
    }
}
