# INTRO — Hướng dẫn Sử dụng Bộ Template `docs/`

> File này giải thích **từng file/thư mục trong `docs/` dùng để làm gì, khi nào AI/người dùng tạo ra bản thật từ template, và đặt tên ra sao.**
> Đọc file này 1 lần trước khi bắt đầu dùng bộ template — sau đó chỉ cần tra bảng bên dưới khi cần.

---

## 1. Nguyên tắc chung

Bộ template này chia file trong `docs/` thành **2 nhóm**, phân biệt bằng việc file có **ghi đè (overwrite)** được hay không:

| Nhóm | Đặc điểm | Cách xử lý |
|---|---|---|
| **A. File "sống" (ngoại lệ G.2)** | Không có ngày tháng trong tên, phản ánh **trạng thái hiện tại** của dự án | Luôn **ghi đè trực tiếp** lên bản cũ mỗi khi cập nhật. Không tạo file mới, không đính kèm ngày. |
| **B. File "lịch sử" (theo phiên/sự kiện)** | Có ngày tháng `YYYYMMDD` trong tên, ghi lại **một mốc thời điểm cụ thể** | **Không ghi đè** — mỗi lần tạo là một file mới. Nếu trùng ngày, thêm hậu tố `_HHMM` hoặc `_v2`. |

Mọi file khi được **tạo thật** (không còn là bản `TEMPLATE_...`) đều phải:
1. Đổi tên đúng theo quy ước nêu trong bảng ở mục 2.
2. Xoá phần hướng dẫn/ghi chú (blockquote `>` màu cảnh báo) ở đầu file — phần đó chỉ dành cho người đang *điền* template.
3. Nếu thuộc nhóm B → **cập nhật liên kết vào `docs/INDEX.md`** ngay sau khi tạo.

---

## 2. Bảng tra cứu từng file/thư mục

### 📌 Nhóm A — File sống, luôn ghi đè (không đính kèm ngày)

| File template | Dùng để làm gì | Khi nào cập nhật |
|---|---|---|
| `docs/INDEX.md` | Mục lục trung tâm, liệt kê toàn bộ tài liệu đang có trong dự án | Mỗi khi có file nhóm B mới được tạo |
| `docs/LOCAL_RULE.md` | Rule riêng của dự án này — ghi đè lên Global Rule khi có xung đột (trừ nguyên tắc an toàn/bảo mật) | Khi dự án có quy ước khác với chuẩn chung |
| `docs/ONBOARDING.md` | Tài liệu onboarding cho thành viên mới / AI khi bắt đầu phiên | Khi kiến trúc, tech stack, hoặc quy trình team thay đổi |
| `docs/PROJECT_CONTEXT.md` | Bối cảnh dự án: mục tiêu, tech stack, kiến trúc, ràng buộc nghiệp vụ | Khi mục tiêu/kiến trúc/tech stack dự án thay đổi |
| `docs/TEMPLATE_setup.md` | Hướng dẫn cài đặt & chạy dự án | Đổi tên thành `[ten_du_an_hoac_module]_setup.md`; cập nhật khi quy trình setup thay đổi |

### 🗂️ Nhóm B — File lịch sử, có ngày, không ghi đè

| Thư mục / Template | Dùng để làm gì | Đặt tên file thật |
|---|---|---|
| `docs/log/TEMPLATE_log_YYYYMMDD.md` | Nhật ký từng phiên làm việc trong ngày (mỗi phiên mới **nối thêm**, không tạo file mới trong cùng ngày) | `docs/log/log_YYYYMMDD.md` (VD: `log_20260714.md`) |
| `docs/plan/TEMPLATE_plan.md` | Kế hoạch triển khai dự án/tính năng: mục tiêu, kiến trúc, các phase | `docs/plan/[ten_du_an]_plan_YYYYMMDD.md` |
| `docs/spec/TEMPLATE_spec.md` | Người dùng **tự điền tay** trước khi nhờ AI build — mô tả ý định, phạm vi, ràng buộc kỹ thuật | `docs/spec/[ten_tinh_nang]_spec_YYYYMMDD.md` |
| `docs/review/TEMPLATE_review.md` | Báo cáo code review: lỗi Critical/Warning, vị trí, cách khắc phục | `docs/review/[ten_file]_review_YYYYMMDD.md` |
| `docs/audit/TEMPLATE_audit_YYYYMMDD.md` | Audit toàn diện dự án: kiến trúc, tech stack, ma trận lỗi tiềm ẩn | `docs/[ten_du_an]_audit_YYYYMMDD.md` |
| `docs/explain/TEMPLATE_explain.md` | Giải thích chi tiết một file/module: input, output, tư duy xử lý | `docs/explain/[ten_file]_explain_YYYYMMDD.md` |

### ⚙️ `docs/local_instructions/` — Tuỳ biến hành vi AI cho riêng dự án

