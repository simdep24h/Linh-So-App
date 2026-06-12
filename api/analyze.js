// api/analyze.js — Vercel Serverless Function
// Bát Cực Linh Số — full logic: số 5, số 0, hung liên thủ, hung kết đuôi, email, Google Sheet

const CLAUDE_MODEL = 'claude-opus-4-6';

// ─────────────────────────────────────────────────────────────────
//  SAFE JSON PARSER
//  Xử lý: newline thật trong string, smart quotes, ký tự lạ
// ─────────────────────────────────────────────────────────────────
function safeParseJSON(raw) {
  // Thử parse thẳng trước
  try { return JSON.parse(raw); } catch(_) {}

  // Làm sạch từng bước
  let s = raw;

  // 1. Thay smart quotes thành straight quotes
  s = s.replace(/[“”„‟″‶]/g, '"');
  s = s.replace(/[‘’‚‛′‵]/g, "'");

  // 2. Thay newline/tab/CR THẬT bên trong JSON string values thành space
  //    Cách: chỉ thay khi nằm bên trong cặp dấu " " (không escape)
  //    Dùng state machine đơn giản
  let result = '';
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && (i === 0 || s[i-1] !== '\\')) {
      inString = !inString;
      result += ch;
    } else if (inString && (ch === '\n' || ch === '\r' || ch === '\t')) {
      // Thay ký tự xuống dòng thật trong string thành space
      result += ' ';
    } else {
      result += ch;
    }
  }

  try { return JSON.parse(result); } catch(_) {}

  // 3. Fallback: strip mọi control chars
  s = result.replace(/[\x00-\x1F\x7F]/g, ' ');
  return JSON.parse(s);
}

// ─────────────────────────────────────────────────────────────────
//  BẢNG TỪ TRƯỜNG
// ─────────────────────────────────────────────────────────────────
const TU_TRUONG_MAP = {
  // Cát tinh
  '13':'Thiên Y','31':'Thiên Y','68':'Thiên Y','86':'Thiên Y',
  '49':'Thiên Y','94':'Thiên Y','27':'Thiên Y','72':'Thiên Y',
  '14':'Sinh Khí','41':'Sinh Khí','67':'Sinh Khí','76':'Sinh Khí',
  '39':'Sinh Khí','93':'Sinh Khí','28':'Sinh Khí','82':'Sinh Khí',
  '19':'Diên Niên','91':'Diên Niên','78':'Diên Niên','87':'Diên Niên',
  '34':'Diên Niên','43':'Diên Niên','26':'Diên Niên','62':'Diên Niên',
  '11':'Phụ Vị','22':'Phụ Vị','33':'Phụ Vị','44':'Phụ Vị',
  '55':'Phụ Vị','66':'Phụ Vị','77':'Phụ Vị','88':'Phụ Vị','99':'Phụ Vị',
  // Hung tinh
  '12':'Tuyệt Mệnh','21':'Tuyệt Mệnh','69':'Tuyệt Mệnh','96':'Tuyệt Mệnh',
  '48':'Tuyệt Mệnh','84':'Tuyệt Mệnh','37':'Tuyệt Mệnh','73':'Tuyệt Mệnh',
  '18':'Ngũ Quỷ','81':'Ngũ Quỷ','97':'Ngũ Quỷ','79':'Ngũ Quỷ',
  '36':'Ngũ Quỷ','63':'Ngũ Quỷ','42':'Ngũ Quỷ','24':'Ngũ Quỷ',
  '16':'Lục Sát','61':'Lục Sát','47':'Lục Sát','74':'Lục Sát',
  '38':'Lục Sát','83':'Lục Sát','29':'Lục Sát','92':'Lục Sát',
  '17':'Họa Hại','71':'Họa Hại','89':'Họa Hại','98':'Họa Hại',
  '46':'Họa Hại','64':'Họa Hại','23':'Họa Hại','32':'Họa Hại',
};

const CAT_SET  = new Set(['Thiên Y','Sinh Khí','Diên Niên','Phụ Vị']);
const HUNG_SET = new Set(['Tuyệt Mệnh','Ngũ Quỷ','Lục Sát','Họa Hại']);

