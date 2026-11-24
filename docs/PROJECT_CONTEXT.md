# PROJECT CONTEXT — Bối cảnh Dự án

> ⚠️ File nằm trong danh sách ngoại lệ (G.2) — **luôn ghi đè/cập nhật trực tiếp**, không đính kèm ngày tháng.

**Cập nhật lần cuối:** 2026-10-07 20:25

---

## 1. Tổng quan Dự án
- **Tên dự án:** Desktop Menu Launcher (các tên dự kiến: DeskMenu, QuickDock, TidyMenu, Launcher Lite)
- **Mục tiêu chính:** Gom các icon, file, thư mục, ứng dụng thường dùng vào một menu duy nhất để dễ mở, dễ quản lý, giúp desktop gọn gàng hơn. Hoạt động mượt mà với hơn 200 mục.
- **Đối tượng người dùng:** Người dùng Windows 10/11 (64-bit) cần quản lý ứng dụng tiện lợi, có thể chia sẻ cho nhóm nhỏ.
- **Trạng thái hiện tại:** Đang phát triển (Hoàn thiện quản lý menu, kéo thả sắp xếp ứng dụng và chuyển nhóm).

## 2. Tech Stack
| Tầng | Công nghệ | Phiên bản | Ghi chú |
|---|---|---|---|
| Frontend | React + TypeScript + TailwindCSS | React 19, Tailwind v4 | UI ảo hóa với `@tanstack/react-virtual` để cuộn mượt danh sách lớn. Hot reload qua Vite. |
| Backend | Rust + Tauri | Tauri 2.x | Sử dụng crate `windows` để gọi Windows API chuẩn hóa (trích xuất icon). Cực kỳ tối ưu RAM (< 15MB khi chạy ngầm). |
| Database | JSON | N/A | Dữ liệu lưu trong `%AppData%\DesktopMenuLauncher\` (`menu_data.json`, `settings.json`, `icons/`). Hỗ trợ ghi atomic để chống hỏng file. |
| DevOps/Hạ tầng | Tauri Bundler | v2.x | Đóng gói thành file `.msi` hoặc `.exe` standalone. Chưa áp dụng ký số (Code Signing). |

## 3. Kiến trúc Tổng quan
- **Mô hình kiến trúc:** Client-Server cục bộ (React kết nối với Rust qua IPC - Tauri Commands). Bố cục giao diện Dashboard 2 cột (Sidebar bên trái và Content Area bên phải).
- **Sơ đồ luồng chính** *(khuyến khích dùng Mermaid)*:
```mermaid
flowchart LR
    A[React UI] <-->|Tauri Commands IPC| B[Rust Core]
    B --> C[Windows API (crate `windows`)]
    B --> D[File System (%AppData%)]
    C -->|Extract Icons| D
```

## 4. Ràng buộc Kỹ thuật & Nghiệp vụ
- **Ràng buộc kỹ thuật:** RAM Backend Rust < 15MB. UI phải dùng ảo hóa (Virtualization) cho danh sách > 200 mục. Phải gọi API suspend của WebView2 khi ẩn để giảm RAM. Ghi dữ liệu đồng thời cần có khóa Mutex/RwLock để tránh race condition. Global shortcut không được nuốt phím hệ thống khi đang cấu hình.
- **Ràng buộc nghiệp vụ:** Hỗ trợ chế độ Portable. Chưa ký số nên chấp nhận cảnh báo SmartScreen lúc cài đặt.
- **Các quy định đặc thù:** Không tự khởi động cùng Windows mặc định (bật/tắt trong cài đặt).

## 5. Quy ước Đặt tên & Cấu trúc Thư mục
```
project-root/
├── src/            # Mã nguồn Frontend (React, Vite, TailwindCSS)
├── src-tauri/      # Mã nguồn Backend (Rust, Tauri v2)
├── docs/           # Hệ thống tài liệu dự án
└── public/         # Tài nguyên tĩnh
```

## 6. Danh sách Module/Tính năng Chính
| Module | Mô tả | Trạng thái |
|---|---|---|
| Giao diện chính (Dashboard) | Layout 2 cột tối giản, Sidebar cố định (260px), phông chữ và bảng màu Warm Editorial. | ✅ Hoàn thành |
| Hệ thống thông báo (Toasts) | Toast bay nhẹ góc dưới phải và Confirm Modal tùy chỉnh thay thế dialog native. | ✅ Hoàn thành |
| Quản lý Menu (Danh sách) | Hiển thị ứng dụng, thêm hàng loạt file, kéo thả file tự động nhận dạng; kéo thả sắp xếp vị trí ứng dụng; chuyển nhóm qua Context Menu và kéo thả vào tab/header nhóm. | ✅ Hoàn thành |
| Quản lý Icon (Rust Core) | Trích xuất icon chất lượng cao 256x256 qua PrivateExtractIconsW. | ✅ Hoàn thành |
| Lưu trữ Dữ liệu (Rust Core) | Cơ chế đọc/ghi `menu_data.json` atomic, đảm bảo an toàn dữ liệu; hỗ trợ `reorder_items` và `move_item_to_group`. | ✅ Hoàn thành |
| Cài đặt & Phím tắt | Tùy chỉnh Global Shortcut (bất kỳ tổ hợp phím hoặc 1 phím), hỗ trợ Dropdown chọn nhanh. Khắc phục triệt để lỗi "nuốt phím" của Windows, khôi phục an toàn. | ✅ Hoàn thành |

## 7. Liên kết Liên quan
- Xem thêm tại [Bản đồ tài liệu](./INDEX.md)
- Rule cục bộ: [./LOCAL_RULE.md](./LOCAL_RULE.md)
