# Kế hoạch: Sửa lỗi mức Nặng + Vừa — 2026-11-24

Danh sách lỗi và vị trí: `docs/plan/review_loi_20261124.md`. Hai phần độc lập, file không chồng nhau:
- **Phần Rust** — chỉ sửa trong `src-tauri/src/`.
- **Phần Frontend** — chỉ sửa trong `src/`.

Nguyên tắc chung: sửa tối thiểu, không refactor ngoài phạm vi, giữ comment tiếng Việt theo phong cách hiện có, không đổi API IPC (tên lệnh/tham số) trừ khi ghi rõ.

## Phần Rust
- **R1 — khoá ghi `save()`**: thêm `save_lock: tokio::sync::Mutex<()>` vào `AppState`; `save()` giữ khoá suốt serialize → backup → write tmp → rename. Không giữ `data` lock trong lúc I/O (giữ nguyên cách lấy read lock chỉ để serialize, nhưng serialize phải nằm TRONG `save_lock` để bản ghi sau luôn mới hơn).
- **R2 — không giữ write lock khi kiểm tra file**: ở validation nền (`lib.rs` ~123) và `rescan_validity` (`settings_commands.rs` ~113): lấy danh sách `(id, duong_dan)` dưới read lock → `tokio::task::spawn_blocking` chạy `path_is_valid` → lấy write lock, áp kết quả theo `id` (bỏ qua id đã bị xoá). `open_item` / `launch_items`: bọc lời gọi `path_is_valid` trong `spawn_blocking`.
- **R3 — không xoá icon khi xoá mục**: bỏ đoạn xoá file icon trong `delete_item` và `delete_group` (nhánh xoá). Thay bằng hàm dọn icon mồ côi chạy một lần lúc khởi động (sau khi load dữ liệu, chạy nền): xoá file trong `icons_dir` không được mục nào tham chiếu (`icon_cache` so theo tên file / đường dẫn — đọc code để so cho đúng định dạng đang lưu).
- **R4 — phím tắt**: lưu phím tắt đang hoạt động trong state (vd `Mutex<Option<Shortcut>>` quản lý bằng `app.manage`). `register_global_shortcut`: đăng ký phím mới; nếu thất bại → đăng ký lại phím cũ (nếu có) rồi trả lỗi. Tách closure xử lý phím thành một hàm dùng chung. `unregister_global_shortcut` xoá giá trị đã lưu.
- **R5 — chạy quyền admin**: `ShellExecuteW` (runas và các chỗ gọi khác trong item_commands.rs) chạy trong `spawn_blocking`, có `CoInitializeEx(COINIT_APARTMENTTHREADED)` (dùng `ComGuard` có sẵn trong icon_manager.rs nếu dùng lại được).
- Kiểm tra: `cd src-tauri && cargo check` (0 lỗi, 0 warning mới) và `cargo test` (9 test cũ đạt; thêm 1 test cho R1 nếu dễ: nhiều `save()` đồng thời không lỗi).

## Phần Frontend
- **F1 — tự chọn kết quả tìm kiếm**: trong `MenuViewer.tsx`, khi `searchTerm` đổi thì đặt cờ ref "chờ chọn"; một effect theo `navItems` thấy cờ thì chọn `navItems[0]` (hoặc null) rồi tắt cờ. Không đổi hành vi khi không tìm kiếm.
- **F2 — kéo icon vào nhóm ở sidebar**: sidebar nằm ngoài `DndContext` (DndContext ở trong MenuViewer) và đang đọc `dataTransfer` (HTML5) nên không chạy. Cách đề xuất: các nút nhóm ở `GroupNavList.tsx` (và tab nhóm ở `ContentArea.tsx` nếu cũng dùng HTML5 drop — kiểm tra) gắn `data-drop-group-id`. Trong `handleDragEnd` của MenuViewer, tính toạ độ con trỏ cuối (`activatorEvent` clientX/Y + `delta`), dùng `document.elementsFromPoint` tìm phần tử có `closest('[data-drop-group-id]')`; nếu có → `handleMoveToGroup`. Thêm highlight khi rê qua (theo dõi trong `onDragMove`, đặt thuộc tính/class qua state hoặc DOM) nếu gọn. Bỏ code HTML5 drop chết. Nhóm "Tất cả" không nhận thả.
- **F3 — AddItemModal tạo nhóm trùng**: nhớ id nhóm vừa tạo (state/ref); bấm lại thì dùng id đó, không tạo nhóm mới. Sau khi tạo nhóm phát `app-items-changed` để sidebar cập nhật. Thêm `.catch` cho `getAllGroups()` (F11 rẻ, làm luôn).
- **F4 — báo lỗi**: `CreateGroupModal.tsx`, `GroupManagerModal.tsx` (đổi tên, xoá, kéo sắp xếp): thay `console.error` đơn thuần bằng thêm `showToast(..., 'error')` (dùng `useNotification`). Tên nhóm rỗng/toàn khoảng trắng → toast cảnh báo.
- **F5 — refresh chồng nhau**: `LauncherDataContext.tsx`: bộ đếm ref; chỉ áp kết quả của lần gọi mới nhất. Lỗi tải → toast (nếu context có thể dùng `useNotification` — kiểm tra thứ tự provider; không được thì giữ console).
- **F6 — thả file khi đang mở modal**: `MainWindow.tsx` `onDragDropEvent`: nếu `hasOpenOverlay()` thì không bật overlay và bỏ qua drop. Kiểm tra `hasOpenOverlay()` (utils/overlay.ts) có nhận ra mọi modal (Settings, AddItem, confirm, GroupManager…); nếu thiếu thì bổ sung `data-overlay` cho modal đó.
- Kiểm tra: `npx tsc --noEmit` sạch; `npx vite build` thành công.

## Báo cáo
Dòng đầu: `XONG: <task> | File: ... | Kiểm tra: ... | Khác kế hoạch: ... | Còn lại: ...`, sau đó liệt kê ngắn từng mục R*/F* đã làm thế nào.
