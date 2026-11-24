# Kế hoạch nâng cấp v1.1 — 2026-11-24

Tauri 2 + React 19 (TS) launcher cho Windows. Repo git: `main`, remote `origin` = github.com/TranCongAnh-01A/Menu-Launcher.
Làm **tuần tự từng giai đoạn** (G1 → G5); mỗi giai đoạn xong được main session kiểm tra rồi commit. Không tự commit / push.

## Quyết định đã chốt với người dùng
- Workspace = **danh sách riêng**, chọn mục từ mọi nhóm, một mục có thể ở nhiều workspace, có độ trễ giữa các app.
- Loại mục mới: **Lệnh có tham số**, **Script .bat/.cmd/.ps1** (tuỳ chọn ẩn console), **Link web mở bằng trình duyệt chỉ định**.
- Menu khay: **các nhóm** (menu con chứa mục) + **Hay dùng / Gần đây**.
- Chia sẻ: **tự cập nhật (GitHub Releases)** + **CI build (GitHub Actions)**. Không ký số, không portable, icon giữ tạm.

## Nguyên tắc chung (mọi giai đoạn)
- Không phá dữ liệu cũ: mọi field mới trong Rust có `#[serde(default)]`; file `menu_data.json` cũ phải load được (thêm test).
- Không đổi tên/tham số IPC đang có; lệnh mới đăng ký trong `generate_handler!` ở `src-tauri/src/lib.rs`, wrapper trong `src/api/index.ts`.
- Comment tiếng Việt theo phong cách hiện có. UI theo style hiện có (Tailwind, phosphor icons, modal `.modal-backdrop`, toast `useNotification`).
- Không xoá/di chuyển file của người dùng ngoài thư mục dữ liệu app.
- **Tự kiểm tra trước khi báo cáo**: `cd src-tauri && cargo check` (không warning mới) + `cargo test`; ở gốc `npx tsc --noEmit` + `npx vite build`. Không chạy `tauri dev`. Chỉ chạy `npm run build:app` khi giai đoạn yêu cầu.
- Báo cáo dòng đầu: `XONG: <task> | File: ... | Kiểm tra: ... | Khác kế hoạch: ... | Còn lại: ...`

---

## G1 — Tối ưu (không thêm chức năng)
1. **Gộp crate `windows`**: nâng `windows` trong Cargo.toml lên đúng bản mà tauri/tao đang dùng (`cargo tree -i windows` — chọn bản tauri dùng, hiện là 0.61), sửa các chỗ lỗi API trong `core/icon_manager.rs` (DeleteObject/GetObjectW nhận `HGDIOBJ`, …). Thay khai báo tay `MultiByteToWideChar` bằng `windows::Win32::Globalization` (thêm feature). Mục tiêu: Cargo.lock chỉ còn 1 bản `windows` cho app (ghi số bản trước/sau vào báo cáo).
2. **Giảm bundle JS**: `vite build` đang cảnh báo chunk > 500 kB. Lazy-load các modal lớn (SettingsModal, GroupManagerModal, AddItemModal, ShortcutSetupModal) bằng `React.lazy` + `Suspense`; `build.rollupOptions.output.manualChunks` tách vendor (react, dnd-kit, tanstack, phosphor). Ghi kích thước trước/sau.
3. **Tách file lớn**: tách từ `MenuViewer.tsx` ra `features/MenuViewer/ItemContextMenu.tsx` và `RenameItemModal.tsx` (giữ nguyên hành vi). Không đụng logic kéo thả / tìm kiếm.
4. **Dọn file chết**: xoá `src/App1.css`, `src/shared/` (rỗng), `src/assets/react.svg` nếu không được import (grep trước).
5. **RAM khi ẩn**: kiểm tra code có suspend WebView2 khi ẩn cửa sổ chưa. Nếu chưa và làm được gọn: khi ẩn (hide/close-to-tray) gọi `ICoreWebView2_3::TrySuspend`, khi hiện gọi `Resume`, qua `window.with_webview` + crate `webview2-com` cùng bản tauri dùng. Nếu phức tạp/rủi ro → bỏ, ghi lý do vào báo cáo.
6. Kiểm tra: như nguyên tắc chung + `npm run build:app` thành công; báo kích thước exe/setup trước (exe 8.5 MB, setup 2.5 MB) và sau.