Khác với nhóm A/B (ghi lại *nội dung* dự án), thư mục này dùng để **định nghĩa cách AI hành xử** trong đúng dự án này.

| Thư mục | Dùng để làm gì | Đặt tên khi tạo thật |
|---|---|---|
| `local_instructions/rules/TEMPLATE_rule.md` | Rule con áp dụng cho **một module cụ thể** (VD: chỉ áp dụng cho `src/features/auth/`), ưu tiên ngang với `LOCAL_RULE.md` | `[ten_module]_rule.md` (VD: `auth_rule.md`) |
| `local_instructions/scripts/TEMPLATE_script.js` / `.py` | Các script tự động hóa/tiện ích riêng cho dự án | `[ten_script].js` / `.py` |
| `local_instructions/workflows/TEMPLATE_nameworkflow.md` | Định nghĩa một **slash-command** riêng (VD: `/brainstorm`, `/plan`) — mô tả hành vi từng bước AI phải làm khi lệnh được gọi | `[ten_lenh_viet_thuong].md`, tên lệnh trong file đổi từ `/[tên_lệnh]` thành tên thật |
| `local_instructions/skills/TEMPLATE_skill/SKILL.md` | Định nghĩa một **skill** (năng lực chuyên biệt) mà AI được nạp khi làm việc trong dự án — tương tự các skill hệ thống (docx, pdf...) nhưng riêng cho domain của dự án | Đổi tên thư mục `TEMPLATE_skill` → tên skill thật (VD: `payment_gateway`), viết nội dung theo cấu trúc SKILL.md chuẩn (mô tả + khi nào trigger + hướng dẫn chi tiết) |

> 💡 Khác biệt cốt lõi: `rule` = **giới hạn/ràng buộc** AI phải tuân theo; `workflow` = **quy trình từng bước** khi gọi lệnh; `skill` = **kiến thức/năng lực chuyên sâu** AI tự nạp khi phù hợp ngữ cảnh.

### 📄 File ở gốc `template/`

| File | Dùng để làm gì |
|---|---|
| `CHECKPOINT_TEMPLATE.md` | **Không phải file AI tự tạo** — đây là *định dạng bắt buộc* AI phải in ra cuối câu trả lời (tự động hoặc khi gọi `#checkpoint`) để tóm tắt: đã làm gì, file nào bị ảnh hưởng, lệnh terminal đang chạy, bước tiếp theo. Người dùng copy khối này sang phiên mới để AI khôi phục ngữ cảnh nhanh. |
| `CODE_HEADER_TEMPLATE.md` | Mẫu 2 dòng comment bắt buộc ở đầu **mọi file code mới**: dòng 1 mô tả công dụng, dòng 2 là đường dẫn tương đối của file. Áp dụng cho Dart, JS/TS, Python... |
| `.env.example` | Mẫu biến môi trường — copy thành `.env` khi setup, không commit `.env` thật |
| `.gitignore` | Danh sách file/thư mục Git bỏ qua |

---

## 3. Quy trình gợi ý khi bắt đầu một dự án mới

1. **Copy** toàn bộ thư mục `template/` vào dự án, đổi tên thành `docs/` (hoặc merge nếu dự án đã có `docs/`).
2. Điền ngay 3 file cốt lõi trong nhóm A: `PROJECT_CONTEXT.md` → `LOCAL_RULE.md` → `ONBOARDING.md`.
3. Nếu có ràng buộc riêng theo module, tạo file trong `local_instructions/rules/`.
4. Nếu muốn có lệnh tắt riêng (VD: `/deploy`, `/review-pr`), tạo file trong `local_instructions/workflows/`.
5. Trong quá trình làm việc:
   - Đầu mỗi phiên: cập nhật/append vào `docs/log/log_YYYYMMDD.md`.
   - Trước khi build tính năng lớn: điền `docs/spec/..._spec_YYYYMMDD.md` rồi mới yêu cầu AI lên `docs/plan/..._plan_YYYYMMDD.md`.
   - Sau khi code xong: có thể yêu cầu AI tạo `docs/review/..._review_YYYYMMDD.md`.
6. Mỗi khi tạo file mới thuộc nhóm B → **nhớ thêm dòng vào `docs/INDEX.md`**, nếu không tài liệu sẽ bị "mồ côi", khó tra cứu lại sau này.

---

## 4. Quy ước đặt tên chung (ghi nhớ nhanh)

- Có ngày tháng → format `YYYYMMDD` (VD: `20260714`), trùng ngày thì thêm `_HHMM` hoặc `_v2`.
- Tên file/thư mục dùng snake_case, không dấu, không khoảng trắng.
- File còn tiền tố `TEMPLATE_` = **chưa dùng được**, chỉ là khuôn mẫu để copy và điền.
- Bất kỳ file nào có ghi chú "⚠️ File nằm trong danh sách ngoại lệ (G.2)" → **không đính kèm ngày, luôn ghi đè**. Không có ghi chú đó → tạo file mới theo ngày, không ghi đè.