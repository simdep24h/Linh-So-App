// api/analyze.js — Vercel Serverless Function
// Proxy request đến Claude API, ẩn key phía server

const CLAUDE_MODEL = 'claude-opus-4-6';

const SYSTEM_PROMPT = `Bạn là Cố Vấn Linh Số — chuyên gia phân tích năng lượng số điện thoại theo hệ thống Bát Cực Linh Số.

## BẢNG TRA CỨU TỪ TRƯỜNG

CÁT TINH (màu xanh lá):
- THIÊN Y: 13, 68, 94, 72, 31, 86, 49, 27 — Tiền tài, tình cảm, quý nhân
- SINH KHÍ: 14, 67, 93, 82, 41, 76, 39, 28 — Vui vẻ, quý nhân, cơ hội
- DIÊN NIÊN: 19, 87, 43, 26, 91, 78, 34, 62 — Sự nghiệp, lãnh đạo, bền vững
- PHỤ VỊ: 11, 99, 77, 44, 22, 88, 66, 33 — Ổn định, bình an

HUNG TINH (màu đỏ):
- TUYỆT MỆNH: 12, 69, 84, 73, 21, 96, 48, 37 — Đầu tư, mạo hiểm
- NGŨ QUỶ: 18, 97, 36, 24, 81, 79, 63, 42 — Trí tuệ, biến động
- LỤC SÁT: 16, 74, 38, 92, 61, 47, 83, 29 — Đào hoa, tình cảm
- HỌA HẠI: 17, 98, 64, 32, 71, 89, 46, 23 — Ăn nói, thị phi

Số 0: ẩn tàng, làm mờ từ trường liền kề. Số 5: biến động, trung gian.

## QUY TRÌNH PHÂN TÍCH

1. Tách số thành chuỗi cặp 2 chữ số bằng cửa sổ trượt (vị trí 1-2, 2-3, 3-4...)
2. Phân loại mỗi cặp vào đúng từ trường
3. Xác định từ trường chủ đạo (tần suất cao nhất + 3 số đuôi)
4. Tính điểm: mỗi cát tinh +10đ (Thiên Y/Diên Niên +12đ), mỗi hung tinh -8đ (Tuyệt Mệnh/Ngũ Quỷ -10đ), chủ đạo cát +15đ bonus, đuôi hung -10đ, combo nguy hiểm (Ngũ Quỷ+Tuyệt Mệnh hoặc Ngũ Quỷ+Lục Sát) -15đ. Min 0, max 100.
5. Phân tích 4 điểm: tài vận, tình cảm, sự nghiệp, quý nhân
6. Cảnh báo nếu có combo nguy hiểm

## NGUYÊN TẮC

- LUÔN viết tên từ trường đầy đủ: "Thiên Y", "Ngũ Quỷ"... KHÔNG viết tắt
- Tông ấm áp, xây dựng — hung tinh luôn có mặt tích cực
- Sức khỏe: chỉ gợi ý chăm sóc, KHÔNG chẩn đoán
- Nữ + đuôi 19/91: nhắc nhẹ về cân bằng gia đình; Nữ + đuôi 16/61: cảnh báo tình cảm
- CTA: nếu điểm < 65 hoặc có cảnh báo → gợi ý xem số khác; nếu có ≥2 cảnh báo → gợi ý tư vấn 1-1

## OUTPUT FORMAT

Trả về JSON hợp lệ, KHÔNG có markdown code block, KHÔNG có giải thích thêm. Đúng cấu trúc:

{
  "so_dien_thoai": "số đã phân tích",
  "cac_cap_so": [
    {"cap": "12", "tu_truong": "Tuyệt Mệnh", "loai": "hung"},
    {"cap": "23", "tu_truong": "Họa Hại", "loai": "hung"}
  ],
  "tom_tat": {
    "diem": 72,
    "tu_truong_chu_dao": "Diên Niên",
    "loai_chu_dao": "cat",
    "mo_ta": "Số điện thoại của bạn mang năng lượng...",
    "loi_khuyen": "Tận dụng sức mạnh lãnh đạo để..."
  },
  "chi_tiet": {
    "tai_van": "Tài vận của bạn...",
    "tinh_cam": "Trong tình cảm...",
    "su_nghiep": "Về sự nghiệp...",
    "quy_nhan": "Quý nhân và cơ hội..."
  },
  "suc_khoe": "Bạn nên chú ý chăm sóc...",
  "canh_bao": {
    "co": false,
    "noi_dung": "",
    "hoa_giai": ""
  },
  "phu_hop_menh": "Với mệnh của bạn...",
  "cta": {
    "nen_doi_so": false,
    "ly_do_doi": "",
    "moi_tu_van": "Để hiểu sâu hơn về vận mệnh cá nhân, bạn có thể đặt lịch tư vấn 1-1 cùng chuyên gia."
  }
}`;

export default async function handler(req, res) {
  // CORS headers — cho phép frontend gọi từ bất kỳ domain nào
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server chưa cấu hình API key' });
  }

  const { phone, gender, birth, birthtime, marital, job, job_detail } = req.body;

  if (!phone || !gender || !marital || !job) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
  }

  const birthStr = birth || 'Không rõ';
  const prompt = `Phân tích số điện thoại sau:

Số điện thoại: ${phone}
Giới tính: ${gender}
Ngày sinh: ${birthStr}${birthtime ? ` lúc ${birthtime}` : ''}
Tình trạng hôn nhân: ${marital}
Nghề nghiệp: ${job}${job_detail ? ` (${job_detail})` : ''}

Trả về JSON theo đúng cấu trúc đã quy định. KHÔNG bao gồm markdown, chỉ JSON thuần.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      return res.status(response.status).json({
        error: errData.error?.message || `Claude API error ${response.status}`,
      });
    }

    const data = await response.json();
    const rawText = data.content[0].text.trim();

    // Extract JSON (phòng trường hợp Claude wrap trong ```)
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(500).json({ error: 'Không parse được JSON từ Claude', raw: rawText.slice(0, 500) });
    }

    // Clean JSON string — loại bỏ ký tự control characters gây lỗi parse
    let jsonStr = match[0];
    // Thay thế newline/tab bên trong string values
    jsonStr = jsonStr.replace(/[
