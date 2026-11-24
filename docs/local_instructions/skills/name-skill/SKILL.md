<!-- 
🚨 TEMPLATE INSTRUCTION: 
- [HUMAN] Please copy this template, fill in the blanks, and DELETE this comment block before saving.
- [AGENT/MCP] You MUST remove this entire comment block and all placeholder tags (e.g., [Tên_lệnh]) when generating the final file. Do not output this instruction block to the user.
-->

> File này là `SKILL.md` nằm trong `docs/local_instructions/skills/[ten-skill]-skill/`, định nghĩa kỹ năng (Skill) cục bộ của dự án.
> Ưu tiên áp dụng: cao hơn Skill mặc định của MCP (xem A.1 của `rule.md`).
> Đặt tên thư mục cha gợi ý: `[ten-skill]-skill/` (VD: `payment-gateway-skill/`, `security-scan-skill/`).
---
name: [ten-skill-viet-thuong-co-gach-ngang] 
description: [Mô tả NGẮN GỌN nhưng "pushy": skill này làm gì + khi nào AI phải tự kích hoạt nó, kể cả khi người dùng không gọi tên rõ ràng. Đây là cơ chế trigger DUY NHẤT — mọi thông tin "khi nào dùng" phải nằm ở đây, không để trong nội dung bên dưới. Ví dụ mẫu: "Hướng dẫn tích hợp và xử lý webhook của cổng thanh toán X. Dùng skill này bất cứ khi nào người dùng nhắc đến thanh toán, checkout, refund, hoặc webhook liên quan đến X, kể cả khi họ không gõ đúng từ 'payment'."]
---

<!--
  ⚠️ HƯỚNG DẪN SỬ DỤNG TEMPLATE NÀY (xoá toàn bộ khối comment này khi tạo skill thật):

  1. Đổi tên thư mục cha `TEMPLATE_skill/` → tên skill thật, viết-thường-co-gach-ngang
     (VD: payment_gateway → nên đặt là `payment-gateway/`).
  2. Điền `name` trong frontmatter khớp với tên thư mục.
  3. Điền `description` thật kỹ — đây là phần DUY NHẤT quyết định AI có tự động
     nạp skill này hay không. Phải nêu rõ: skill làm gì + trigger khi nào.
     Viết hơi "đẩy mạnh" một chút để tránh tình trạng AI bỏ sót không dùng skill
     dù ngữ cảnh phù hợp.
  4. Giữ SKILL.md dưới ~500 dòng. Nếu nội dung dài hơn, tách phần chi tiết ra
     thư mục con `references/` và chỉ trỏ đường dẫn từ SKILL.md (xem mục 6).
  5. Xoá các mục không cần thiết, không để lại placeholder `[...]` chưa điền.
-->

# [Tên Skill Đầy Đủ]

[1-2 câu mô tả skill này giải quyết vấn đề gì, dành cho ai đọc trực tiếp file (khác với description ở frontmatter — description dành cho việc AI quyết định trigger, phần này dành cho AI đọc HIỂU cách làm sau khi đã trigger).]

---

## 1. Khi nào dùng skill này (When to use)

- [Tình huống cụ thể 1 — VD: khi người dùng yêu cầu tạo/sửa file liên quan đến X]
- [Tình huống cụ thể 2]
- [Tình huống KHÔNG nên dùng, nếu có nhầm lẫn dễ xảy ra — VD: không dùng skill này cho Y, dùng skill Z thay thế]

---

## 2. Yêu cầu / Phụ thuộc (Prerequisites — tuỳ chọn)

- [Thư viện, package, tool dòng lệnh cần có sẵn trong môi trường, nếu có]
- [Biến môi trường / API key cần thiết, nếu có — chỉ nêu TÊN biến, không đặt giá trị thật]

---

## 3. Quy trình thực hiện (Step-by-step)

Mô tả các bước AI phải làm theo đúng thứ tự, dùng câu mệnh lệnh (imperative), rõ ràng và có thể kiểm chứng được:

1. **[Bước 1]** — [Chi tiết hành động]
2. **[Bước 2]** — [Chi tiết hành động]
3. **[Bước 3]** — [Chi tiết hành động, nêu rõ điều kiện rẽ nhánh nếu có]

> 💡 Nếu quy trình có nhiều biến thể tuỳ theo ngữ cảnh (VD: theo từng framework, từng loại file), tách riêng từng biến thể ra file trong `references/` thay vì nhồi hết vào đây.

---

## 4. Định dạng đầu ra (Output format — nếu có)

[Nếu skill tạo ra nội dung/file theo khuôn mẫu cố định, mô tả rõ cấu trúc tại đây. VD:]

```markdown
# [Cấu trúc mẫu output nếu cần]
## ...
```

---

## 5. Ví dụ (Examples)

**Ví dụ 1:**
- Input: [tình huống/yêu cầu người dùng đưa ra]
- Output: [AI xử lý ra sao / kết quả kỳ vọng]

**Ví dụ 2:**
- Input: [...]
- Output: [...]

---

## 6. Tài nguyên đính kèm (Bundled resources — tuỳ chọn)

Nếu skill cần thêm file phụ trợ, tổ chức theo cấu trúc chuẩn:

```
[ten-skill]/
├── SKILL.md              (bắt buộc — file này)
├── scripts/               (tuỳ chọn — code thực thi cho tác vụ lặp lại/cần chính xác)
│   └── [ten_script].py
├── references/            (tuỳ chọn — tài liệu chi tiết, chỉ nạp khi cần)
│   └── [chu_de_chi_tiet].md
└── assets/                 (tuỳ chọn — file dùng trong output: template, icon, font...)
    └── [ten_file_mau]
```

- Chỉ tạo các thư mục con thật sự cần thiết — bỏ qua nếu skill đơn giản, không cần file phụ trợ.
- File trong `references/` nên có mục lục (table of contents) nếu dài hơn 300 dòng.

---

## 7. Lưu ý / Giới hạn (Notes & Limitations — tuỳ chọn)

- [Trường hợp biên (edge case) cần lưu ý]
- [Giới hạn đã biết của skill này]