## G2 — Nền dữ liệu + Hay dùng / Gần đây + Tìm kiếm thông minh
**Mô hình dữ liệu (làm toàn bộ ở G2, các giai đoạn sau dùng lại):**
- `Item` thêm (đều `#[serde(default)]`): `so_lan_mo: u32`, `lan_mo_cuoi: Option<i64>` (unix ms), `tham_so: String`, `thu_muc_lam_viec: String`, `trinh_duyet: String` (đường dẫn exe trình duyệt, rỗng = mặc định), `an_console: bool`.
- `loai` thêm giá trị `"lenh"` (exe + tham số) và `"script"` (.bat/.cmd/.ps1). Link web vẫn là loại link hiện có (đọc code để biết giá trị đang dùng) + `trinh_duyet`.
- `MenuData` thêm `workspaces: Vec<Workspace>` (`#[serde(default)]`), `Workspace { id, ten, thu_tu: i32, muc_ids: Vec<String>, do_tre_ms: u32 }`. `phien_ban_schema` → 4. Test: load JSON schema 3 cũ → đủ field mặc định.
- TS `Item` / `Workspace` trong `src/api/index.ts` cập nhật tương ứng.

**Đếm lượt mở:** mọi đường mở mục (`open_item`, `open_item_as_admin`, `launch_items`) tăng `so_lan_mo`, đặt `lan_mo_cuoi`, lưu (không chặn việc mở; lỗi lưu chỉ log). Tách hàm dùng chung `record_launch(state, ids)` để G4 (khay, workspace) gọi lại.

**Nhóm ảo "Hay dùng" / "Gần đây":** trong sidebar, dưới "Tất cả", hai mục đặc biệt (id `__hay_dung__`, `__gan_day__`, không lưu vào dữ liệu). Hay dùng = top 20 theo `so_lan_mo` (>0); Gần đây = top 20 theo `lan_mo_cuoi`. Ở hai view này tắt kéo sắp xếp (như khi tìm kiếm) nhưng vẫn mở/xoá/menu chuột phải được. Không nhận thả "chuyển nhóm". Menu chuột phải thêm "Xoá khỏi lịch sử" (reset `so_lan_mo`/`lan_mo_cuoi` qua lệnh mới `reset_item_usage`).

**Tìm kiếm thông minh** (`src/utils/search.ts`, dùng ở `ContentArea.tsx` chỗ đang lọc `includes`):
- Chuẩn hoá: lowercase, bỏ dấu tiếng Việt (NFD + bỏ dấu kết hợp, `đ→d`).
- Khớp: chuỗi con liên tục (điểm cao nhất) > đầu từ / chữ cái đầu ("vsc" → "Visual Studio Code") > subsequence (fuzzy). Trường xét: `ten` (trọng số cao), `duong_dan`, `tham_so`.
- Xếp hạng: điểm khớp + thưởng nhỏ theo `log(so_lan_mo+1)` và độ mới. Kết quả tìm kiếm hiển thị theo thứ tự xếp hạng (không theo nhóm) — kiểm tra MenuViewer khi đang tìm kiếm vẫn đúng (auto-select kết quả đầu, Enter mở).
- Thêm vài test nhỏ nếu có cách chạy (không có test runner frontend thì viết hàm thuần, kiểm bằng `npx tsx` script tạm trong scratch, không commit).

## G3 — Loại mục mới + Quét Desktop/Start Menu
**Loại mục mới:**
- Rust: hàm mở theo `loai`: `lenh` → ShellExecuteW với `lpParameters = tham_so`, `lpDirectory = thu_muc_lam_viec` (rỗng → thư mục chứa exe); `script` → `.bat/.cmd` qua `cmd.exe /c "<file>" <tham_so>`, `.ps1` qua `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<file>" <tham_so>`, `an_console` → `CREATE_NO_WINDOW`; link + `trinh_duyet` không rỗng → chạy exe trình duyệt với URL làm tham số. Chạy quyền admin áp dụng được cho lenh/script (verb runas).
- Lệnh mới `add_custom_item(...)` (tên, loai, duong_dan, tham_so, thu_muc_lam_viec, trinh_duyet, an_console, nhom_id) và `update_item_details(id, ...)` để sửa. Icon: trích từ exe/script như hiện có; link có trình duyệt → icon trình duyệt.
- Lệnh `detect_browsers()` → danh sách `{ten, duong_dan}` từ registry `HKLM/HKCU\SOFTWARE\Clients\StartMenuInternet\*\shell\open\command` (thêm feature `Win32_System_Registry`), chỉ trả exe tồn tại.
- UI: `AddItemModal` thêm tab/chế độ "Nâng cao" (Lệnh / Script / Link web) với các ô tương ứng (chọn file bằng dialog, chọn thư mục, dropdown trình duyệt). Menu chuột phải thêm "Sửa mục..." mở cùng form để sửa. Thẻ mục hiển thị huy hiệu nhỏ cho lenh/script.