function loaiTuTruong(name) {
  if (CAT_SET.has(name))  return 'cat';
  if (HUNG_SET.has(name)) return 'hung';
  return 'neutral';
}

// ─────────────────────────────────────────────────────────────────
//  TÁCH CẶP SỐ — xử lý số 5 và số 0
// ─────────────────────────────────────────────────────────────────
/*
  Quy tắc số 5: số 5 ẩn đi, số trước và số sau số 5 ghép thành 1 cặp mới.
  Quy tắc số 0: phân tích ẩn tàng — 0 làm mờ/khuếch đại từ trường liền kề.
    Trong tổ hợp 3 số có 0 (ví dụ X0Y): tra từ trường của XY, đánh dấu ghi_chu = 'Ẩn (0)'.
    Cặp chứa 0 không bị bỏ qua mà được phân tích riêng với ghi chú.
*/
function tachCapSo(phone) {
  const digits = phone.replace(/\D/g, '');
  const caps = [];
  let i = 0;
  while (i < digits.length - 1) {
    const a = digits[i];
    const b = digits[i + 1];

    // Nếu b === '5' và còn chữ số tiếp theo → a+c là cặp ẩn số 5
    if (b === '5' && i + 2 < digits.length) {
      const c = digits[i + 2];
      const capThuong = a + b; // cặp ab bình thường
      const capAn5   = a + c; // cặp xuyên số 5
      // Thêm cặp thường trước
      const tt1 = TU_TRUONG_MAP[capThuong];
      if (tt1) caps.push({ cap: capThuong, tu_truong: tt1, loai: loaiTuTruong(tt1) });
      else caps.push({ cap: capThuong, tu_truong: '5 (Biến Động)', loai: 'neutral', ghi_chu: 'Số 5' });
      // Thêm cặp ẩn số 5
      const tt2 = TU_TRUONG_MAP[capAn5];
      if (tt2) caps.push({ cap: capAn5, tu_truong: tt2, loai: loaiTuTruong(tt2), ghi_chu: 'Qua số 5' });
      i++;
      continue;
    }

    // Cặp có chứa số 0
    const cap = a + b;
    if (a === '0' || b === '0') {
      // Tìm chữ số không phải 0
      const nonZero1 = a !== '0' ? a : null;
      const nonZero2 = b !== '0' ? b : null;
      // Tra từ trường của cặp
      const tt = TU_TRUONG_MAP[cap];
      if (tt) {
        caps.push({ cap, tu_truong: tt, loai: loaiTuTruong(tt), ghi_chu: 'Ẩn (0)' });
      } else {
        caps.push({ cap, tu_truong: 'Ẩn Tàng', loai: 'neutral', ghi_chu: 'Số 0' });
      }
      i++;
      continue;
    }

    // Cặp bình thường
    const tt = TU_TRUONG_MAP[cap];
    if (tt) caps.push({ cap, tu_truong: tt, loai: loaiTuTruong(tt) });
    else caps.push({ cap, tu_truong: 'Trung Tính', loai: 'neutral' });
    i++;
  }
  return caps;
}

// ─────────────────────────────────────────────────────────────────
//  PHÂN TÍCH HUNG LIÊN THỦ & HUNG KẾT ĐUÔI
// ─────────────────────────────────────────────────────────────────
function analyzeHungChain(caps) {
  const chains = [];
  let i = 0;
  while (i < caps.length) {
    if (caps[i].loai === 'hung') {
      let j = i;
      while (j < caps.length && caps[j].loai === 'hung') j++;
      if (j - i >= 2) {
        chains.push(caps.slice(i, j).map(c => c.tu_truong).join(' + '));
      }
      i = j;
    } else i++;
  }

  // 3 cặp đuôi — hung kết đuôi
  const tail = caps.slice(-3);
  const hungTail = tail.filter(c => c.loai === 'hung');
  const tailHung = hungTail.length >= 2;

  return { chains, tailHung, tailHungNames: hungTail.map(c => c.tu_truong) };
}

