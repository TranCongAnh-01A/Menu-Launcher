use std::path::Path;
use sha2::Digest;
use windows::core::{PCWSTR, Interface};
use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON, IShellLinkW, ShellLink, SHCreateItemFromParsingName, IShellItemImageFactory, SIIGBF};
use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, DestroyIcon, HICON, ICONINFO, PrivateExtractIconsW};
use windows::Win32::Graphics::Gdi::{GetDIBits, GetDC, ReleaseDC, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, BI_RGB, DeleteObject, GetObjectW, BITMAP, HBITMAP};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM};
use windows::Win32::Foundation::SIZE;
use image::{RgbaImage, ImageBuffer, Rgba};
use std::os::windows::ffi::OsStrExt;

/// Khởi tạo COM cho thread hiện tại và tự giải phóng khi ra khỏi scope.
///
/// Trước đây `CoInitializeEx` được gọi ở nhiều nơi mà không bao giờ có
/// `CoUninitialize` tương ứng, khiến apartment bị rò rỉ theo từng thread.
pub(crate) struct ComGuard {
    initialized: bool,
}

impl ComGuard {
    /// Dùng STA vì các shell extension trích xuất icon yêu cầu apartment này.
    pub(crate) fn new() -> Self {
        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        // S_OK / S_FALSE: đã tăng refcount, bắt buộc phải Uninit để cân bằng.
        // RPC_E_CHANGED_MODE: thread đã ở apartment khác, ta KHÔNG được Uninit.
        Self {
            initialized: hr.is_ok(),
        }
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.initialized {
            unsafe { CoUninitialize() };
        }
    }
}

fn resolve_shortcut(lnk_path: &str) -> (Option<String>, Option<(String, i32)>) {
    unsafe {
        if let Ok(shell_link) = CoCreateInstance::<_, IShellLinkW>(&ShellLink, None, CLSCTX_INPROC_SERVER) {
            if let Ok(persist_file) = shell_link.cast::<IPersistFile>() {
                let wide_path: Vec<u16> = std::ffi::OsStr::new(lnk_path).encode_wide().chain(std::iter::once(0)).collect();
                if persist_file.Load(PCWSTR(wide_path.as_ptr()), STGM(0)).is_ok() {
                    let mut target_path = [0u16; 260];
                    let target = if shell_link.GetPath(&mut target_path, std::ptr::null_mut(), 0).is_ok() {
                        let end = target_path.iter().position(|&c| c == 0).unwrap_or(target_path.len());
                        let p = String::from_utf16_lossy(&target_path[..end]);
                        if p.is_empty() { None } else { Some(p) }
                    } else { None };

                    let mut icon_path = [0u16; 260];
                    let mut icon_index = 0i32;
                    let explicit_icon = if shell_link.GetIconLocation(&mut icon_path, &mut icon_index).is_ok() {
                        let end = icon_path.iter().position(|&c| c == 0).unwrap_or(icon_path.len());
                        let p = String::from_utf16_lossy(&icon_path[..end]);
                        if p.is_empty() { None } else { Some((p, icon_index)) }
                    } else { None };

                    return (target, explicit_icon);
                }
            }
        }
        (None, None)
    }
}

