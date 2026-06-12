// api/analyze.js — Vercel Serverless Function
// Bát Cực Linh Số — Claude trả XML, server parse thành JSON

const CLAUDE_MODEL = 'claude-opus-4-6';

// ─────────────────────────────────────────────────────────────────
//  BẢNG TỪ TRƯỜNG
// ─────────────────────────────────────────────────────────────────
const TU_TRUONG_MAP = {
  '13':'Thiên Y','31':'Thiên Y','68':'Thiên Y','86':'Thiên Y',
  '49':'Thiên Y','94':'Thiên Y','27':'Thiên Y','72':'Thiên Y',
  '14':'Sinh Khí','41':'Sinh Khí','67':'Sinh Khí','76':'Sinh Khí',
  '39':'Sinh Khí','93':'Sinh Khí','28':'Sinh Khí','82':'Sinh Khí',
  '19':'Diên Niên','91':'Diên Niên','78':'Diên Niên','87':'Diên Niên',
  '34':'Diên Niên','43':'Diên Niên','26':'Diên Niên','62':'Diên Niên',
  '11':'Phụ Vị','22':'Phụ Vị','33':'Phụ Vị','44':'Phụ Vị',
  '55':'Phụ Vị','66':'Phụ Vị','77':'Phụ Vị','88':'Phụ Vị','99':'Phụ Vị',
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
  if (CAT_SET.has(name)) return 'cat';
  if (HUNG_SET.has(name)) return 'hung';
  return 'neutral';
}

// ─────────────────────────────────────────────────────────────────
//  TÁCH CẶP SỐ — xử lý số 5 và số 0
// ─────────────────────────────────────────────────────────────────
function tachCapSo(phone) {
  const digits = phone.replace(/\D/g, '');
  const caps = [];
  let i = 0;
  while (i < digits.length - 1) {
    const a = digits[i];
    const b = digits[i + 1];

    if (b === '5' && i + 2 < digits.length) {
      const c = digits[i + 2];
      const capThuong = a + b;
      const tt1 = TU_TRUONG_MAP[capThuong];
      if (tt1) caps.push({ cap: capThuong, tu_truong: tt1, loai: loaiTuTruong(tt1) });
      else caps.push({ cap: capThuong, tu_truong: 'Biến Động (5)', loai: 'neutral', ghi_chu: 'Số 5' });
      const capAn5 = a + c;
      const tt2 = TU_TRUONG_MAP[capAn5];
      if (tt2) caps.push({ cap: capAn5, tu_truong: tt2, loai: loaiTuTruong(tt2), ghi_chu: 'Qua số 5' });
      i++;
      continue;
    }

    const cap = a + b;
    if (a === '0' || b === '0') {
      const tt = TU_TRUONG_MAP[cap];
      if (tt) caps.push({ cap, tu_truong: tt, loai: loaiTuTruong(tt), ghi_chu: 'Ẩn (0)' });
      else caps.push({ cap, tu_truong: 'Ẩn Tàng', loai: 'neutral', ghi_chu: 'Số 0' });
      i++;
      continue;
    }

    const tt = TU_TRUONG_MAP[cap];
    if (tt) caps.push({ cap, tu_truong: tt, loai: loaiTuTruong(tt) });
    else caps.push({ cap, tu_truong: 'Trung Tính', loai: 'neutral' });
    i++;
  }
  return caps;
}

function analyzeHungChain(caps) {
  const chains = [];
  let i = 0;
  while (i < caps.length) {
    if (caps[i].loai === 'hung') {
      let j = i;
      while (j < caps.length && caps[j].loai === 'hung') j++;
      if (j - i >= 2) chains.push(caps.slice(i, j).map(c => c.tu_truong).join(' + '));
      i = j;
    } else i++;
  }
  const tail = caps.slice(-3);
  const hungTail = tail.filter(c => c.loai === 'hung');
  return { chains, tailHung: hungTail.length >= 2, tailHungNames: hungTail.map(c => c.tu_truong) };
}

