# INDEX — Bản đồ Tài liệu Dự án

> File này là **mục lục trung tâm**, giúp AI (và người mới) nắm nhanh toàn bộ cấu trúc tài liệu của dự án.
> ⚠️ File nằm trong danh sách ngoại lệ (G.2) — **luôn ghi đè/cập nhật trực tiếp**, không đính kèm ngày tháng.

**Cập nhật lần cuối: 2026-10-07 20:25

---

## 1. Tài liệu Cốt lõi (luôn phải đọc khi bootstrap)
| File | Mô tả | Link |
|---|---|---|
| Bối cảnh dự án | Mục tiêu, tech stack, ràng buộc nghiệp vụ | [./PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) |
| Rule cục bộ | Rule riêng, ưu tiên cao nhất | [./LOCAL_RULE.md](./LOCAL_RULE.md) |
| Onboarding | Tài liệu cho thành viên mới | [./ONBOARDING.md](./ONBOARDING.md) |

## 2. Rule Con theo Module (docs/local_instructions/rules/)
| File | Phạm vi áp dụng | Link |
|---|---|---|
| _(ví dụ)_ `auth_rule.md` | Quy tắc riêng cho module xác thực | [./local_instructions/rules/auth_rule.md](./local_instructions/rules/auth_rule.md) |

## 3. Tài liệu Kiểm toán / Báo cáo (có ngày tháng, không ghi đè)
| File | Ngày tạo | Ghi chú | Link |
|---|---|---|---|
| _(ví dụ)_ `[ten_du_an]_audit_20260712.md` | 2026-07-12 | Audit toàn diện lần đầu | [./ten_du_an_audit_20260712.md](./ten_du_an_audit_20260712.md) |

## 4. Cấu trúc Thư mục Tổng quan
> 💡 **Quy hoạch tài liệu:** Hệ thống thư mục này được thiết kế tương ứng với các **AI Triggers** (như `#plan`, `#explain`, `#audit`...) để AI tự động phân loại và lưu trữ file đúng vị trí.
```
docs/
├── audit/                  # Nơi lưu báo cáo kiểm toán tổng thể bảo mật/hiệu năng (Trigger: #audit)
│   └── TEMPLATE_audit_YYYYMMDD.md
├── explain/                # Tài liệu phân tích, giải thích chi tiết logic code (Trigger: #explain)
│   └── TEMPLATE_explain.md
├── import/                 # Chứa tài liệu ngoại vi (Word, PDF, ảnh...) được convert sang Markdown (Trigger: #docify / #import)
├── local_instructions/     # Tùy biến cấu hình và hành vi AI riêng cho dự án
│   ├── rules/              # Luật kỹ thuật con theo module/phạm vi (VD: auth_rule.md)
│   │   └── TEMPLATE_rule.md
│   ├── scripts/            # Các script tự động hóa/tiện ích riêng cho dự án (.js, .py)
│   │   ├── TEMPLATE_script.js
│   │   └── TEMPLATE_script.py
│   ├── skills/             # Thư viện kỹ năng (skills) lập trình riêng cho dự án
│   │   └── TEMPLATE_name-skill/
│   │       └── SKILL.md
│   └── workflows/          # Định nghĩa quy trình (workflows) hay slash command riêng
│   └── TEMPLATE_nameworkflow.md
├── log/                    # Nhật ký hoạt động hàng ngày (Trigger: #log)
│   ├── [log_20260818.md](./log/log_20260818.md) - Session 1 #L4-#L16
│   ├── [log_20260819.md](./log/log_20260819.md) - Session 22 #L813-#L845
│   ├── [log_20260820.md](./log/log_20260820.md) - Session 3 #L78-#L110
│   └── [log_20261007.md](./log/log_20261007.md) - Session 3 #L74-#L102
├── plan/                   # Kế hoạch dự án, phân bổ Phase và Task (Trigger: #plan)
│   ├── [Ke_Hoach_Desktop_Menu_Launcher_Tauri_v3.md](./plan/Ke_Hoach_Desktop_Menu_Launcher_Tauri_v3.md) - Kế hoạch & Báo cáo tiến độ v5
│   └── TEMPLATE_plan.md
├── review/                 # Báo cáo đánh giá Code Review nếu cần xuất file (Trigger: #review)
│   └── TEMPLATE_review.md
├── spec/                   # Đặc tả yêu cầu từ người dùng (Trigger: #spec)
│   └── TEMPLATE_spec.md
├── INDEX.md                # [CORE] Bản đồ điều hướng tài liệu - Nơi chứa mọi liên kết.
├── LOCAL_RULE.md           # [CORE] Quy tắc tối cao của dự án này (Ghi đè Global Rule).
├── ONBOARDING.md           # [CORE] Cẩm nang cho thành viên mới tham gia dự án.
├── PROJECT_CONTEXT.md      # [CORE] Bộ nhớ dài hạn: Bối cảnh, Tech Stack, Tiến độ (Trigger: #sync).
└── TEMPLATE_setup.md       # Mẫu file hướng dẫn chạy tính năng/dự án mới (Trigger: #readme).
```

## 5. Ghi chú
- Mỗi khi tạo file tài liệu mới có đính kèm ngày tháng (theo G.2), **bắt buộc** thêm dòng liên kết vào mục 3 ở trên.
- Nếu phát hiện mục lục này lỗi thời (thiếu module mới, sai tech stack...), hãy chạy `#sync` để cập nhật lại.