/// Trích xuất icon và tên hiển thị cho một đường dẫn.
///
/// Hàm này chặn thread (COM + đọc đĩa + encode PNG) — luôn gọi qua
/// `spawn_blocking`, đừng gọi trực tiếp trong một `async fn`.
///
/// `Option<String>` trả về là **tên file** icon trong thư mục `icons`, không phải
/// đường dẫn tuyệt đối.
pub fn get_icon_and_name(file_path: &str, app_data_dir: &Path) -> (Option<String>, String) {
    // Giữ COM sống suốt thao tác; giải phóng đúng một lần khi hàm kết thúc.
    let _com = ComGuard::new();

    let path = Path::new(file_path);
    let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
    
    let mut extract_path = file_path.to_string();
    let mut extract_index = 0i32;

    if file_path.to_lowercase().ends_with(".lnk") {
        let (target, explicit_icon) = resolve_shortcut(file_path);
        if let Some((icon_p, icon_idx)) = explicit_icon {
            extract_path = icon_p;
            extract_index = icon_idx;
        } else if let Some(target_p) = target {
            extract_path = target_p;
        }
    } else if file_path.to_lowercase().ends_with(".url") {
        if let Ok(bytes) = std::fs::read(file_path) {
            let content = String::from_utf8_lossy(&bytes);
            for line in content.lines() {
                if line.starts_with("IconFile=") {
                    extract_path = line.trim_start_matches("IconFile=").trim().to_string();
                } else if line.starts_with("IconIndex=") {
                    if let Ok(idx) = line.trim_start_matches("IconIndex=").trim().parse::<i32>() {
                        extract_index = idx;
                    }
                }
            }
        }
    }
    
    let icons_dir = app_data_dir.join("icons");
    if !icons_dir.exists() {
        let _ = std::fs::create_dir_all(&icons_dir);
    }
    
    let mut hasher = sha2::Sha256::new();
    sha2::Digest::update(&mut hasher, extract_path.to_lowercase().as_bytes());
    sha2::Digest::update(&mut hasher, extract_index.to_string().as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    let icon_file_name = format!("{}.png", hash);
    let icon_path = icons_dir.join(&icon_file_name);
    
    if icon_path.exists() {
        return (Some(icon_file_name), name);
    }
    
    if extract_and_save_icon(&extract_path, &icon_path, extract_index) {
        (Some(icon_file_name), name)
    } else if extract_path != file_path && extract_and_save_icon(file_path, &icon_path, 0) {
        (Some(icon_file_name), name)
    } else {
        (None, name)
    }
}

fn extract_and_save_icon(file_path: &str, save_path: &Path, icon_index: i32) -> bool {
    let wide_path: Vec<u16> = std::ffi::OsStr::new(file_path).encode_wide().chain(std::iter::once(0)).collect();
    
    unsafe {
        // COM đã được khởi tạo bởi ComGuard ở get_icon_and_name.
        // Modern approach: IShellItemImageFactory (handles UWP, AUMID, PDF, folders, etc. flawlessly)
        let factory_result: Result<IShellItemImageFactory, _> = SHCreateItemFromParsingName(PCWSTR(wide_path.as_ptr()), None);
        if let Ok(factory) = factory_result {
            let size = SIZE { cx: 256, cy: 256 };
            // SIIGBF_BIGGERSIZEOK (1) | SIIGBF_ICONONLY (4)
            if let Ok(hbitmap) = factory.GetImage(size, SIIGBF(1 | 4)) {
                if !hbitmap.is_invalid() {
                    let success = save_hbitmap_to_png(hbitmap, save_path);
                    let _ = DeleteObject(hbitmap);
                    if success {
                        return true;
                    }
                }
            }
        }

        // Fallback 1: PrivateExtractIconsW
        let mut hicon_large: [HICON; 1] = [HICON::default()];
        let mut icon_id: [u32; 1] = [0];
        
        let mut path_260 = [0u16; 260];
        let copy_len = std::cmp::min(wide_path.len(), 259);
        path_260[..copy_len].copy_from_slice(&wide_path[..copy_len]);

        let extracted = PrivateExtractIconsW(
            &path_260,
            icon_index,
            256,
            256,
            Some(&mut hicon_large[..]),
            Some(icon_id.as_mut_ptr()),
            1
        );
        
        // Fallback 2: SHGetFileInfoW
        let hicon = if extracted > 0 && !hicon_large[0].is_invalid() {
            hicon_large[0]
        } else {
            let mut shfi = SHFILEINFOW::default();
            let res = SHGetFileInfoW(PCWSTR(wide_path.as_ptr()), windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES(0), Some(&mut shfi), std::mem::size_of::<SHFILEINFOW>() as u32, SHGFI_ICON | SHGFI_LARGEICON);
            if res != 0 && !shfi.hIcon.is_invalid() {
                shfi.hIcon
            } else {
                return false;
            }
        };
        
        let success = save_hicon_to_png(hicon, save_path);
        let _ = DestroyIcon(hicon);
        success
    }
}

unsafe fn save_hbitmap_to_png(hbitmap: HBITMAP, save_path: &Path) -> bool {
    let mut bitmap = BITMAP::default();
    if GetObjectW(hbitmap, std::mem::size_of::<BITMAP>() as i32, Some(&mut bitmap as *mut _ as *mut std::ffi::c_void)) > 0 {
        let width = bitmap.bmWidth;
        let height = bitmap.bmHeight;
        let hdc = GetDC(None);
        
        let mut bmi = BITMAPINFO::default();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = width;
        bmi.bmiHeader.biHeight = -height;
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB.0;
        
        let mut pixels: Vec<u32> = vec![0; (width * height) as usize];
        let mut success = false;
        
        if GetDIBits(hdc, hbitmap, 0, height as u32, Some(pixels.as_mut_ptr() as *mut _), &mut bmi, DIB_RGB_COLORS) > 0 {
            let mut non_zero_alpha_count = 0;
            for &p in &pixels {
                let a = (p >> 24) & 0xff;
                if a != 0 {
                    non_zero_alpha_count += 1;
                }
            }
            
            // Nếu > 2% pixel có alpha khác 0, coi đây là 32-bit ARGB chuẩn; ngược lại coi là RGB không có kênh alpha (mặc định đục 255)
            let has_valid_alpha = (non_zero_alpha_count as f64 / pixels.len().max(1) as f64) > 0.02;
            
            let mut min_x = width;
            let mut min_y = height;
            let mut max_x = 0;
            let mut max_y = 0;
            
            for y in 0..height {
                for x in 0..width {
                    let idx = (y * width + x) as usize;
                    let pixel = pixels[idx];
                    let a = if has_valid_alpha { ((pixel >> 24) & 0xff) as u8 } else { 255 };
                    if a > 5 {
                        if x < min_x { min_x = x; }
                        if x > max_x { max_x = x; }
                        if y < min_y { min_y = y; }
                        if y > max_y { max_y = y; }
                    }
                }
            }

            // Nếu vùng crop chạm mép viền ngoài cùng của khung hình 256x256,
            // có khả năng cao là do nhiễu bóng đổ hoặc khung viền thumbnail của Windows.
            // Trong trường hợp này, áp dụng ngưỡng alpha cao hơn (80) để lọc bỏ viền nhiễu.
            if min_x == 0 || max_x == width - 1 || min_y == 0 || max_y == height - 1 {
                let mut h_min_x = width;
                let mut h_min_y = height;
                let mut h_max_x = 0;
                let mut h_max_y = 0;
                let mut found = false;
                
                for y in 0..height {
                    for x in 0..width {
                        let idx = (y * width + x) as usize;
                        let pixel = pixels[idx];
                        let a = if has_valid_alpha { ((pixel >> 24) & 0xff) as u8 } else { 255 };
                        if a > 80 {
                            if x < h_min_x { h_min_x = x; }
                            if x > h_max_x { h_max_x = x; }
                            if y < h_min_y { h_min_y = y; }
                            if y > h_max_y { h_max_y = y; }
                            found = true;
                        }
                    }
                }
                
                if found {
                    min_x = h_min_x;
                    max_x = h_max_x;
                    min_y = h_min_y;
                    max_y = h_max_y;
                }
            }
            
            if min_x > max_x || min_y > max_y {
                min_x = 0; max_x = width - 1;
                min_y = 0; max_y = height - 1;
            }
            
            let crop_width = max_x - min_x + 1;
            let crop_height = max_y - min_y + 1;
            
            let mut img: RgbaImage = ImageBuffer::new(crop_width as u32, crop_height as u32);
            for y in min_y..=max_y {
                for x in min_x..=max_x {
                    let idx = (y * width + x) as usize;
                    let pixel = pixels[idx];
                    let r = ((pixel >> 16) & 0xff) as u8;
                    let g = ((pixel >> 8) & 0xff) as u8;
                    let b = (pixel & 0xff) as u8;
                    let a = if has_valid_alpha { ((pixel >> 24) & 0xff) as u8 } else { 255 };
                    img.put_pixel((x - min_x) as u32, (y - min_y) as u32, Rgba([r, g, b, a]));
                }
            }
            if img.save(save_path).is_ok() {
                success = true;
            }
        }
        ReleaseDC(None, hdc);
        success
    } else {
        false
    }
}

unsafe fn save_hicon_to_png(hicon: HICON, save_path: &Path) -> bool {
    let mut icon_info = ICONINFO::default();
    if GetIconInfo(hicon, &mut icon_info).is_err() {
        return false;
    }
    
    let hbm_color = icon_info.hbmColor;
    let hbm_mask = icon_info.hbmMask;
    let mut success = false;
    
    if !hbm_color.is_invalid() {
        let mut bitmap = BITMAP::default();
        if GetObjectW(hbm_color, std::mem::size_of::<BITMAP>() as i32, Some(&mut bitmap as *mut _ as *mut std::ffi::c_void)) > 0 {
            let width = bitmap.bmWidth;
            let height = bitmap.bmHeight;
            let hdc = GetDC(None);
            
            let mut bmi = BITMAPINFO::default();
            bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
            bmi.bmiHeader.biWidth = width;
            bmi.bmiHeader.biHeight = -height;
            bmi.bmiHeader.biPlanes = 1;
            bmi.bmiHeader.biBitCount = 32;
            bmi.bmiHeader.biCompression = BI_RGB.0;
            
            let mut pixels: Vec<u32> = vec![0; (width * height) as usize];
            
            if GetDIBits(hdc, hbm_color, 0, height as u32, Some(pixels.as_mut_ptr() as *mut _), &mut bmi, DIB_RGB_COLORS) > 0 {
                
                let mut all_alpha_0 = true;
                let mut all_alpha_255 = true;
                for &p in &pixels {
                    let a = (p >> 24) & 0xff;
                    if a != 0 { all_alpha_0 = false; }
                    if a != 255 { all_alpha_255 = false; }
                }
                
                let use_mask = all_alpha_0 || all_alpha_255;
                let mut mask_pixels: Vec<u32> = vec![0; (width * height) as usize];
                
                if use_mask && !hbm_mask.is_invalid() {
                    let mut mask_bmi = BITMAPINFO::default();
                    mask_bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
                    mask_bmi.bmiHeader.biWidth = width;
                    mask_bmi.bmiHeader.biHeight = -height;
                    mask_bmi.bmiHeader.biPlanes = 1;
                    mask_bmi.bmiHeader.biBitCount = 32;
                    mask_bmi.bmiHeader.biCompression = BI_RGB.0;
                    GetDIBits(hdc, hbm_mask, 0, height as u32, Some(mask_pixels.as_mut_ptr() as *mut _), &mut mask_bmi, DIB_RGB_COLORS);
                }

                let mut min_x = width;
                let mut min_y = height;
                let mut max_x = 0;
                let mut max_y = 0;
                
                for y in 0..height {
                    for x in 0..width {
                        let idx = (y * width + x) as usize;
                        let mut a = ((pixels[idx] >> 24) & 0xff) as u8;
                        if use_mask {
                            let m = mask_pixels[idx] & 0xff;
                            if m > 127 { a = 0; } else { a = 255; }
                        }
                        if a > 5 {
                            if x < min_x { min_x = x; }
                            if x > max_x { max_x = x; }
                            if y < min_y { min_y = y; }
                            if y > max_y { max_y = y; }
                        }
                    }
                }

                // Nếu vùng crop chạm mép viền ngoài cùng của khung hình 256x256,
                // áp dụng ngưỡng alpha cao hơn (80) để loại bỏ nhiễu viền hoặc bóng đổ.
                if min_x == 0 || max_x == width - 1 || min_y == 0 || max_y == height - 1 {
                    let mut h_min_x = width;
                    let mut h_min_y = height;
                    let mut h_max_x = 0;
                    let mut h_max_y = 0;
                    let mut found = false;
                    
                    for y in 0..height {
                        for x in 0..width {
                            let idx = (y * width + x) as usize;
                            let mut a = ((pixels[idx] >> 24) & 0xff) as u8;
                            if use_mask {
                                let m = mask_pixels[idx] & 0xff;
                                if m > 127 { a = 0; } else { a = 255; }
                            }
                            if a > 80 {
                                if x < h_min_x { h_min_x = x; }
                                if x > h_max_x { h_max_x = x; }
                                if y < h_min_y { h_min_y = y; }
                                if y > h_max_y { h_max_y = y; }
                                found = true;
                            }
                        }
                    }
                    
                    if found {
                        min_x = h_min_x;
                        max_x = h_max_x;
                        min_y = h_min_y;
                        max_y = h_max_y;
                    }
                }
                
                if min_x > max_x || min_y > max_y {
                    min_x = 0; max_x = width - 1;
                    min_y = 0; max_y = height - 1;
                }
                
                let crop_width = max_x - min_x + 1;
                let crop_height = max_y - min_y + 1;

                let mut img: RgbaImage = ImageBuffer::new(crop_width as u32, crop_height as u32);
                for y in min_y..=max_y {
                    for x in min_x..=max_x {
                        let idx = (y * width + x) as usize;
                        let pixel = pixels[idx];
                        
                        let r = ((pixel >> 16) & 0xff) as u8;
                        let g = ((pixel >> 8) & 0xff) as u8;
                        let b = (pixel & 0xff) as u8;
                        let mut a = ((pixel >> 24) & 0xff) as u8;
                        
                        if use_mask {
                            let m = mask_pixels[idx] & 0xff;
                            if m > 127 {
                                a = 0;
                            } else {
                                a = 255;
                            }
                        }
                        
                        img.put_pixel((x - min_x) as u32, (y - min_y) as u32, Rgba([r, g, b, a]));
                    }
                }
                if img.save(save_path).is_ok() {
                    success = true;
                }
            }
            ReleaseDC(None, hdc);
        }
    }
    
    if !hbm_color.is_invalid() {
        let _ = DeleteObject(hbm_color);
    }
    if !hbm_mask.is_invalid() {
        let _ = DeleteObject(hbm_mask);
    }
    
    success
}
