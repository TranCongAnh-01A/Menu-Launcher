# Desktop Menu Launcher

> Gom các icon, file, thư mục, ứng dụng thường dùng vào một menu duy nhất để dễ mở, dễ quản lý, giúp desktop gọn gàng hơn.

## Features

- **Tauri 2.x + React + TypeScript + TailwindCSS**
- **Hiển thị menu icon**: Hỗ trợ Grid/List view.
- **Quản lý danh sách & Nhóm**: Thêm, sửa, xóa, kéo thả item.
- **Tìm kiếm nhanh**: Fuzzy search với debouncing.
- **Tối ưu RAM**: Tiết kiệm bộ nhớ khi ẩn xuống System Tray (chạy ngầm).
- **Single Instance & Autostart**.

## Prerequisites

Make sure you have installed the prerequisites for your OS: [Tauri Prerequisites](https://tauri.app/start/prerequisites/)

## Installation & Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode:
   ```bash
   npm run tauri dev
   ```

## Project Structure

- `src-tauri/`: Backend Rust codebase, bao gồm core, platform API, ipc_commands.
- `src/`: Frontend React codebase, tổ chức theo Feature-Sliced Design.

---
*Based on the Tauri + React + Typescript template.*
