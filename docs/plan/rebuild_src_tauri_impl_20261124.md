# Kế hoạch: Dựng lại `src-tauri/` — 2026-11-24

## Bối cảnh
Thư mục `src-tauri/` bị mất hoàn toàn (không còn Cargo.toml, tauri.conf.json, build.rs, icons, capabilities). Các file Rust đang nằm lẫn trong `src/`. Dự án không có git → không khôi phục được, phải dựng lại.

## Mục tiêu / Xong khi
- `src-tauri/` chuẩn Tauri 2, code Rust nằm ở `src-tauri/src/`.
- `cargo check` (trong `src-tauri/`) không lỗi; `cargo test` chạy được (các test `#[tokio::test]` trong data_service.rs).
- `npx tsc --noEmit` vẫn sạch; `src/` chỉ còn code frontend.
- KHÔNG sửa logic code Rust/TS (chỉ sửa tối thiểu nếu bắt buộc để biên dịch — ghi vào báo cáo).

## Các bước
1. **Di chuyển** (dùng `mv`, không copy): `src/lib.rs`, `src/main.rs`, `src/core/`, `src/ipc_commands/` → `src-tauri/src/`.
2. **`src-tauri/Cargo.toml`**:
   - `[package] name = "desktop-menu-launcher"`, version `1.0.0`, edition `2021`.
   - `[lib] name = "tauri_app_lib"` (main.rs gọi `tauri_app_lib::run()`), `crate-type = ["staticlib", "cdylib", "rlib"]`.
   - `[build-dependencies] tauri-build = "2"`.
   - Dependencies: `tauri = { version = "2", features = ["tray-icon", "protocol-asset", "image-png"] }`, `tauri-plugin-dialog = "2"`, `tauri-plugin-single-instance = "2"`, `tauri-plugin-autostart = "2"`, `tauri-plugin-window-state = "2"`, `tauri-plugin-global-shortcut = "2"`, `serde = { version = "1", features = ["derive"] }`, `serde_json = "1"`, `tokio = { version = "1", features = ["fs", "sync", "time", "macros", "rt-multi-thread"] }`, `chrono = { version = "0.4", features = ["serde"] }`, `image = { version = "0.25", default-features = false, features = ["png"] }`, `sha2 = "0.10"`, `log = "0.4"`.
   - `windows = "0.61"` (hoặc phiên bản mà tauri 2 đang dùng — kiểm tra `cargo tree -i windows` để tránh trùng nhiều bản) với features: `Win32_Foundation`, `Win32_Graphics_Gdi`, `Win32_Storage_FileSystem`, `Win32_System_Com`, `Win32_System_Com_StructuredStorage`, `Win32_UI_Shell`, `Win32_UI_Shell_Common`, `Win32_UI_WindowsAndMessaging`. Thêm feature nào compiler báo thiếu.
   - Dùng mục nào mà code cần nhưng thiếu ở trên → thêm, ghi vào báo cáo. Kiểm tra `grep -rn "use \|::" src-tauri/src` để không sót crate.
   - `[profile.release]`: `opt-level = "s"`, `lto = true`, `codegen-units = 1`, `strip = true`, `panic = "unwind"` (lib.rs có xử lý panic lúc khởi động — kiểm tra trước khi chọn).
3. **`src-tauri/build.rs`**: `fn main() { tauri_build::build() }`.
4. **`src-tauri/tauri.conf.json`** (schema Tauri 2):
   - `productName: "Desktop Menu Launcher"`, `version: "1.0.0"`, `identifier: "com.desktopmenulauncher.app"`.
   - `build`: `beforeDevCommand: "npm run dev"`, `devUrl: "http://localhost:1420"`, `beforeBuildCommand: "npm run build"`, `frontendDist: "../dist"`.
   - `app.windows`: 1 cửa sổ `label: "main"`, title "Desktop Menu Launcher", width 1100, height 720, minWidth 760, minHeight 500, `center: true`, `dragDropEnabled: true` (MainWindow dùng `onDragDropEvent` nhận file từ Explorer). Đọc `src-tauri/src/lib.rs` + `src/layouts/MainWindow.tsx` xem có cần `visible: false` lúc khởi động / decorations không — chọn cho khớp code.
   - `app.security.csp: null`; `assetProtocol: { enable: true, scope: ["$APPDATA/**", "$LOCALDATA/**"] }` (icon cache hiển thị bằng `convertFileSrc`; đường dẫn dữ liệu xem trong `core/data_service.rs`, chỉnh scope cho đúng).
   - `bundle`: `active: true`, `targets: ["msi", "nsis"]`, `icon`: các file trong `icons/`.
5. **`src-tauri/capabilities/default.json`**: `windows: ["main"]`, permissions: `core:default`, `core:window:default`, `core:webview:default`, `core:event:default`, `dialog:default`, `autostart:default`, `global-shortcut:default`, `window-state:default`. Frontend dùng `@tauri-apps/api/{core,event,webview}`, `plugin-autostart`, `plugin-dialog`; thêm permission nếu cần (vd `dialog:allow-open`).
6. **Icons**: tạo một PNG vuông 1024×1024 đơn giản (ví dụ từ `public/tauri.svg` hoặc một ảnh tạm) rồi chạy `npx tauri icon <file>` → `src-tauri/icons/`. Nếu không làm được thì tạo icon tạm bằng script; `generate_context!` bắt buộc phải có icon.
7. **`src-tauri/.gitignore`**: `/target/`, `/gen/schemas`.
8. **`tsconfig.json`**: chắc chắn `include` không kéo vào `src-tauri`.

## Kiểm tra
- `cd src-tauri && cargo check` → 0 lỗi (có thể chạy lâu, cho chạy ngầm).
- `cargo test` → ghi kết quả.
- `npx tsc --noEmit` ở thư mục gốc → sạch.
- KHÔNG chạy `tauri dev` / `tauri build` (mở cửa sổ GUI).

## Lưu ý
- Không chạy `cargo update` hay đổi phiên bản crate ngoài danh sách trên trừ khi bắt buộc.
- Mọi chỗ sửa vào code Rust có sẵn → ghi rõ file:dòng trong báo cáo.