function tuTruongChuDao(caps) {
  const count = {};
  caps.forEach(c => {
    if (c.tu_truong && !['Trung Tính','Ẩn Tàng','Biến Động (5)'].includes(c.tu_truong))
      count[c.tu_truong] = (count[c.tu_truong] || 0) + 1;
  });
  caps.slice(-3).forEach(c => {
    if (c.tu_truong && !['Trung Tính','Ẩn Tàng','Biến Động (5)'].includes(c.tu_truong))
      count[c.tu_truong] = (count[c.tu_truong] || 0) + 0.5;
  });
  let max = 0, chu_dao = 'Trung Tính';
  for (const [k, v] of Object.entries(count)) { if (v > max) { max = v; chu_dao = k; } }
  return chu_dao;
}

function tinhDiem(caps, chains, tailHung, chuDao) {
  let score = 50;
  caps.forEach(c => {
    if (c.loai === 'cat') score += ['Thiên Y','Diên Niên'].includes(c.tu_truong) ? 12 : 10;
    else if (c.loai === 'hung') score -= ['Tuyệt Mệnh','Ngũ Quỷ'].includes(c.tu_truong) ? 10 : 8;
  });
  if (CAT_SET.has(chuDao)) score += 15;
  if (HUNG_SET.has(chuDao)) score -= 10;
  if (tailHung) score -= 10;
  chains.forEach(() => { score -= 15; });
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─────────────────────────────────────────────────────────────────
//  PARSE XML RESPONSE từ Claude
//  Claude trả về <tag>nội dung</tag> — không bao giờ bị lỗi quote
// ─────────────────────────────────────────────────────────────────
function getXmlTag(text, tag) {
  const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : '';
}

function parseClaudeXml(text) {
  const canh_bao_str = getXmlTag(text, 'canh_bao');
  const nen_doi_str  = getXmlTag(text, 'nen_doi_so');
  return {
    tom_tat: {
      mo_ta:       getXmlTag(text, 'mo_ta'),
      loi_khuyen:  getXmlTag(text, 'loi_khuyen'),
    },
    chi_tiet: {
      tai_van:   getXmlTag(text, 'tai_van'),
      tinh_cam:  getXmlTag(text, 'tinh_cam'),
      su_nghiep: getXmlTag(text, 'su_nghiep'),
      quy_nhan:  getXmlTag(text, 'quy_nhan'),
    },
    so5_phan_tich: getXmlTag(text, 'so5_phan_tich'),
    so0_phan_tich: getXmlTag(text, 'so0_phan_tich'),
    suc_khoe:      getXmlTag(text, 'suc_khoe'),
    canh_bao: {
      co:        canh_bao_str === 'true',
      noi_dung:  getXmlTag(text, 'canh_bao_noi_dung'),
      hoa_giai:  getXmlTag(text, 'hoa_giai'),
    },
    phu_hop_menh: getXmlTag(text, 'phu_hop_menh'),
    cta: {
      nen_doi_so: nen_doi_str === 'true',
      ly_do_doi:  getXmlTag(text, 'ly_do_doi'),
      moi_tu_van: getXmlTag(text, 'moi_tu_van'),
    },
  };
}

// ─────────────────────────────────────────────────────────────────
//  SYSTEM PROMPT — yêu cầu XML, không phải JSON
// ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Bạn là chuyên gia Bát Cực Linh Số. Phân tích số điện thoại theo thông tin được cung cấp.

8 TỪ TRƯỜNG:
- CÁT TINH: Thiên Y (13,31,68,86,49,94,27,72) = tài phú, tình cảm. Sinh Khí (14,41,67,76,39,93,28,82) = quý nhân, may mắn. Diên Niên (19,91,78,87,34,43,26,62) = sự nghiệp, lãnh đạo. Phụ Vị (số đôi) = ổn định.
- HUNG TINH: Tuyệt Mệnh (12,21,69,96,48,84,37,73) = phá tài. Ngũ Quỷ (18,81,97,79,36,63,42,24) = biến động. Lục Sát (16,61,47,74,38,83,29,92) = đào hoa. Họa Hại (17,71,89,98,46,64,23,32) = khẩu thiệt.
- Số 0: ẩn tàng, khuếch đại tiêu cực. Số 5: biến động, khuếch đại từ trường kề.
- Hung liên thủ (2+ hung liên tiếp): rất nguy hiểm. Hung kết đuôi: bất lợi dài hạn.
- Nữ có Diên Niên 19/91/78/87: năng lượng mạnh, cảnh báo nhẹ.

Trả lời bằng XML TAGS như sau. Viết thẳng nội dung vào tag, không thêm ký tự đặc biệt:

<mo_ta>Mô tả tổng quan năng lượng số (2-3 câu)</mo_ta>
<loi_khuyen>Lời khuyên ngắn gọn</loi_khuyen>
<tai_van>Phân tích tài vận (2-3 câu)</tai_van>
<tinh_cam>Phân tích tình cảm (2-3 câu)</tinh_cam>
<su_nghiep>Phân tích sự nghiệp (2-3 câu)</su_nghiep>
<quy_nhan>Phân tích quý nhân (1-2 câu)</quy_nhan>
<so5_phan_tich>Phân tích số 5 nếu có, để trống nếu không</so5_phan_tich>
<so0_phan_tich>Phân tích số 0 nếu có, để trống nếu không</so0_phan_tich>
<suc_khoe>Gợi ý chăm sóc sức khỏe (1-2 câu, không chẩn đoán)</suc_khoe>
<canh_bao>true hoặc false</canh_bao>
<canh_bao_noi_dung>Nội dung cảnh báo nếu có hung liên thủ hoặc tổ hợp nguy hiểm</canh_bao_noi_dung>
<hoa_giai>Cách cân bằng năng lượng</hoa_giai>
<phu_hop_menh>Đánh giá phù hợp với thông tin cá nhân (1-2 câu)</phu_hop_menh>
<nen_doi_so>true hoặc false (true nếu điểm thấp hoặc hung nguy hiểm)</nen_doi_so>
<ly_do_doi>Lý do nên đổi số nếu nen_doi_so là true</ly_do_doi>
<moi_tu_van>Lời mời tư vấn 1-1 (1 câu)</moi_tu_van>`;

// ─────────────────────────────────────────────────────────────────
//  GOOGLE SHEET
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
      })
    });
  } catch(e) { console.warn('Sheet save failed:', e.message); }
}

// ─────────────────────────────────────────────────────────────────
//  GỬI EMAIL (Resend)
// ─────────────────────────────────────────────────────────────────
async function sendResultEmail(formData, result, score) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !formData.email) return;
  const scoreColor = score >= 70 ? '#22c55e' : score >= 50 ? '#e8b84b' : '#ef4444';
  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a1628;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:28px;">
    <div style="font-size:40px;">🔮</div>
    <h1 style="color:#e8b84b;font-size:22px;margin:8px 0 4px;">CỐ VẤN LINH SỐ</h1>
    <p style="color:#8a9ab8;font-size:13px;margin:0;">Simdep24h · Phong Thuỷ Số</p>
  </div>
  <div style="background:#0f1e38;border:1px solid rgba(197,155,40,0.3);border-top:3px solid #c8960c;border-radius:12px;padding:28px 24px;margin-bottom:20px;text-align:center;">
    <p style="color:#8a9ab8;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0 0 6px;">Kết quả phân tích cho</p>
    <p style="color:#e8b84b;font-size:22px;font-weight:700;margin:0 0 4px;">${formData.fullname || ''}</p>
    <p style="color:#fff;font-size:22px;font-weight:600;letter-spacing:4px;margin:0 0 16px;">${formData.phone || ''}</p>
    <span style="display:inline-block;width:72px;height:72px;border-radius:50%;border:2px solid #c8960c;background:rgba(200,150,12,0.1);line-height:72px;text-align:center;color:${scoreColor};font-size:28px;font-weight:700;">${score}</span>
  </div>
  <div style="background:#0f1e38;border:1px solid rgba(197,155,40,0.2);border-radius:12px;padding:22px 24px;margin-bottom:16px;">
    <h2 style="color:#e8b84b;font-size:15px;margin:0 0 10px;">📊 Tổng quan</h2>
    <p style="color:#c8c0a8;font-size:14px;margin:0 0 10px;">${result.tom_tat?.mo_ta || ''}</p>
    ${result.tom_tat?.loi_khuyen ? `<p style="color:#e8b84b;font-size:13px;padding:10px 14px;background:rgba(200,150,12,0.1);border-left:2px solid #c8960c;border-radius:6px;margin:0;">💡 ${result.tom_tat.loi_khuyen}</p>` : ''}
  </div>
  <div style="background:linear-gradient(135deg,#0d1e3e,#0a1628);border:1px solid rgba(197,155,40,0.35);border-top:2px solid #c8960c;border-radius:12px;padding:24px;text-align:center;">
    <h2 style="color:#e8b84b;font-size:18px;margin:0 0 12px;">✦ Bước tiếp theo</h2>
    <p style="color:#8a9ab8;font-size:14px;margin:0 0 18px;">${result.cta?.moi_tu_van || ''}</p>
    <a href="https://simdep24h.com" style="display:inline-block;padding:11px 22px;background:linear-gradient(135deg,#c8960c,#f5d020);color:#0a1628;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;margin-right:8px;">📱 Xem SIM Phù Hợp</a>
    <a href="https://m.me/simdep24h" style="display:inline-block;padding:11px 22px;background:transparent;color:#e8b84b;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;border:1px solid rgba(197,155,40,0.4);">📅 Tư Vấn 1-1</a>
  </div>
  <p style="color:#4a5a78;font-size:11px;text-align:center;margin:20px 0 0;">Kết quả mang tính tham khảo. Simdep24h</p>
</div></body></html>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Cố Vấn Linh Số <noreply@simdep24h.com>',
        to: [formData.email],
        subject: `🔮 Kết quả phân tích Bát Cực Linh Số — ${formData.phone}`,
        html,
      }),
    });
  } catch(e) { console.warn('Email failed:', e.message); }
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

  // Phân tích server-side
  const caps    = tachCapSo(phone);
  const { chains, tailHung, tailHungNames } = analyzeHungChain(caps);
  const chuDao  = tuTruongChuDao(caps);
  const score   = tinhDiem(caps, chains, tailHung, chuDao);
  const digits  = phone.replace(/\D/g, '');
  const coSo5   = digits.includes('5');
  const coSo0   = digits.includes('0');

  const prompt = `Phân tích số điện thoại: ${phone}

Khách hàng: ${fullname || 'Không rõ'}, ${gender}, ${marital}, ${job}${job_detail ? ` (${job_detail})` : ''}, ngày sinh: ${dob || 'Không rõ'}, dùng SIM: ${simtime || 'Không rõ'}

Dữ liệu server đã tính:
- Từ trường chủ đạo: ${chuDao} (${CAT_SET.has(chuDao) ? 'Cát' : HUNG_SET.has(chuDao) ? 'Hung' : 'Trung tính'})
- Điểm: ${score}/100
- Hung liên thủ: ${chains.length ? chains.join('; ') : 'Không có'}
- Hung kết đuôi: ${tailHung ? 'CÓ (' + tailHungNames.join(', ') + ')' : 'Không'}
- Có số 5: ${coSo5 ? 'Có' : 'Không'}, Có số 0: ${coSo0 ? 'Có' : 'Không'}
- Các cặp số: ${caps.map(c => `${c.cap}=${c.tu_truong}`).join(', ')}

Hãy phân tích sâu và trả lời bằng XML tags như hướng dẫn.`;

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
        max_tokens: 2000,
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

    // Parse XML — không bao giờ lỗi dấu ngoặc kép
    const parsed = parseClaudeXml(rawText);

    // Ghép lại với dữ liệu server
    const result = {
      ...parsed,
      so_dien_thoai: phone,
      cac_cap_so:    caps,
      hung_lien_thu: chains,
      hung_ket_duoi: tailHung,
      tom_tat: {
        ...parsed.tom_tat,
        diem:             score,
        tu_truong_chu_dao: chuDao,
        loai_chu_dao:      CAT_SET.has(chuDao) ? 'cat' : HUNG_SET.has(chuDao) ? 'hung' : 'neutral',
      },
    };

    // Background tasks
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