**Quét Desktop / Start Menu:**
- Lệnh `scan_shortcuts()` → ứng viên từ: Desktop người dùng + Public Desktop, Start Menu người dùng (`%APPDATA%\Microsoft\Windows\Start Menu\Programs`) + chung (`%ProgramData%\...`). Lấy `.lnk`, `.url`, `.exe` (Start Menu đệ quy, Desktop 1 cấp + thư mục). Bỏ: mục đã có trong menu (so đường dẫn chuẩn hoá), shortcut gỡ cài đặt (tên/đích chứa uninstall/unins/gỡ cài đặt), help/readme. Trả `{ten, duong_dan, nguon: "desktop"|"startmenu", thu_muc_con}`; chạy trong `spawn_blocking`.
- UI: nút "Quét máy" (trong AddItemModal hoặc cạnh nút Thêm) → modal danh sách có checkbox, ô lọc, nhóm theo nguồn, chọn tất cả/bỏ chọn, chọn nhóm đích → thêm bằng luồng `add_item` có sẵn (hiện tiến độ + tổng kết toast). **Không** di chuyển/xoá file trên Desktop.

## G4 — Workspace + Menu khay
**Workspace:**
- Lệnh: `get_workspaces`, `add_workspace(ten)`, `update_workspace(id, ten, muc_ids, do_tre_ms)`, `delete_workspace(id)`, `reorder_workspaces(ids)`, `launch_workspace(id)` (mở tuần tự theo `muc_ids`, chờ `do_tre_ms` giữa các app, bỏ qua mục đã xoá, trả tổng kết giống `launch_items`, gọi `record_launch`). Xoá mục → gỡ id khỏi mọi workspace (trong `delete_item`; `restore_item` không cần khôi phục vào workspace).
- UI: sidebar thêm mục "Workspace" (dưới danh sách nhóm): liệt kê workspace, nút ▶ chạy, nút quản lý. `WorkspaceManagerModal`: tạo/đổi tên/xoá, chọn mục (danh sách có ô tìm kiếm + checkbox, dùng `search.ts`), sắp thứ tự (dnd-kit sortable), độ trễ (0–10 s). Menu chuột phải mục: "Thêm vào workspace ▸".

**Menu khay:**
- Dựng menu động: "Mở Launcher", ngăn cách, **Hay dùng ▸** (top 8), **Gần đây ▸** (top 8), ngăn cách, mỗi nhóm là menu con chứa mục (giới hạn 30 mục/nhóm, nhóm rỗng ẩn), **Workspace ▸** (nếu có), ngăn cách, "Thoát". Id menu `item:<id>`, `ws:<id>`. Bấm → mở mục / chạy workspace (dùng lại hàm Rust, có `record_launch`).
- Hàm `rebuild_tray_menu(app)`: gọi lúc khởi động và sau mỗi thay đổi dữ liệu (thêm/xoá/đổi tên/chuyển nhóm/mở mục/workspace). Cách gọn: sau `state.save()` thành công phát một tín hiệu (vd `tokio::sync::Notify` hoặc channel trong AppState) mà một task nền lắng nghe, debounce ~300 ms rồi rebuild. Tray lưu bằng id cố định (`TrayIconBuilder::with_id("main")`) để `app.tray_by_id` lấy lại và `set_menu`.
- Icon trong menu khay: không bắt buộc (bỏ qua nếu phức tạp).

## G5 — Hoàn thiện chia sẻ (tự cập nhật + CI)
- Thêm `tauri-plugin-updater` + `tauri-plugin-process` (Rust + npm `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, đúng major/minor khớp nhau), permission vào `capabilities/default.json`.
- `tauri.conf.json`: `bundle.createUpdaterArtifacts: true`; `plugins.updater.endpoints = ["https://github.com/TranCongAnh-01A/Menu-Launcher/releases/latest/download/latest.json"]`, `pubkey`: placeholder `"__THAY_BANG_PUBKEY__"` (người dùng tự tạo khoá, main session sẽ điền).
- Build cục bộ không có khoá riêng phải vẫn chạy: script `build:app` truyền config tắt `createUpdaterArtifacts` (vd `tauri build --config src-tauri/tauri.local.conf.json` hoặc JSON inline) — kiểm tra `npm run build:app` thành công.
- Frontend: khi khởi động (sau 10 s, im lặng) kiểm tra cập nhật; có bản mới → toast có nút "Cập nhật" → tải + cài + `relaunch()`. Settings thêm mục "Phiên bản x.y.z" + nút "Kiểm tra cập nhật".
- `.github/workflows/release.yml`: chạy khi push tag `v*`, `windows-latest`, setup Node 20 + Rust stable + cache, `npm ci`, `tauri-apps/tauri-action@v0` với `tagName: v__VERSION__`, `releaseDraft: false`, env `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` từ secrets, `includeUpdaterJson: true`.
- `docs/RELEASE.md`: hướng dẫn tiếng Việt: tạo khoá (`npx tauri signer generate -w ~/.tauri/menu-launcher.key`), thêm 2 secrets trên GitHub, dán pubkey vào tauri.conf.json, tăng version ở 3 nơi (package.json, Cargo.toml, tauri.conf.json), tạo tag và push.
- Version → `1.1.0` ở cả 3 nơi.
