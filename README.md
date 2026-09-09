# iamplastic — Starter (Version 1)

เว็บขายบรรจุภัณฑ์พลาสติก + food packaging  
มีสินค้าจริง 271 SKU · Toggle ปลีก/ส่ง (B2B) · เก็บตะกร้าใน browser (localStorage)

**Live-ready** — deploy บน Vercel ได้ทันที ไม่ต้อง build

---

## 🚀 Deploy (เลือก 1 วิธี)

### วิธี 1: Vercel (ง่ายสุด — ไม่ต้องใช้ Git ก็ได้)

1. เข้า https://vercel.com/new
2. เลื่อนหา **"Deploy without Git"** หรือ **"Try a template"** → **Import a project**
3. **ลาก folder `iamplastic-starter` ทั้งโฟลเดอร์** เข้าเว็บ Vercel
4. รอ ~30 วินาที
5. ได้ URL เช่น `iamplastic-starter-xxx.vercel.app` — เว็บ live แล้ว!

### วิธี 2: GitHub + Vercel (แนะนำ — auto-deploy ทุกครั้งที่แก้)

**A. Upload files ไปที่ GitHub:**

1. เปิด repo `iamplastic` บน GitHub
2. กด **"Add file"** → **"Upload files"**
3. **ลากไฟล์ทั้งหมด** ใน `iamplastic-starter/` (index.html + README.md) เข้าไป
4. Scroll ล่าง → กด **"Commit changes"**

**B. Connect Vercel:**

1. เข้า https://vercel.com/new
2. **Import Git Repository** → เลือก `iamplastic-shop/iamplastic`
3. Framework: **Other** (เพราะเป็น static HTML)
4. **Deploy** → รอ 30 วิ
5. ได้ URL `iamplastic.vercel.app` — เว็บ live!

---

## 🎨 ที่ทำมาแล้วในเว็บนี้

| ฟีเจอร์ | รายละเอียด |
|---|---|
| 🏠 **หน้าแรก** | Hero + 8 หมวด + Flash Deal + สินค้าแนะนำ |
| 🔍 **ค้นหา** | ค้นสินค้าจากชื่อได้ทันที |
| 📂 **หมวดสินค้า** | 7 หมวด (กล่องอาหาร, แก้ว, กระปุก, ช้อนส้อม, ถาด, ถุง, ชาม) |
| 🛍️ **หน้าสินค้า** | Gallery + variant + ตารางราคาส่ง 3 ขั้น |
| 🛒 **ตะกร้า** | เก็บใน localStorage · คูปอง NEW100 ลด ฿100 |
| 💳 **Checkout** | ที่อยู่ + Tax ID + ขนส่ง 3 แบบ + จ่าย 4 แบบ |
| ✅ **สั่งซื้อสำเร็จ** | QR PromptPay + Timeline + PO number จริง |
| 📋 **คำสั่งซื้อของฉัน** | List + ปุ่มอัพเดตสถานะจำลอง |
| 🚦 **สถานะจัดส่ง** | รอชำระ → ชำระแล้ว → กำลังจัด → จัดส่ง (มี tracking) → รับสินค้า |
| 🏭 **B2B/B2C toggle** | สลับราคาปลีก/ส่งทั้งเว็บได้ทันที |
| 🌗 **Dark mode** | อัตโนมัติตาม system |
| 📱 **Responsive** | Mobile: 2 คอลัมน์ / Desktop: 5 คอลัมน์ |

---

## 🔜 Version 2 (จะพัฒนาต่อ)

- [ ] เชื่อม **Google Sheet** เป็น DB (products + orders จริง)
- [ ] Admin panel — อัพเดตสถานะออเดอร์
- [ ] LINE notify — แจ้งเจ้าของร้านตอนมีออเดอร์
- [ ] QR PromptPay จริง (คำนวณจากบัญชี)
- [ ] อัพรูปสินค้าจริงเข้า Cloudinary
- [ ] Google Login สำหรับลูกค้า
- [ ] Shopee / Lazada sync (optional)

---

## ⚙️ แก้ไขข้อมูลสินค้า

ตอนนี้สินค้า 271 SKU ฝังอยู่ในไฟล์ `index.html` (search หา `const PRODUCTS =`)

**Version 2 จะย้ายไป Google Sheet** — ญาติจะแก้ราคา/สต็อกได้เองผ่าน Sheet โดยไม่ต้องแก้ code

## 📞 ติดต่อผู้พัฒนา

ถ้าติดปัญหา — ส่งข้อความมาที่ Claude Code session ต่อได้เลย

---

**Generated 2026-09-09** · v1.0 · 271 products
