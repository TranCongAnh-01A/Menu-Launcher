# Phát hành bản mới (tự cập nhật qua GitHub Releases)

Ứng dụng tự kiểm tra bản mới ở `latest.json` trong GitHub Releases. Mỗi bản phát hành phải được **ký** bằng khoá riêng của bạn; app xác minh bằng khoá công khai (pubkey) nằm trong `tauri.conf.json`.

## Làm một lần

1. Tạo cặp khoá (đặt mật khẩu tuỳ ý, có thể để trống):
   ```
   npx tauri signer generate -w ~/.tauri/menu-launcher.key
   ```
   Lệnh in ra pubkey và ghi 2 file: `menu-launcher.key` (riêng tư) và `menu-launcher.key.pub`. **Không bao giờ commit hay chia sẻ file `.key`**; hãy sao lưu nó — mất khoá thì người dùng cũ không cập nhật được nữa.
2. Thêm 2 secret trên GitHub (repo > Settings > Secrets and variables > Actions):
   - `TAURI_SIGNING_PRIVATE_KEY`: toàn bộ nội dung file `menu-launcher.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: mật khẩu đã đặt (để trống nếu không đặt)
3. Mở `src-tauri/tauri.conf.json`, thay `__THAY_BANG_PUBKEY__` bằng nội dung file `menu-launcher.key.pub`, rồi commit.

## Mỗi lần phát hành

1. Tăng version ở **3 nơi** cho giống nhau: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
2. Commit, rồi tạo tag và đẩy lên:
   ```
   git tag v1.1.1
   git push origin main --tags
   ```
3. GitHub Actions (`.github/workflows/release.yml`) tự build, ký, tạo Release và `latest.json`. Theo dõi ở tab Actions.
4. Người dùng đang dùng app sẽ thấy thông báo "Có phiên bản mới" sau khi mở app (hoặc bấm Cài đặt > Giới thiệu > Kiểm tra cập nhật).

## Build cục bộ

- `npm run build:app`: build không ký, không tạo file cập nhật (không cần khoá). Dùng để thử.
- `npm run build:release`: build đầy đủ có file cập nhật; cần đặt biến môi trường `TAURI_SIGNING_PRIVATE_KEY` (và `..._PASSWORD`) trước.

Lưu ý: khi pubkey vẫn là placeholder hoặc chưa có release, việc kiểm tra cập nhật chỉ thất bại im lặng (ghi log), app vẫn chạy bình thường.
