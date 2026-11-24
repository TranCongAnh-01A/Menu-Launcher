//! Phát hiện trình duyệt đã cài từ registry (chỉ đọc).

use serde::Serialize;
use windows::core::PCWSTR;
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::{
    RegCloseKey, RegEnumKeyExW, RegGetValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER,
    HKEY_LOCAL_MACHINE, KEY_READ, RRF_RT_REG_EXPAND_SZ, RRF_RT_REG_SZ,
};

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct Browser {
    pub ten: String,
    pub duong_dan: String,
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Đọc giá trị mặc định (chuỗi) của một khóa con.
fn read_default(root: HKEY, subkey: &str) -> Option<String> {
    let sk = wide(subkey);
    let mut size: u32 = 0;
    let flags = RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ;
    unsafe {
        if RegGetValueW(root, PCWSTR(sk.as_ptr()), PCWSTR::null(), flags, None, None, Some(&mut size)) != ERROR_SUCCESS
            || size == 0
        {
            return None;
        }
        let mut buf = vec![0u16; (size as usize + 1) / 2 + 1];
        let mut size2 = (buf.len() * 2) as u32;
        if RegGetValueW(
            root,
            PCWSTR(sk.as_ptr()),
            PCWSTR::null(),
            flags,
            None,
            Some(buf.as_mut_ptr() as *mut _),
            Some(&mut size2),
        ) != ERROR_SUCCESS
        {
            return None;
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        let s = String::from_utf16_lossy(&buf[..end]);
        if s.is_empty() { None } else { Some(s) }
    }
}

/// Liệt kê tên khóa con.
fn enum_subkeys(root: HKEY, subkey: &str) -> Vec<String> {
    let sk = wide(subkey);
    let mut out = Vec::new();
    unsafe {
        let mut h = HKEY::default();
        if RegOpenKeyExW(root, PCWSTR(sk.as_ptr()), None, KEY_READ, &mut h) != ERROR_SUCCESS {
            return out;
        }
        let mut i = 0u32;
        loop {
            let mut name = [0u16; 256];
            let mut len = name.len() as u32;
            let r = RegEnumKeyExW(
                h,
                i,
                Some(windows::core::PWSTR(name.as_mut_ptr())),
                &mut len,
                None,
                None,
                None,
                None,
            );
            if r != ERROR_SUCCESS {
                break;
            }
            out.push(String::from_utf16_lossy(&name[..len as usize]));
            i += 1;
        }
        let _ = RegCloseKey(h);
    }
    out
}

/// Lấy đường dẫn exe từ chuỗi lệnh registry (có thể có nháy và tham số).
pub fn parse_command_exe(cmd: &str) -> Option<String> {
    let t = cmd.trim();
    if let Some(rest) = t.strip_prefix('"') {
        let end = rest.find('"')?;
        let p = rest[..end].trim();
        return if p.is_empty() { None } else { Some(p.to_string()) };
    }
    let lower = t.to_lowercase();
    let end = lower.find(".exe")? + 4;
    Some(t[..end].to_string())
}

/// Danh sách trình duyệt có exe tồn tại, bỏ trùng đường dẫn.
pub fn detect_browsers_blocking() -> Vec<Browser> {
    let mut result: Vec<Browser> = Vec::new();
    let bases = [
        r"SOFTWARE\Clients\StartMenuInternet",
        r"SOFTWARE\WOW6432Node\Clients\StartMenuInternet",
    ];
    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        for base in bases {
            for key in enum_subkeys(root, base) {
                let ten = read_default(root, &format!(r"{}\{}", base, key)).unwrap_or_else(|| key.clone());
                let Some(cmd) = read_default(root, &format!(r"{}\{}\shell\open\command", base, key)) else {
                    continue;
                };
                let Some(exe) = parse_command_exe(&cmd) else { continue };
                if !std::path::Path::new(&exe).is_file() {
                    continue;
                }
                let norm = exe.to_lowercase();
                if result.iter().any(|b| b.duong_dan.to_lowercase() == norm) {
                    continue;
                }
                result.push(Browser { ten, duong_dan: exe });
            }
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_quoted_and_bare_commands() {
        assert_eq!(
            parse_command_exe(r#""C:\Program Files\Google\Chrome\chrome.exe" --flag"#).as_deref(),
            Some(r"C:\Program Files\Google\Chrome\chrome.exe")
        );
        assert_eq!(
            parse_command_exe(r"C:\Opera\opera.EXE -x").as_deref(),
            Some(r"C:\Opera\opera.EXE")
        );
        assert_eq!(parse_command_exe("notexe"), None);
        assert_eq!(parse_command_exe(r#""""#), None);
    }
}
