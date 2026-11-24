# Rà soát lỗi tổng quan — 2026-11-24

Đã sửa: lỗi kéo icon ở trang "Tất cả" bị nhảy hàng (`MenuViewer.tsx`: `sortableIds` theo thứ tự hiển thị, `handleReorder` dùng `arrayMove`, báo lỗi khi chuyển nhóm thất bại).

## Rust (`src-tauri/src/`)
| # | Mức | Vị trí | Lỗi |
|---|---|---|---|
| R1 | Nặng | core/data_service.rs:153 `save()` | Không có khoá ghi; hai lần lưu gần nhau dùng chung `.json.tmp` → có thể ghi đè bản mới bằng bản cũ hoặc lỗi rename. Sửa: `tokio::Mutex` bọc serialize+write+rename. |
| R2 | Nặng | lib.rs:123, settings_commands.rs:113 | Giữ `data.write()` trong lúc `Path::exists()` cho mọi mục → ổ mạng/UNC offline làm treo mọi IPC (UI trắng lúc mở). Sửa: kiểm tra ngoài lock trong `spawn_blocking`. |
| R3 | Vừa | item_commands.rs:394, group_commands.rs:80 | Xoá mục xoá luôn file icon `custom-*.png` → bấm Hoàn tác thì mất icon tuỳ chỉnh. |
| R4 | Vừa | settings_commands.rs:61 | `unregister_all()` trước khi đăng ký → phím mới bị app khác chiếm thì mất luôn phím cũ. |
| R5 | Vừa | item_commands.rs:187,317 | `ShellExecuteW` (runas) chặn worker tokio, thiếu CoInitialize. |
| R6 | Nhẹ | data_service.rs:168 | Không `sync_all` trước rename; không retry khi antivirus giữ file. |
| R7 | Nhẹ | item_commands.rs:502 | `reorder_items` không chặn id trùng → có thể nhân đôi/mất mục. |
| R8 | Nhẹ | icon_manager.rs:81 | `file_stem()` cắt tên thư mục có dấu chấm ("Node.js"→"Node"), URL thành "www.google". |
| R9 | Nhẹ | icon_manager.rs:121,294 | PNG ghi dở bị coi là hợp lệ mãi; `.url` đọc lossy UTF-8. |
| R10 | Nhẹ | data_service.rs:114 | Gán mục mồ côi về `grp-default` mà không đảm bảo nhóm này tồn tại. |

## Frontend (`src/`)
| # | Mức | Vị trí | Lỗi |
|---|---|---|---|
| F1 | Nặng | MenuViewer.tsx (effect `[searchTerm]`) | Tự chọn kết quả đầu dùng danh sách cũ (chậm 1 nhịp) → gõ rồi Enter có thể không mở gì. |
| F2 | Vừa | Grouping/GroupNavList.tsx:23 | Kéo mục thả vào nhóm ở sidebar không chạy (đọc `dataTransfer` nhưng thẻ dùng dnd-kit, không có `setData`). |
| F3 | Vừa | ItemManager/AddItemModal.tsx:65 | Tạo nhóm trước khi thêm mục; thêm lỗi rồi bấm lại → nhóm trùng tên. |
| F4 | Vừa | CreateGroupModal.tsx:24, GroupManagerModal.tsx:136-162 | Lỗi chỉ `console.error`, không báo người dùng. |
| F5 | Vừa | context/LauncherDataContext.tsx:24 | Nhiều lần refresh chồng nhau, kết quả cũ ghi đè mới. |
| F6 | Vừa | layouts/MainWindow.tsx:159 | Thả file từ Explorer khi đang mở modal vẫn thêm mục. |
| F7 | Nhẹ | Settings/SettingsModal.tsx:232 | "Luôn nổi trên cùng" lỗi vẫn báo bật, không rollback. |
| F8 | Nhẹ | SettingsModal.tsx:84 vs MainWindow.tsx:36 | Cờ phím tắt `null` bị hiểu khác nhau → công tắc bật nhưng phím không đăng ký. |
| F9 | Nhẹ | utils/background.ts:51 | IndexedDB abort (ảnh lớn) → nút "Đổi ảnh" kẹt. |
| F10 | Nhẹ | MenuViewer.tsx (keydown Enter) | Enter luôn mở mục đang chọn kể cả khi focus ở nút khác. |
| F11 | Nhẹ | AddItemModal.tsx:30 | `getAllGroups()` thiếu `.catch`. |