// ─────────────────────────────────────────────────────────────────
//  TỪ TRƯỜNG CHỦ ĐẠO
// ─────────────────────────────────────────────────────────────────
function tuTruongChuDao(caps) {
  const count = {};
  caps.forEach(c => {
    if (c.tu_truong && c.tu_truong !== 'Trung Tính' && c.tu_truong !== 'Ẩn Tàng') {
      count[c.tu_truong] = (count[c.tu_truong] || 0) + 1;
    }
  });
  // Ưu tiên theo tần suất, bỏ phiếu cho 3 đuôi x1.5
  const tail3 = caps.slice(-3);
  tail3.forEach(c => {
    if (c.tu_truong && c.tu_truong !== 'Trung Tính') {
      count[c.tu_truong] = (count[c.tu_truong] || 0) + 0.5; // bonus đuôi
    }
  });
  let max = 0, chu_dao = 'Trung Tính';
  for (const [k, v] of Object.entries(count)) {
    if (v > max) { max = v; chu_dao = k; }
  }
  return chu_dao;
}

// ─────────────────────────────────────────────────────────────────
//  ĐIỂM SỐ
// ─────────────────────────────────────────────────────────────────
function tinhDiem(caps, chains, tailHung, chuDao) {
  let score = 50;
  caps.forEach(c => {
    if (c.loai === 'cat') {
      score += ['Thiên Y','Diên Niên'].includes(c.tu_truong) ? 12 : 10;
    } else if (c.loai === 'hung') {
      score -= ['Tuyệt Mệnh','Ngũ Quỷ'].includes(c.tu_truong) ? 10 : 8;
    }
  });
  if (CAT_SET.has(chuDao)) score += 15;
  if (HUNG_SET.has(chuDao)) score -= 10;
  if (tailHung) score -= 10;
  chains.forEach(() => { score -= 15; });
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─────────────────────────────────────────────────────────────────
//  SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Bạn là Cố Vấn Linh Số — chuyên gia phân tích năng lượng số điện thoại theo hệ thống Bát Cực Linh Số.

## 8 TỪ TRƯỜNG CHÍNH

CÁT TINH:
- THIÊN Y (13,31,68,86,49,94,27,72): Tài phú, tình cảm, quý nhân, hôn nhân
- SINH KHÍ (14,41,67,76,39,93,28,82): Vui vẻ, quý nhân, cơ hội bất ngờ, lạc quan
- DIÊN NIÊN (19,91,78,87,34,43,26,62): Sự nghiệp, lãnh đạo, ý chí, kiên cường. CHÚ Ý: Nữ có 19/91/78/87 → năng lượng mạnh, dễ khắc chồng
- PHỤ VỊ (11,22,33,44,55,66,77,88,99): Ổn định, bảo thủ, gặp cát thêm cát, gặp hung thêm hung

HUNG TINH:
- TUYỆT MỆNH (12,21,69,96,48,84,37,73): Cực đoan, phá tài, đầu tư rủi ro, kiện tụng
- NGŨ QUỶ (18,81,97,79,36,63,42,24): Biến động, tài đến nhanh đi nhanh, thức khuya
- LỤC SÁT (16,61,47,74,38,83,29,92): Đào hoa, do dự, tình cảm trắc trở
- HỌA HẠI (17,71,89,98,46,64,23,32): Khẩu thiệt thị phi, cãi vã, sức khỏe hầu họng

## QUY TẮC ĐẶC BIỆT

SỐ 5 (đã được server tách riêng):
- 5 khuếch đại từ trường đi kèm
- Cặp "qua số 5" (số trước + số sau số 5) là cặp ẩn năng lượng tiềm ẩn
- Tích cực: 5 sau cát tinh đuôi → tốt, duy trì năng lượng
- Tiêu cực: 5 kết đuôi → biến động, dễ mất phương hướng

SỐ 0 (đã được server đánh dấu "Ẩn (0)"):
- 0 ẩn tàng, làm mờ/khuếch đại từ trường tiêu cực
- 0 kết đuôi → "Bận rộn mà kết quả trống không"
- 0 trong hung tinh (102, 107, 106, 108...) → nguy hiểm gấp đôi
- Tuyệt Mệnh + 0 → năng lượng tiêu cực đạt đỉnh rồi mất hết

HUNG TINH LIÊN THỦ (server đã phát hiện, bạn phân tích sâu):
- Ngũ Quỷ + Tuyệt Mệnh hoặc ngược lại → dễ bệnh nặng, tai nạn
- Ngũ Quỷ + Lục Sát → hôn nhân biến hóa, ngoại tình
- Tuyệt Mệnh + Họa Hại → đầu tư thất bại, kiện tụng
- Họa Hại + Ngũ Quỷ → âm linh phá tài

HUNG TINH KẾT ĐUÔI (server đã phát hiện):
- Tuyệt Mệnh đuôi: không giữ tài, kiện tụng cuối đời
- Ngũ Quỷ đuôi: nỗ lực nhiều, kết quả không ổn định
- Lục Sát đuôi: tình cảm trắc trở kéo dài
- Họa Hại đuôi: thị phi, cãi vã mãn tính

CHẾ ƯỚC: Thiên Y→Tuyệt Mệnh, Sinh Khí→Họa Hại, Diên Niên→Lục Sát, Phụ Vị→Ngũ Quỷ đứng trước = hóa giải.

## PHONG CÁCH

Ấm áp, xây dựng. Hung tinh luôn có mặt tích cực để nói. Tông chuyên gia, không đọc số máy móc.
Sức khỏe: gợi ý chăm sóc, KHÔNG chẩn đoán.
Nếu điểm < 65 hoặc có hung liên thủ → đề xuất đổi số. Nếu ≥2 cảnh báo → đề xuất tư vấn 1-1.
Tất cả string trong JSON phải trên 1 dòng, KHÔNG xuống dòng.

## OUTPUT — chỉ JSON thuần, không markdown

{
  "so_dien_thoai": "string",
  "cac_cap_so": [{"cap":"12","tu_truong":"Tuyệt Mệnh","loai":"hung","ghi_chu":""}],
  "hung_lien_thu": ["Ngũ Quỷ + Tuyệt Mệnh"],
  "hung_ket_duoi": true,
  "tom_tat": {
    "diem": 72,
    "tu_truong_chu_dao": "Diên Niên",
    "loai_chu_dao": "cat",
    "mo_ta": "string",
    "loi_khuyen": "string"
  },
  "chi_tiet": {
    "tai_van": "string",
    "tinh_cam": "string",
    "su_nghiep": "string",
    "quy_nhan": "string"
  },
  "so5_phan_tich": "string",
  "so0_phan_tich": "string",
  "suc_khoe": "string",
  "canh_bao": {"co": false, "noi_dung": "", "hoa_giai": ""},
  "phu_hop_menh": "string",
  "cta": {"nen_doi_so": false, "ly_do_doi": "", "moi_tu_van": "string"}
}`;

// ─────────────────────────────────────────────────────────────────
//  GOOGLE SHEET — ghi dữ liệu qua Apps Script
//  Thay SHEET_SCRIPT_URL bằng URL web app Apps Script của bạn
// ─────────────────────────────────────────────────────────────────
const SHEET_SCRIPT_URL = process.env.SHEET_SCRIPT_URL || '';

async function saveToSheet(formData, result, score) {
  if (!SHEET_SCRIPT_URL) return;
  try {
    await fetch(SHEET_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp:     new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        ho_ten:        formData.fullname || '',
        so_dt:         formData.phone || '',
        email:         formData.email || '',
        ngay_sinh:     formData.dob || '',
        gioi_tinh:     formData.gender || '',
        hon_nhan:      formData.marital || '',
        nghe_nghiep:   formData.job || '',
        chi_tiet_cv:   formData.job_detail || '',
        thoi_gian_sim: formData.simtime || '',
        diem:          score,
        tu_truong:     result.tom_tat?.tu_truong_chu_dao || '',
        nen_doi:       result.cta?.nen_doi_so ? 'Có' : 'Không',
        canh_bao:      result.canh_bao?.co ? result.canh_bao.noi_dung : '',
        hung_lien_thu: (result.hung_lien_thu || []).join('; '),
        hung_ket_duoi: result.hung_ket_duoi ? 'Có' : 'Không',
      })
    });
  } catch(e) {
    console.warn('Sheet save failed:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
//  GỬI EMAIL TỰ ĐỘNG (qua Resend — cần env RESEND_API_KEY)
// ─────────────────────────────────────────────────────────────────
async function sendResultEmail(formData, result, score) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !formData.email) return;

  const chuDao = result.tom_tat?.tu_truong_chu_dao || '';
  const moTa   = result.tom_tat?.mo_ta || '';
  const loiKhuyen = result.tom_tat?.loi_khuyen || '';
  const cta    = result.cta || {};
  const canh   = result.canh_bao || {};

  const scoreColor = score >= 70 ? '#22c55e' : score >= 50 ? '#e8b84b' : '#ef4444';

  const html = `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a1628;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="font-size:40px;margin-bottom:8px;">🔮</div>
    <h1 style="color:#e8b84b;font-size:24px;margin:0;letter-spacing:2px;">CỐ VẤN LINH SỐ</h1>
    <p style="color:#8a9ab8;font-size:13px;margin:6px 0 0;">Simdep24h · Phong Thuỷ Số</p>
  </div>

  <div style="background:#0f1e38;border:1px solid rgba(197,155,40,0.3);border-top:3px solid #c8960c;border-radius:12px;padding:28px 24px;margin-bottom:20px;text-align:center;">
    <p style="color:#8a9ab8;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0 0 6px;">Kết quả phân tích cho</p>
    <p style="color:#e8b84b;font-size:22px;font-weight:700;margin:0 0 4px;">${formData.fullname || ''}</p>
    <p style="color:#ffffff;font-size:24px;font-weight:600;letter-spacing:4px;margin:0 0 16px;">${formData.phone || ''}</p>
    <div style="display:inline-block;width:80px;height:80px;border-radius:50%;border:2px solid #c8960c;background:rgba(200,150,12,0.1);text-align:center;line-height:80px;">
      <span style="color:${scoreColor};font-size:30px;font-weight:700;line-height:80px;">${score}</span>
    </div>
    <p style="color:#e8b84b;font-size:15px;margin:12px 0 0;">Từ trường chủ đạo: <strong>${chuDao}</strong></p>
  </div>

  <div style="background:#0f1e38;border:1px solid rgba(197,155,40,0.2);border-radius:12px;padding:22px 24px;margin-bottom:16px;">
    <h2 style="color:#e8b84b;font-size:15px;margin:0 0 10px;">📊 Tổng quan</h2>
    <p style="color:#c8c0a8;font-size:14px;margin:0 0 10px;">${moTa}</p>
    ${loiKhuyen ? `<p style="color:#e8b84b;font-size:13px;padding:10px 14px;background:rgba(200,150,12,0.1);border-left:2px solid #c8960c;border-radius:6px;margin:0;">💡 ${loiKhuyen}</p>` : ''}
  </div>

  ${canh.co ? `<div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);border-radius:12px;padding:22px 24px;margin-bottom:16px;">
    <h2 style="color:#ef4444;font-size:15px;margin:0 0 10px;">⚠️ Lưu ý năng lượng</h2>
    <p style="color:#c8c0a8;font-size:14px;margin:0;">${canh.noi_dung || ''}</p>
    ${canh.hoa_giai ? `<p style="color:#22c55e;font-size:13px;margin:10px 0 0;">✅ ${canh.hoa_giai}</p>` : ''}
  </div>` : ''}

  <div style="background:linear-gradient(135deg,#0d1e3e,#0a1628);border:1px solid rgba(197,155,40,0.35);border-top:2px solid #c8960c;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px;">
    <h2 style="color:#e8b84b;font-size:18px;margin:0 0 10px;">✦ Bước tiếp theo</h2>
    ${cta.nen_doi_so ? `<p style="color:#e8b84b;font-size:14px;margin:0 0 8px;"><strong>Gợi ý đổi số:</strong> ${cta.ly_do_doi || ''}</p>` : ''}
    <p style="color:#8a9ab8;font-size:14px;margin:0 0 18px;">${cta.moi_tu_van || ''}</p>
    <a href="https://simdep24h.com" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#c8960c,#f5d020);color:#0a1628;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;margin-right:10px;">📱 Xem SIM Phù Hợp</a>
    <a href="https://m.me/simdep24h" style="display:inline-block;padding:12px 24px;background:transparent;color:#e8b84b;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;border:1px solid rgba(197,155,40,0.4);">📅 Đặt Lịch Tư Vấn</a>
  </div>

  <p style="color:#4a5a78;font-size:11px;text-align:center;margin:0;">Kết quả mang tính tham khảo năng lượng học. Simdep24h · linh-so-app.vercel.app</p>
</div>
</body>
</html>`;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'Cố Vấn Linh Số <noreply@simdep24h.com>',
        to: [formData.email],
        subject: `🔮 Kết quả phân tích Bát Cực Linh Số — ${formData.phone}`,
        html,
      }),
    });
  } catch(e) {
    console.warn('Email send failed:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
//  HANDLER CHÍNH
// ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server chưa cấu hình API key' });

  const { fullname, phone, email, dob, gender, marital, job, job_detail, simtime } = req.body;
  if (!phone || !gender || !marital || !job) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
  }

  // Phân tích trước ở server
  const caps = tachCapSo(phone);
  const { chains, tailHung, tailHungNames } = analyzeHungChain(caps);
  const chuDao = tuTruongChuDao(caps);
  const score  = tinhDiem(caps, chains, tailHung, chuDao);

  // Có số 5 và số 0 trong chuỗi không?
  const digits = phone.replace(/\D/g, '');
  const coSo5  = digits.includes('5');
  const coSo0  = digits.includes('0');

  const prompt = `Phân tích số điện thoại: ${phone}

Thông tin khách hàng:
- Họ tên: ${fullname || 'Không rõ'}
- Email: ${email || 'Không cung cấp'}
- Ngày sinh: ${dob || 'Không rõ'}
- Giới tính: ${gender}
- Hôn nhân: ${marital}
- Nghề nghiệp: ${job}${job_detail ? ` (${job_detail})` : ''}
- Thời gian dùng SIM: ${simtime || 'Không rõ'}

Server đã phân tích sơ bộ:
- Cặp số: ${JSON.stringify(caps)}
- Từ trường chủ đạo: ${chuDao}
- Điểm năng lượng (server): ${score}/100
- Hung tinh liên thủ: ${chains.length ? chains.join('; ') : 'Không có'}
- Hung tinh kết đuôi: ${tailHung ? 'CÓ — ' + tailHungNames.join(', ') : 'Không'}
- Có số 5: ${coSo5 ? 'CÓ' : 'Không'}
- Có số 0: ${coSo0 ? 'CÓ' : 'Không'}

Hãy dùng thông tin trên để phân tích sâu theo hệ thống Bát Cực Linh Số. KHÔNG cần đếm lại cặp số. Trả về JSON đúng cấu trúc. KHÔNG markdown, KHÔNG xuống dòng trong string.`;

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
        max_tokens: 3500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errData.error?.message || `Claude API error ${response.status}`,
      });
    }

    const data    = await response.json();
    const rawText = data.content[0].text.trim();

    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Không parse được JSON từ Claude' });

    let result;
    try {
      result = safeParseJSON(match[0]);
    } catch(parseErr) {
      // Log raw để debug
      console.error('Raw Claude output (first 500):', match[0].slice(0, 500));
      return res.status(500).json({ error: 'JSON parse error: ' + parseErr.message });
    }

    // Ghi đè dữ liệu server vào result (để đảm bảo nhất quán)
    result.cac_cap_so   = caps;
    result.hung_lien_thu = chains;
    result.hung_ket_duoi = tailHung;
    if (!result.tom_tat) result.tom_tat = {};
    result.tom_tat.diem = score;

    // Background: lưu sheet + gửi email (không await để không block response)
    const formData = { fullname, phone, email, dob, gender, marital, job, job_detail, simtime };
    Promise.all([
      saveToSheet(formData, result, score),
      sendResultEmail(formData, result, score),
    ]).catch(e => console.warn('Background tasks error:', e));

    return res.status(200).json(result);

  } catch(err) {
    console.error('analyze error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server không xác định' });
  }
}
