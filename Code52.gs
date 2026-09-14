/**
 * iamplastic — Google Sheet Sync Backend
 * =========================================
 * ⚠️ อัปเดตโค้ด (กรณีที่เคย deploy ไปแล้ว) — ใช้วิธีนี้เท่านั้น
 *    Extensions → Apps Script → Ctrl+A ลบของเดิม → paste ตัวนี้ → Ctrl+S
 *    → Deploy ▾ → **Manage deployments** → ✏️ ดินสอ
 *    → Version: **New version** → Deploy
 *    URL เดิมจะเสิร์ฟโค้ดใหม่ทันที ไม่ต้องแก้อะไรในเว็บ
 *
 *    ❌ ห้ามใช้ "New deployment" ในการอัปเดต — มันสร้าง URL ใหม่คนละอัน
 *       ส่วน URL เดิมที่เว็บยิงไปจะยังเสิร์ฟโค้ดเก่าต่อไปเรื่อยๆ
 *
 * ตั้งค่าครั้งแรกเท่านั้น (ยังไม่เคยมี deployment):
 *    Deploy ▾ → New deployment → Type: Web app
 *    → Execute as: Me · Who has access: Anyone → Deploy
 *    → copy Web app URL ไปใส่ SHEET_API_URL ใน index.html
 *
 * รหัสยืนยัน (ใช้กันคนอื่นเขียนข้อมูลผ่าน URL) — เปลี่ยนได้ตามใจ
 */
// เวอร์ชันของไฟล์นี้ — เว็บใช้เช็คว่า deploy ตัวล่าสุดหรือยัง
const BACKEND_VERSION = 52;

const SECRET_TOKEN = "iamplastic_secret_2026";

// ==============================
// Notification config (แจ้งเจ้าของร้านตอนมีออเดอร์)
// ==============================
// ใส่ email ของเจ้าของร้าน — ปล่อยว่าง = ปิด email noti
const OWNER_EMAIL = "iamplastic2026@gmail.com";
// Optional: webhook URL (Discord / Telegram bot / Make.com / n8n) — ปล่อยว่าง = ไม่ยิง
// ตัวอย่าง Discord: "https://discord.com/api/webhooks/xxx/yyy"
const NOTIFY_WEBHOOK_URL = "";
// Stock: ตัด stock อัตโนมัติเมื่อมี order ใหม่ (true = ตัด, false = ไม่ตัด)
const AUTO_DECREMENT_STOCK = true;

// ==============================
// Sheet names (จะสร้างอัตโนมัติถ้ายังไม่มี)
// ==============================
const PRODUCTS_SHEET = "products";
const ORDERS_SHEET = "orders";           // คำสั่งซื้อจากลูกค้าออนไลน์ (PO-xxx)
const BILLS_CASH_SHEET = "bills_cash";   // บิลเงินสด (RC-xxx) — ไม่มี Tax ID
const BILLS_TAX_SHEET = "bills_tax";     // ใบกำกับภาษี (TX-xxx) — มี Tax ID
const CUSTOMERS_SHEET = "customers";

// Columns ของ products sheet (แถวแรกคือ header)
const PRODUCT_COLS = [
  "id", "cat", "name", "icon", "cover",
  "retail", "wholesale", "moq", "strike", "discount",
  "stock", "sizes", "desc", "sold", "rating",
  "mall", "weight", "dimensions", "shipEst",
  "options_json", "variants_json",          // ตัวเลือก 3 ชั้น + ราคา/SKU รายตัวเลือก
  "updated_at"
];

const ORDER_COLS = [
  "po", "status", "total", "subtotal", "discount",
  "shipping", "shipping_method", "carrier", "tracking",
  "payment", "tax_invoice", "customer_name", "customer_phone",
  "customer_address", "items_json", "created_at", "updated_at",
  "slip_image", "slip_date", "slip_time", "slip_amount", "slip_bank",
  "slip_note", "slip_status", "slip_uploaded_at",
  // ลูกค้าโอนหลายครั้ง / ส่งอีเมลยืนยันจากธนาคารแทนสลิป → เก็บได้ถึง 3 ใบ
  "slip_image2", "slip_image3", "slips_meta", "slip_kind",
  // ข้อมูลใบกำกับภาษีที่ลูกค้ากรอกตอน checkout
  "customer_email", "customer_company", "customer_tax_id", "customer_branch"
];

const CUSTOMER_COLS = [
  "name", "first_name", "last_name", "phone", "email",
  "pass_hash", "pass_salt",
  "address", "province", "zipcode",
  "is_corporate", "company", "tax_id", "branch",
  "company_phone", "company_email", "company_address",
  "addresses_json", "orders_count", "total_spent",
  "line_user_id", "picture_url",
  "registered_at", "updated_at"
];

// ==============================
// HTTP handlers
// ==============================
function doGet(e) {
  e = e || { parameter: {} };
  const action = ((e.parameter || {}).action || "ping").toLowerCase();
  try {
    if (action === "list") return json({ ok: true, products: listProducts() });
    if (action === "orders") return json({ ok: true, orders: listOrders() });
    if (action === "bills") return json({ ok: true, cash: listBills("cash"), tax: listBills("tax") });
    if (action === "billscash") return json({ ok: true, bills: listBills("cash") });
    if (action === "billstax") return json({ ok: true, bills: listBills("tax") });
    if (action === "customers") return json({ ok: true, customers: listCustomers() });
    if (action === "oembedtiktok") return json(oembedTiktok((e.parameter || {}).videoUrl));
    if (action === "promos") return json({ ok: true, banners: listPromos("banner"), tiktoks: listPromos("tiktok") });
    if (action === "settings") return json({ ok: true, settings: publicSettings() });
    // รวม 3 คำขอที่หน้าเว็บต้องใช้ตอนเปิดหน้า ให้เหลือ request เดียว
    // Apps Script คิวคำขอของ user เดียวกันทีละอัน — ยิง 3 ครั้ง = รอ 3 เท่า
    if (action === "bootstrap") return json({
      ok: true,
      version: BACKEND_VERSION,
      banners: listPromos("banner"),
      tiktoks: listPromos("tiktok"),
      settings: publicSettings(),
      reviews: listReviews(),
    });
    if (action === "ping") return json({ ok: true, message: "pong", version: BACKEND_VERSION, time: new Date().toISOString() });
    return json({ ok: false, error: "unknown action: " + action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  e = e || { postData: { contents: "{}" } };
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");
    if (body.token !== SECRET_TOKEN) return json({ ok: false, error: "unauthorized" });
    const action = (body.action || "").toLowerCase();
    if (action === "upsertproduct") return json({ ok: true, id: upsertProduct(body.data) });
    if (action === "deleteproduct") return json({ ok: true, deleted: deleteProduct(body.id) });
    if (action === "createorder") return json({ ok: true, po: createOrder(body.data) });
    if (action === "createbill") return json({ ok: true, bl: createBill(body.data) });
    if (action === "updateorderstatus") return json({ ok: true, po: updateOrderStatus(body.po, body.status, body.tracking) });
    if (action === "updatebillstatus") return json({ ok: true, bl: updateBillStatus(body.bl, body.status) });
    if (action === "bulkupsertproducts") return json({ ok: true, count: bulkUpsertProducts(body.data) });
    if (action === "patchproducts") return json(patchProducts(body.data));
    if (action === "productsdiag") return json(productsDiag());
    if (action === "repairproductcols") return json(repairProductColumns(body.apply === true));
    if (action === "repaircustomercols") return json(repairSheetHeaders(CUSTOMERS_SHEET, CUSTOMER_COLS, body.apply === true));
    if (action === "registercustomer") {
      const r = registerCustomer(body.data);
      // registerCustomer คืน object เมื่อปฏิเสธ (บัญชีซ้ำ) — ต้องส่งต่อให้ฝั่งเว็บรู้
      if (r && typeof r === "object") return json(r);
      return json({ ok: true, email: r });
    }
    if (action === "customerauth") return json({ ok: true, auth: getCustomerAuth(body.login) });
    if (action === "setcustomerpassword") return json(setCustomerPassword(body.login, body.passHash, body.passSalt));
    if (action === "requestreset") return json(requestPasswordReset(body.email, body.siteUrl));
    // ใช้ body.resetToken ไม่ใช่ body.token — เพราะ body.token คือรหัสยืนยันของระบบ
    // (รองรับ body.token ด้วยเผื่อหน้าเว็บยังเป็นรุ่นเก่า แต่ต้องไม่ใช่ค่าเดียวกับรหัสยืนยัน)
    if (action === "verifyresettoken") return json(verifyResetToken(resetTokenOf(body)));
    if (action === "resetpassword") return json(resetPasswordWithToken(resetTokenOf(body), body.passHash, body.passSalt));
    if (action === "bulkupsertcustomers") return json({ ok: true, count: bulkUpsertCustomers(body.data) });
    if (action === "verifyslip") {
      // ถ้า client ไม่ส่ง key มา ให้ดึงจาก settings ฝั่ง server — key จะได้ไม่ต้องโผล่ในหน้าเว็บ
      const st = loadSettings();
      const k = body.slipokApiKey || st.slipokApiKey || "";
      const b = body.slipokBranchId || st.slipokBranchId || "";
      return json({ ok: true, result: verifySlipOK(body.slipBase64, body.expectedAmount, k, b) });
    }
    if (action === "listcoupons") return json({ ok: true, coupons: listCoupons() });
    if (action === "upsertcoupon") return json({ ok: true, code: upsertCoupon(body.data) });
    if (action === "deletecoupon") return json({ ok: true, deleted: deleteCoupon(body.code) });
    if (action === "addreview") return json({ ok: true, id: addReview(body.data) });
    if (action === "savepromos") return json({ ok: true, count: savePromos(body.banners||[], body.tiktoks||[]) });
    if (action === "savesettings") return json({ ok: true, count: saveSettings(body.settings||{}) });
    if (action === "settingsfull") return json({ ok: true, settings: loadSettings() });
    if (action === "selftest") return json(selfTest());
    if (action === "purgetestcustomers") return json({ ok: true, removed: purgeTestCustomers() });
    if (action === "getadmin") return json({ ok: true, admin: getAdminCreds() });
    if (action === "setadmin") return json(setAdminCreds(body.user, body.passHash));
    if (action === "listadminusers") return json({ ok: true, users: listAdminUsers() });
    if (action === "getadminuser") return json({ ok: true, user: getAdminUser(body.username) });
    if (action === "upsertadminuser") return json(upsertAdminUser(body.data));
    if (action === "deleteadminuser") return json(deleteAdminUser(body.username));
    if (action === "listreviews") return json({ ok: true, reviews: listReviews() });
    if (action === "uploadslip") return json({ ok: true, po: uploadSlip(body.po, body.slip, body.proofs) });
    if (action === "updateslipstatus") return json({ ok: true, po: updateSlipStatus(body.po, body.slipStatus) });
    return json({ ok: false, error: "unknown action: " + action });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ==============================
// BILLS (admin manual bills) - แยกจาก orders
// ==============================
const BILL_COLS = [
  "bl", "status", "total", "subtotal", "discount",
  "shipping", "shipping_method", "payment", "tax_invoice",
  "customer_name", "customer_phone", "customer_address",
  "customer_company", "customer_tax_id",
  "items_json", "note", "created_by", "created_at", "updated_at"
];

// เลือก sheet ตามประเภท: "cash" หรือ "tax"
function billSheetFor(type) {
  const name = String(type).toLowerCase() === "tax" ? BILLS_TAX_SHEET : BILLS_CASH_SHEET;
  return getOrCreateSheet(name, BILL_COLS);
}

// ประเภทจาก data: taxInvoice=true → tax, ไม่งั้น cash
function billTypeOf(data) {
  return (data && (data.taxInvoice === true || data.taxInvoice === "TRUE" || data.type === "tax")) ? "tax" : "cash";
}

function listBills(type) {
  const sh = billSheetFor(type);
  return rowsToObjects(sh, BILL_COLS).map(o => ({
    bl: String(o.bl || ""),
    type: String(type || "cash"),
    status: String(o.status || "paid"),
    total: Number(o.total || 0),
    subtotal: Number(o.subtotal || 0),
    discount: Number(o.discount || 0),
    shipping: Number(o.shipping || 0),
    shippingMethod: String(o.shipping_method || ""),
    payment: String(o.payment || ""),
    taxInvoice: o.tax_invoice === true || o.tax_invoice === "TRUE",
    customer: {
      name: String(o.customer_name || ""),
      phone: String(o.customer_phone || ""),
      address: String(o.customer_address || ""),
      company: String(o.customer_company || ""),
      taxId: String(o.customer_tax_id || ""),
    },
    items: o.items_json ? JSON.parse(o.items_json) : [],
    note: String(o.note || ""),
    createdBy: String(o.created_by || ""),
    createdAt: String(o.created_at || ""),
    updatedAt: String(o.updated_at || ""),
  }));
}

function createBill(data) {
  const type = billTypeOf(data);
  const sh = billSheetFor(type);
  const now = new Date().toISOString();
  const row = [
    data.bl || data.po, data.status || "paid",
    data.total || 0, data.subtotal || 0, data.discount || 0,
    data.shipping || 0, data.shippingMethod || "",
    data.payment || "cash", type === "tax",
    (data.customer || {}).name || "",
    (data.customer || {}).phone || "",
    (data.customer || {}).address || "",
    (data.customer || {}).company || "",
    (data.customer || {}).taxId || "",
    JSON.stringify(data.items || []),
    data.note || "",
    data.createdBy || "admin",
    data.createdAt || now, now,
  ];
  sh.appendRow(row);

  // ถ้าเป็นบิลจาก walk-in / manual (ไม่ได้มาจาก PO ที่ตัด stock ไปแล้ว) → ตัด stock
  // ถ้าเป็นบิลที่ออกจาก PO (mode='from-po') → stock ถูกตัดตอน createOrder ไปแล้ว ข้าม
  try {
    if (AUTO_DECREMENT_STOCK && data.mode !== "from-po") decrementStock(data.items || []);
  } catch (e) { Logger.log("stock err (bill): " + e); }

  return data.bl || data.po;
}

function updateBillStatus(bl, newStatus) {
  const now = new Date().toISOString();
  // ค้นทั้ง 2 tabs (bl มี prefix ต่างกันอยู่แล้ว: RC-/TX-)
  const sheets = [billSheetFor("cash"), billSheetFor("tax")];
  for (const sh of sheets) {
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(bl)) {
        sh.getRange(i + 1, 2).setValue(newStatus);
        sh.getRange(i + 1, BILL_COLS.length).setValue(now);
        return bl;
      }
    }
  }
  return null;
}

function uploadSlip(po, slip, proofs) {
  const sh = getOrCreateSheet(ORDERS_SHEET, ORDER_COLS);
  ensureHeaders(sh, ORDER_COLS);
  const headers = sheetHeaders(sh);
  const poCol = Math.max(0, headers.indexOf("po"));
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  const s = slip || {};
  // รูปทั้งหมดที่ลูกค้าส่งมา (โอนหลายครั้ง / เมลยืนยันจากธนาคาร) — เก็บได้ 3 ใบ
  const images = (Array.isArray(s.images) && s.images.length ? s.images : [s.image])
    .map(v => String(v || "").trim()).filter(Boolean).slice(0, 3);
  // meta เก็บรายละเอียดแต่ละครั้งแบบไม่มีรูป (รูปกินเนื้อที่ช่อง)
  const meta = (Array.isArray(proofs) ? proofs : [s]).map(p => ({
    kind: p.kind || "slip",
    date: p.date || "", time: p.time || "",
    amount: Number(p.amount || 0), bank: p.bank || "", note: p.note || "",
    uploadedAt: p.uploadedAt || now,
    imageCount: Number(p.imageCount || 0),
  }));
  // ถ้า client ไม่ได้ส่ง imageCount มา ให้ยกรูปทั้งหมดเป็นของครั้งล่าสุด
  if (meta.length && !meta.some(m => m.imageCount > 0)) {
    meta[meta.length - 1].imageCount = images.length;
  }

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][poCol]) === String(po)) {
      setByHeader(sh, i + 1, {
        slip_image:  images[0] || "",
        slip_image2: images[1] || "",
        slip_image3: images[2] || "",
        slips_meta:  JSON.stringify(meta),
        slip_kind:   s.kind || "slip",
        slip_date:   s.date || "",
        slip_time:   s.time || "",
        slip_amount: Number(s.amount || 0),
        slip_bank:   s.bank || "",
        slip_note:   s.note || "",
        slip_status: "pending_verify",
        slip_uploaded_at: s.uploadedAt || now,
        updated_at: now,
      });
      return po;
    }
  }
  return null;
}

function updateSlipStatus(po, slipStatus) {
  const sh = getOrCreateSheet(ORDERS_SHEET, ORDER_COLS);
  ensureHeaders(sh, ORDER_COLS);
  const headers = sheetHeaders(sh);
  const poCol = Math.max(0, headers.indexOf("po"));
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][poCol]) === String(po)) {
      const patch = { slip_status: slipStatus, updated_at: now };
      if (slipStatus === "verified") patch.status = "paid";
      setByHeader(sh, i + 1, patch);
      return po;
    }
  }
  return null;
}

function listCustomers() {
  const sh = getOrCreateSheet(CUSTOMERS_SHEET, CUSTOMER_COLS);
  // ลูกค้าที่ไม่มีชื่อ (สมัครผ่าน LINE / กรอกแต่เบอร์) ต้องไม่หายไป
  return rowsToObjects(sh, CUSTOMER_COLS, ["name","phone","email","line_user_id"]).map(o => ({
    name: String(o.name || ""),
    firstName: String(o.first_name || ""),
    lastName: String(o.last_name || ""),
    phone: String(o.phone || ""),
    email: String(o.email || ""),
    hasPassword: !!String(o.pass_hash || ""),   // ไม่ส่งแฮชออกไป บอกแค่ว่าตั้งรหัสแล้วหรือยัง
    address: String(o.address || ""),
    prov: String(o.province || ""),
    zip: String(o.zipcode || ""),
    isCorporate: o.is_corporate === true || o.is_corporate === "TRUE",
    company: String(o.company || ""),
    taxId: String(o.tax_id || ""),
    branch: String(o.branch || ""),
    companyPhone: String(o.company_phone || ""),
    companyEmail: String(o.company_email || ""),
    companyAddress: String(o.company_address || ""),
    addresses: o.addresses_json ? (function(){ try { return JSON.parse(o.addresses_json); } catch(e){ return []; } })() : [],
    ordersCount: Number(o.orders_count || 0),
    totalSpent: Number(o.total_spent || 0),
    lineUserId: String(o.line_user_id || ""),
    pictureUrl: String(o.picture_url || ""),
    registeredAt: String(o.registered_at || ""),
    updatedAt: String(o.updated_at || ""),
  }));
}

// Upsert customer (dedupe by phone หรือ email)
function registerCustomer(data) {
  const sh = getOrCreateSheet(CUSTOMERS_SHEET, CUSTOMER_COLS);
  ensureHeaders(sh, CUSTOMER_COLS);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0].map(h => String(h).trim());
  const colOf = n => headers.indexOf(n);
  const now = new Date().toISOString();

  // ค่าที่จะเขียน จับคู่ด้วย "ชื่อคอลัมน์" ไม่ใช่ลำดับ
  // เดิมสร้าง array ตามลำดับใน CUSTOMER_COLS แล้ว setValues ทั้งแถว
  // พอ Sheet มีหัวตารางไม่ตรงกับโค้ด ข้อมูลจะเลื่อนไปลงผิดช่องทั้งแถว
  const vals = {
    name: data.name || "",
    first_name: data.firstName || "",
    last_name: data.lastName || "",
    phone: data.phone || "",
    email: data.email || "",
    pass_hash: data.passHash || "",
    pass_salt: data.passSalt || "",
    address: data.address || "",
    province: data.prov || "",
    zipcode: data.zip || "",
    is_corporate: !!data.isCorporate,
    company: data.company || "",
    tax_id: data.taxId || "",
    branch: data.branch || "",
    company_phone: data.companyPhone || "",
    company_email: data.companyEmail || "",
    company_address: data.companyAddress || "",
    addresses_json: JSON.stringify(data.addresses || []),
    orders_count: Number(data.ordersCount || 0),
    total_spent: Number(data.totalSpent || 0),
    line_user_id: data.lineUserId || "",
    picture_url: data.pictureUrl || "",
    registered_at: data.registeredAt || now,
    updated_at: now,
  };

  const phoneCol = colOf("phone"), emailCol = colOf("email"), lineCol = colOf("line_user_id");
  const hashCol = colOf("pass_hash"), saltCol = colOf("pass_salt");

  const writeRow = r => {
    Object.keys(vals).forEach(k => {
      const c = colOf(k);
      if (c < 0) return;
      // ไม่ส่งรหัสใหม่มา = แก้ข้อมูลอื่น ห้ามลบแฮชเดิมทิ้ง
      if ((k === "pass_hash" || k === "pass_salt") && !data.passHash) return;
      sh.getRange(r, c + 1).setValue(vals[k]);
    });
  };

  for (let i = 1; i < rows.length; i++) {
    const p = phoneCol >= 0 ? String(rows[i][phoneCol] || "") : "";
    const e = emailCol >= 0 ? String(rows[i][emailCol] || "") : "";
    const lu = lineCol >= 0 ? String(rows[i][lineCol] || "") : "";
    const byLine = !!(data.lineUserId && lu === data.lineUserId);
    if (byLine || (data.phone && p === data.phone) || (data.email && e === data.email)) {
      // บัญชีนี้มีรหัสผ่านอยู่แล้ว แต่มีคนมา "สมัครใหม่" ด้วยอีเมล/เบอร์เดียวกัน
      // ถ้าปล่อยให้เขียนทับ = ใครก็ยึดบัญชีคนอื่นได้ด้วยการรู้แค่อีเมล
      const hadHash = hashCol >= 0 && String(rows[i][hashCol] || "").trim();
      if (hadHash && data.passHash && !byLine) {
        return {
          ok: false,
          exists: true,
          error: "มีบัญชีนี้อยู่แล้ว — กรุณาเข้าสู่ระบบ หรือกด \"ลืมรหัสผ่าน\" เพื่อตั้งรหัสใหม่",
        };
      }
      writeRow(i + 1);
      return data.email || data.phone || data.lineUserId;
    }
  }

  sh.appendRow([]);                 // ต่อแถวใหม่แล้วค่อยเขียนทีละช่องตามชื่อ
  writeRow(sh.getLastRow());
  return data.email || data.phone || data.lineUserId;
}

// ==============================
// รหัสผ่านลูกค้า + ลืมรหัสผ่าน
//
// เก็บเฉพาะ "ค่าแฮช" กับ "salt" ไม่เก็บรหัสจริง
// ฝั่งเว็บคำนวณ sha256(salt + รหัสผ่าน) แล้วส่งมาเทียบ
// ==============================
function _findCustomerRow(sh, login) {
  const key = String(login || "").trim().toLowerCase();
  if (!key) return -1;
  const rows = sh.getDataRange().getValues();
  const phoneCol = CUSTOMER_COLS.indexOf("phone");
  const emailCol = CUSTOMER_COLS.indexOf("email");
  for (let i = 1; i < rows.length; i++) {
    const p = String(rows[i][phoneCol] || "").trim().toLowerCase();
    const e = String(rows[i][emailCol] || "").trim().toLowerCase();
    if ((p && p === key) || (e && e === key)) return i;
  }
  return -1;
}

// ใช้ตอนล็อกอิน — ส่งแฮชกลับไปให้ฝั่งเว็บเทียบ
function getCustomerAuth(login) {
  const sh = getOrCreateSheet(CUSTOMERS_SHEET, CUSTOMER_COLS);
  const i = _findCustomerRow(sh, login);
  if (i < 0) return null;
  const rows = sh.getDataRange().getValues();
  const col = n => rows[i][CUSTOMER_COLS.indexOf(n)];
  return {
    found: true,
    name: String(col("name") || ""),
    firstName: String(col("first_name") || ""),
    lastName: String(col("last_name") || ""),
    phone: String(col("phone") || ""),
    email: String(col("email") || ""),
    address: String(col("address") || ""),
    prov: String(col("province") || ""),
    zip: String(col("zipcode") || ""),
    isCorporate: col("is_corporate") === true || col("is_corporate") === "TRUE",
    company: String(col("company") || ""),
    taxId: String(col("tax_id") || ""),
    addresses: (function () { try { return JSON.parse(col("addresses_json") || "[]"); } catch (e) { return []; } })(),
    passHash: String(col("pass_hash") || ""),
    passSalt: String(col("pass_salt") || ""),
  };
}

function setCustomerPassword(login, passHash, passSalt) {
  if (!passHash) return { ok: false, error: "ไม่มีรหัสผ่าน" };
  const sh = getOrCreateSheet(CUSTOMERS_SHEET, CUSTOMER_COLS);
  const i = _findCustomerRow(sh, login);
  if (i < 0) return { ok: false, error: "ไม่พบบัญชีนี้" };
  sh.getRange(i + 1, CUSTOMER_COLS.indexOf("pass_hash") + 1).setValue(passHash);
  sh.getRange(i + 1, CUSTOMER_COLS.indexOf("pass_salt") + 1).setValue(passSalt || "");
  sh.getRange(i + 1, CUSTOMER_COLS.indexOf("updated_at") + 1).setValue(new Date().toISOString());
  return { ok: true };
}

// ---------- ลืมรหัสผ่าน ----------
const RESET_SHEET = "reset_tokens";
const RESET_COLS = ["token", "email", "expires_at", "used", "created_at"];
const RESET_TTL_MIN = 60;   // ลิงก์ใช้ได้ 1 ชั่วโมง

function _newToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 40; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out + "-" + Date.now().toString(36);
}

function requestPasswordReset(email, siteUrl) {
  const sh = getOrCreateSheet(CUSTOMERS_SHEET, CUSTOMER_COLS);
  const i = _findCustomerRow(sh, email);

  // ไม่บอกว่ามีอีเมลนี้ในระบบไหม — กันคนไล่เดาว่าใครเป็นลูกค้าร้าน
  if (i < 0) return { ok: true, sent: true };

  const rows = sh.getDataRange().getValues();
  const realEmail = String(rows[i][CUSTOMER_COLS.indexOf("email")] || "").trim();
  if (!realEmail || realEmail.indexOf("@") < 0) return { ok: true, sent: true };

  const tsh = getOrCreateSheet(RESET_SHEET, RESET_COLS);
  const token = _newToken();
  const now = new Date();
  const exp = new Date(now.getTime() + RESET_TTL_MIN * 60 * 1000);
  tsh.appendRow([token, realEmail.toLowerCase(), exp.toISOString(), false, now.toISOString()]);

  // เก็บกวาดของเก่า เหลือ 200 แถวล่าสุดพอ
  const last = tsh.getLastRow();
  if (last > 201) tsh.deleteRows(2, last - 201);

  const base = String(siteUrl || "").replace(/[#\/]+$/, "") || "https://iamplastic.vercel.app";
  const link = base + "/#/reset/" + token;
  const shopName = (loadSettings().shopName) || "ร้านค้า";

  try {
    MailApp.sendEmail({
      to: realEmail,
      subject: "ตั้งรหัสผ่านใหม่ · " + shopName,
      htmlBody:
        '<div style="font-family:sans-serif;line-height:1.8;max-width:520px">' +
        '<h2 style="margin:0 0 12px">ตั้งรหัสผ่านใหม่</h2>' +
        '<p>มีการขอตั้งรหัสผ่านใหม่สำหรับบัญชีนี้ที่ <b>' + shopName + '</b></p>' +
        '<p style="margin:24px 0"><a href="' + link + '" ' +
        'style="background:#AB2739;color:#fff;padding:12px 26px;border-radius:6px;text-decoration:none;font-weight:700">ตั้งรหัสผ่านใหม่</a></p>' +
        '<p style="font-size:13px;color:#666">ลิงก์ใช้ได้ภายใน ' + RESET_TTL_MIN + ' นาที และใช้ได้ครั้งเดียว<br>' +
        'ถ้าไม่ได้เป็นคนขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ</p>' +
        '<p style="font-size:12px;color:#999;word-break:break-all">เปิดลิงก์ไม่ได้? คัดลอกไปวางในเบราว์เซอร์:<br>' + link + '</p>' +
        '</div>',
    });
  } catch (e) {
    Logger.log("reset mail err: " + e);
    return { ok: false, error: "ส่งอีเมลไม่สำเร็จ: " + e };
  }
  return { ok: true, sent: true };
}

function _findToken(tsh, token) {
  const rows = tsh.getDataRange().getValues();
  const key = String(token || "").trim();
  if (!key) return { row: -1 };
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) {
      return {
        row: i,
        email: String(rows[i][1] || ""),
        expires: String(rows[i][2] || ""),
        used: rows[i][3] === true || rows[i][3] === "TRUE",
      };
    }
  }
  return { row: -1 };
}

// ปิดบังอีเมลพอให้เจ้าตัวรู้ว่าบัญชีไหน แต่คนอื่นอ่านไม่ออก
// ต้องรองรับชื่อสั้นๆ ด้วย (a@b.com ห้ามโผล่เต็มๆ)
function maskEmail(e) {
  const s = String(e || "");
  const at = s.indexOf("@");
  if (at < 1) return "***";
  const local = s.substring(0, at);
  const domain = s.substring(at);
  if (local.length <= 2) return local.charAt(0) + "***" + domain;
  return local.charAt(0) + "***" + local.charAt(local.length - 1) + domain;
}

function resetTokenOf(body) {
  if (body.resetToken) return body.resetToken;
  return (body.token && body.token !== SECRET_TOKEN) ? body.token : "";
}

function verifyResetToken(token) {
  const tsh = getOrCreateSheet(RESET_SHEET, RESET_COLS);
  const t = _findToken(tsh, token);
  if (t.row < 0) return { ok: false, error: "ลิงก์ไม่ถูกต้อง" };
  if (t.used) return { ok: false, error: "ลิงก์นี้ถูกใช้ไปแล้ว — ขอลิงก์ใหม่อีกครั้ง" };
  if (new Date(t.expires) < new Date()) return { ok: false, error: "ลิงก์หมดอายุแล้ว — ขอลิงก์ใหม่อีกครั้ง" };
  return { ok: true, email: maskEmail(t.email) };
}

function resetPasswordWithToken(token, passHash, passSalt) {
  if (!passHash) return { ok: false, error: "ไม่มีรหัสผ่านใหม่" };
  const tsh = getOrCreateSheet(RESET_SHEET, RESET_COLS);
  const t = _findToken(tsh, token);
  if (t.row < 0) return { ok: false, error: "ลิงก์ไม่ถูกต้อง" };
  if (t.used) return { ok: false, error: "ลิงก์นี้ถูกใช้ไปแล้ว" };
  if (new Date(t.expires) < new Date()) return { ok: false, error: "ลิงก์หมดอายุแล้ว" };

  const res = setCustomerPassword(t.email, passHash, passSalt);
  if (!res.ok) return res;
  tsh.getRange(t.row + 1, 4).setValue(true);   // ใช้แล้ว ใช้ซ้ำไม่ได้
  return { ok: true, email: t.email };
}

function bulkUpsertCustomers(arr) {
  let n = 0;
  (arr || []).forEach(c => { registerCustomer(c); n++; });
  return n;
}

// =====================================================================
// 🔬 รันฟังก์ชันนี้ใน editor ได้เลย (ไม่ต้อง deploy)
//    เลือก checkAll ในเมนู dropdown ด้านบน → กด ▶ Run → ดูผลที่ Execution log
//    ใช้ดูว่าข้อมูลอยู่ใน Sheet จริงไหม และโค้ดอ่านได้ไหม
// =====================================================================
// =====================================================================
// SELF TEST — เขียน/อ่านจริง แต่ลงใน tab แยก "_selftest"
// เดิมทดสอบด้วยการเขียนลูกค้าปลอมลง tab customers ทำให้รายชื่อลูกค้าเปื้อน
// =====================================================================
const SELFTEST_SHEET = "_selftest";
const SELFTEST_COLS = ["id", "note", "created_at"];

function selfTest() {
  try {
    const sh = getOrCreateSheet(SELFTEST_SHEET, SELFTEST_COLS);
    const id = "T-" + Date.now();
    sh.appendRow([id, "ทดสอบการเขียน — ลบทิ้งได้", new Date().toISOString()]);

    // อ่านกลับเพื่อยืนยันว่าเขียนติดจริง
    const back = rowsToObjects(sh, SELFTEST_COLS).some(r => String(r.id) === id);

    // เก็บกวาด: เหลือไว้ 20 แถวล่าสุดพอ
    const last = sh.getLastRow();
    if (last > 21) sh.deleteRows(2, last - 21);

    return { ok: true, wrote: true, readBack: back, id: id, version: BACKEND_VERSION, sheet: SELFTEST_SHEET };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ลบแถวลูกค้าที่เกิดจากการทดสอบเวอร์ชันเก่า (ชื่อขึ้นต้นด้วย "[TEST ")
function purgeTestCustomers() {
  const sh = getOrCreateSheet(CUSTOMERS_SHEET, CUSTOMER_COLS);
  const values = sh.getDataRange().getValues();
  let removed = 0;
  // ลบจากล่างขึ้นบน เลขแถวจะได้ไม่เลื่อน
  for (let i = values.length - 1; i >= 1; i--) {
    const name = String(values[i][0] || "");
    const phone = String(values[i][3] || "");
    const email = String(values[i][4] || "");
    if (name.indexOf("[TEST ") === 0 || (phone === "0000000000" && /^test-\d+@example\.com$/.test(email))) {
      sh.deleteRow(i + 1);
      removed++;
    }
  }
  return removed;
}

function checkAll() {
  const L = [];
  L.push("=== Code.gs เวอร์ชันในไฟล์นี้: v" + BACKEND_VERSION + " ===");
  L.push("");

  const tabs = [
    ["products",   PRODUCTS_SHEET,    PRODUCT_COLS,  () => listProducts().length],
    ["orders",     ORDERS_SHEET,      ORDER_COLS,    () => listOrders().length],
    ["customers",  CUSTOMERS_SHEET,   CUSTOMER_COLS, () => listCustomers().length],
    ["bills_cash", BILLS_CASH_SHEET,  BILL_COLS,     () => listBills("cash").length],
    ["bills_tax",  BILLS_TAX_SHEET,   BILL_COLS,     () => listBills("tax").length],
    ["coupons",    COUPONS_SHEET,     COUPON_COLS,   () => listCoupons().length],
    ["promos",     PROMOS_SHEET,      PROMO_COLS,    () => listPromos("tiktok").length + listPromos("banner").length],
  ];

  L.push("ตาราง        แถวใน Sheet   โค้ดอ่านได้");
  L.push("-------------------------------------------");
  tabs.forEach(([label, name, cols, counter]) => {
    const sh = getOrCreateSheet(name, cols);
    const raw = Math.max(0, sh.getLastRow() - 1);
    let parsed = 0, err = "";
    try { parsed = counter(); } catch (e) { err = " ⚠ " + e; }
    const flag = (raw > 0 && parsed === 0) ? "  ❌ อ่านไม่ได้!" : (raw > 0 ? "  ✓" : "");
    L.push(pad(label, 13) + pad(String(raw), 14) + parsed + flag + err);
  });

  L.push("");
  const custSheet = getOrCreateSheet(CUSTOMERS_SHEET, CUSTOMER_COLS);
  const custRows = Math.max(0, custSheet.getLastRow() - 1);
  if (custRows === 0) {
    L.push("📭 tab customers ว่างเปล่า — ยังไม่มีข้อมูลถูกเขียนลงมาเลย");
    L.push("   แปลว่าฝั่งเว็บ POST registerCustomer ไม่สำเร็จ");
    L.push("   (ไม่ใช่ปัญหาการอ่าน)");
  } else {
    L.push("📬 tab customers มี " + custRows + " แถว — ตัวอย่าง 3 แถวแรก:");
    const vals = custSheet.getRange(2, 1, Math.min(3, custRows), 5).getValues();
    vals.forEach((r, i) => L.push("   " + (i+1) + ") name=" + r[0] + " | phone=" + r[3] + " | email=" + r[4]));
  }

  L.push("");
  L.push("=== ทดสอบเขียนจริง ===");
  try {
    const testEmail = "editor-test-" + Date.now() + "@example.com";
    registerCustomer({ name: "[TEST จาก editor]", phone: "0000000000", email: testEmail });
    const after = listCustomers();
    const found = after.some(c => c.email === testEmail);
    L.push(found ? "✅ เขียนแล้วอ่านกลับเจอ — โค้ดในไฟล์นี้ทำงานถูกต้อง 100%"
                 : "❌ เขียนได้แต่อ่านกลับไม่เจอ — rowsToObjects ยังมีปัญหา");
    L.push("   (ไปลบแถว [TEST จาก editor] ใน tab customers ทิ้งได้)");
  } catch (e) {
    L.push("❌ เขียนไม่ได้: " + e);
  }

  L.push("");
  L.push("👉 ถ้าผลข้างบนเป็น ✅ แต่เว็บยังไม่เห็นข้อมูล");
  L.push("   = URL /exec ยังเสิร์ฟ version เก่า ต้อง Deploy version ใหม่");

  const out = L.join("\n");
  Logger.log(out);
  return out;
}

function pad(s, n) { s = String(s); while (s.length < n) s += " "; return s; }

// =====================================================================
// 📍 สคริปต์นี้เขียนลง Google Sheet ไฟล์ไหน?
//    เลือก whichSheet → ▶ Run → เอา URL ที่ได้ไปเปิด เทียบกับไฟล์ที่คุณดูอยู่
// =====================================================================
function whichSheet() {
  const L = [];
  let ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    L.push("❌ สคริปต์นี้ไม่ได้ผูกกับ Spreadsheet ใดเลย");
    L.push("   (เป็น standalone script — ต้องสร้างใหม่จาก Sheet: Extensions → Apps Script)");
    const out = L.join("\n"); Logger.log(out); return out;
  }
  if (!ss) {
    L.push("❌ getActiveSpreadsheet() = null — สคริปต์ไม่ได้ผูกกับ Sheet");
    const out = L.join("\n"); Logger.log(out); return out;
  }

  L.push("=== สคริปต์นี้เขียนลงไฟล์นี้ ===");
  L.push("ชื่อไฟล์ : " + ss.getName());
  L.push("URL     : " + ss.getUrl());
  L.push("");
  L.push("👉 เปิด URL ข้างบน แล้วเทียบกับ Google Sheet ที่คุณเปิดดูอยู่");
  L.push("   ถ้าคนละไฟล์ = เจอต้นเหตุแล้ว");
  L.push("");

  const tabs = ss.getSheets();
  L.push("=== tab ทั้งหมดในไฟล์นี้ (" + tabs.length + " tab) ===");
  tabs.forEach(sh => {
    const rows = Math.max(0, sh.getLastRow() - 1);
    L.push("  • " + pad(sh.getName(), 16) + rows + " แถวข้อมูล");
  });

  L.push("");
  const has = ss.getSheetByName(CUSTOMERS_SHEET);
  L.push(has ? "✅ มี tab 'customers' อยู่ในไฟล์นี้ (" + Math.max(0, has.getLastRow()-1) + " แถว)"
             : "⚠️ ยังไม่มี tab 'customers' ในไฟล์นี้ — รัน checkAll() จะสร้างให้");

  const out = L.join("\n");
  Logger.log(out);
  return out;
}

// ดู URL ของทุก deployment ที่มี — เทียบกับ URL ที่ใส่ในเว็บ
function whichDeployments() {
  const id = ScriptApp.getScriptId();
  const msg = "Script ID: " + id +
    "\n\nไปดูรายการ deployment ที่: Deploy → Manage deployments" +
    "\nแต่ละอันจะมี Web app URL ของตัวเอง" +
    "\nURL ที่ใส่ในเว็บต้องตรงกับอันที่คุณเพิ่ง deploy version ใหม่";
  Logger.log(msg);
  return msg;
}

function testSetup() { return checkAll(); }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==============================
// Sheet helpers
// ==============================
// ชีตมีจำนวนคอลัมน์จำกัด (ชีตใหม่ได้ 26 คอลัมน์ = A–Z)
// ถ้าเขียนเลยขอบกริด getRange จะ error ทั้งคำสั่ง → ต้องขยายกริดก่อนเสมอ
function ensureGridWidth(sh, needCols) {
  const have = sh.getMaxColumns();
  if (needCols > have) sh.insertColumnsAfter(have, needCols - have);
  return sh;
}

function getOrCreateSheet(name, columns) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    ensureGridWidth(sh, columns.length);
    sh.getRange(1, 1, 1, columns.length).setValues([columns]);
    sh.getRange(1, 1, 1, columns.length).setFontWeight("bold").setBackground("#EE4D2D").setFontColor("#FFFFFF");
    sh.setFrozenRows(1);
  }
  return sh;
}

// keyCols = คอลัมน์ที่ใช้ตัดสินว่า "แถวนี้มีข้อมูลจริง"
// ถ้าไม่ส่งมา จะใช้คอลัมน์แรก
// สำคัญ: ต้องส่งได้หลายคอลัมน์ เพราะลูกค้าบางคนไม่มีชื่อ (สมัครผ่าน LINE / กรอกแต่เบอร์)
// ถ้าเช็คแค่ "name" แถวพวกนั้นจะถูกกรองทิ้ง = ลูกค้าหายไปทั้งที่อยู่ใน Sheet
// เติมหัวตารางที่ขาดให้ตารางที่สร้างไว้ตั้งแต่โค้ดรุ่นเก่า
// คืนค่าเป็นรายชื่อคอลัมน์ที่เพิ่งเพิ่มเข้าไป
function ensureHeaders(sh, columns) {
  const rows = sh.getDataRange().getValues();
  if (!rows.length) return [];
  let width = 0;
  rows.forEach(r => { if (r.length > width) width = r.length; });
  const headers = rows[0].map(h => String(h).trim());
  const missing = (columns || []).filter(c => headers.indexOf(c) < 0);
  if (!missing.length) return [];
  ensureGridWidth(sh, width + missing.length);
  sh.getRange(1, width + 1, 1, missing.length).setValues([missing]);
  sh.getRange(1, width + 1, 1, missing.length)
    .setFontWeight("bold").setBackground("#EE4D2D").setFontColor("#FFFFFF");
  return missing;
}

// อ่านหัวตารางจริงของชีต — เขียนค่าโดย "ชื่อคอลัมน์" เสมอ ไม่ใช่ตำแหน่ง
function sheetHeaders(sh) {
  const w = sh.getLastColumn();
  if (!w) return [];
  return sh.getRange(1, 1, 1, w).getValues()[0].map(h => String(h).trim());
}

function appendByHeader(sh, columns, obj) {
  ensureHeaders(sh, columns);
  const headers = sheetHeaders(sh);
  ensureGridWidth(sh, headers.length);
  sh.appendRow(headers.map(h => (Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : "")));
}

function setByHeader(sh, rowIndex, obj) {
  const headers = sheetHeaders(sh);
  if (!headers.length) return;
  const range = sh.getRange(rowIndex, 1, 1, headers.length);
  const row = range.getValues()[0];
  headers.forEach((h, i) => {
    if (Object.prototype.hasOwnProperty.call(obj, h)) row[i] = obj[h];
  });
  range.setValues([row]);
}

function rowsToObjects(sheet, columns, keyCols) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const keys = (keyCols && keyCols.length) ? keyCols : [(columns && columns[0]) || headers[0]];
  const notEmpty = v => v !== "" && v !== null && v !== undefined;
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  }).filter(o => keys.some(k => notEmpty(o[k])));
}

// ==============================
// PRODUCTS
// ==============================
function listProducts() {
  const sh = getOrCreateSheet(PRODUCTS_SHEET, PRODUCT_COLS);
  return rowsToObjects(sh, PRODUCT_COLS).map(p => ({
    id: String(p.id || ""),
    cat: String(p.cat || ""),
    name: String(p.name || ""),
    icon: String(p.icon || "📦"),
    cover: String(p.cover || ""),
    images: p.cover ? [String(p.cover)] : [],
    retail: Number(p.retail || 0),
    wholesale: Number(p.wholesale || 0),
    moq: Number(p.moq || 1),
    strike: Number(p.strike || 0),
    discount: Number(p.discount || 0),
    stock: Number(p.stock || 0),
    sizes: String(p.sizes || "").split(",").map(s => s.trim()).filter(Boolean),
    sizeOut: [],
    desc: String(p.desc || ""),
    sold: String(p.sold || "0+"),
    rating: Number(p.rating || 4.8),
    mall: p.mall === true || p.mall === "TRUE" || p.mall === 1,
    weight: Number(p.weight || 0),
    dimensions: String(p.dimensions || ""),
    shipEst: Number(p.shipEst || 55),
    optionGroups: safeJson(p.options_json, []),
    variants: safeJson(p.variants_json, []),
    tiers: [[Number(p.moq || 1), 999999, Number(p.wholesale || 0)]],
  }));
}

// JSON ในชีตอาจว่างหรือพัง — อย่าให้ทั้งร้านล่มเพราะช่องเดียว
function safeJson(raw, fallback) {
  const txt = String(raw === undefined || raw === null ? "" : raw).trim();
  if (!txt) return fallback;
  try {
    const v = JSON.parse(txt);
    return (v === null || v === undefined) ? fallback : v;
  } catch (e) {
    Logger.log("safeJson fail: " + e);
    return fallback;
  }
}

function upsertProduct(data) {
  const sh = getOrCreateSheet(PRODUCTS_SHEET, PRODUCT_COLS);
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  const rowData = PRODUCT_COLS.map(col => {
    if (col === "updated_at") return now;
    if (col === "sizes" && Array.isArray(data.sizes)) return data.sizes.join(", ");
    if (col === "options_json") return JSON.stringify(data.optionGroups || []);
    if (col === "variants_json") return JSON.stringify(data.variants || []);
    if (col === "mall") return !!data.mall;
    return data[col] !== undefined && data[col] !== null ? data[col] : "";
  });
  // Find existing row
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      sh.getRange(i + 1, 1, 1, PRODUCT_COLS.length).setValues([rowData]);
      return data.id;
    }
  }
  // Append new
  sh.appendRow(rowData);
  return data.id;
}

// แก้เฉพาะบางคอลัมน์ของสินค้าที่ระบุ — ไม่แตะคอลัมน์อื่นและไม่ลบแถวไหน
// ใช้ตอนเติมน้ำหนัก/ขนาดจากไฟล์ขนส่ง จะได้ไม่ไปทับราคา/สต็อกที่แก้ไว้
// ==============================
// ซ่อมหัวตาราง products
//
// Sheet ที่สร้างไว้ตั้งแต่โค้ดรุ่นเก่าจะไม่มีคอลัมน์ weight / dimensions / shipEst
// พอเขียนข้อมูลลงไปตามลำดับของโค้ด ค่าจึงเลื่อนไปลงทับ updated_at
// และล้นไปคอลัมน์ที่ไม่มีหัวตาราง — เว็บที่อ่านตามชื่อคอลัมน์เลยหาไม่เจอ
//
// apply=false → บอกว่าจะทำอะไร (ยังไม่แตะข้อมูล)
// apply=true  → ลงมือซ่อม
// ==============================
// ซ่อมหัวตารางแบบทั่วไป — ใช้กับตารางไหนก็ได้
function repairSheetHeaders(sheetName, columns, apply) {
  const sh = getOrCreateSheet(sheetName, columns);
  const rows = sh.getDataRange().getValues();
  if (!rows.length) return { ok: false, error: "ตารางว่าง" };
  const headers = rows[0].map(h => String(h).trim());
  const missing = columns.filter(c => headers.indexOf(c) < 0);
  const out = { ok: true, sheet: sheetName, applied: !!apply, headers: headers, missingColumns: missing };
  if (apply && missing.length) out.addedColumns = ensureHeaders(sh, columns);
  return out;
}

function repairProductColumns(apply) {
  const sh = getOrCreateSheet(PRODUCTS_SHEET, PRODUCT_COLS);
  const rows = sh.getDataRange().getValues();
  if (!rows.length) return { ok: false, error: "ตารางว่าง" };

  const headers = rows[0].map(h => String(h).trim());
  const missing = PRODUCT_COLS.filter(c => headers.indexOf(c) < 0);

  // คอลัมน์ที่มีข้อมูลแต่ไม่มีชื่อหัวตาราง = เศษที่เกิดจากการเขียนเลื่อนช่อง
  // ต้องกวาดตามแถวที่กว้างที่สุด ไม่ใช่ความกว้างของแถวหัวตาราง
  // (แถวข้อมูลอาจยาวกว่าหัวตารางอยู่ ถ้าเคยเขียนเลยขอบไป)
  let width = 0;
  rows.forEach(r => { if (r.length > width) width = r.length; });
  const orphans = [];
  for (let c = 0; c < width; c++) {
    if (headers[c]) continue;
    let hasData = false;
    for (let i = 1; i < rows.length && !hasData; i++) {
      if (rows[i][c] !== "" && rows[i][c] !== null) hasData = true;
    }
    if (hasData) orphans.push(c + 1);
  }

  // updated_at ที่กลายเป็นตัวเลข = โดนน้ำหนักเขียนทับ
  const uCol = headers.indexOf("updated_at");
  let updatedAtLooksWrong = false;
  if (uCol >= 0) {
    for (let i = 1; i < Math.min(rows.length, 6); i++) {
      const v = rows[i][uCol];
      if (v !== "" && v !== null && !isNaN(Number(v))) { updatedAtLooksWrong = true; break; }
    }
  }

  const plan = {
    ok: true,
    applied: !!apply,
    headers: headers,
    missingColumns: missing,
    orphanColumns: orphans,
    updatedAtOverwritten: updatedAtLooksWrong,
  };

  if (!apply) return plan;

  // 1) เติมหัวตารางที่ขาด ต่อท้ายคอลัมน์สุดท้าย
  if (missing.length) {
    const startCol = width + 1;
    sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
    sh.getRange(1, startCol, 1, missing.length)
      .setFontWeight("bold").setBackground("#EE4D2D").setFontColor("#FFFFFF");
    plan.addedColumns = missing;
  }

  // 2) ล้างเศษข้อมูลในคอลัมน์ที่ไม่มีหัวตาราง
  if (orphans.length && rows.length > 1) {
    orphans.forEach(c => sh.getRange(2, c, rows.length - 1, 1).clearContent());
    plan.clearedColumns = orphans;
  }

  // 3) ล้าง updated_at ที่โดนเขียนทับด้วยตัวเลข
  if (updatedAtLooksWrong && rows.length > 1) {
    sh.getRange(2, uCol + 1, rows.length - 1, 1).clearContent();
    plan.clearedUpdatedAt = true;
  }

  return plan;
}

// ส่องว่า Sheet เก็บอะไรไว้จริง — ใช้ตอนเว็บอ่านน้ำหนักไม่เจอทั้งที่ใน Sheet มี
function productsDiag() {
  const sh = getOrCreateSheet(PRODUCTS_SHEET, PRODUCT_COLS);
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return { ok: true, rows: 0, note: "ยังไม่มีสินค้าใน Sheet" };

  const headers = rows[0].map(h => String(h).trim());
  const wCol = headers.indexOf("weight");
  const idCol = headers.indexOf("id");

  let withWeight = 0;
  const samples = [];
  for (let i = 1; i < rows.length; i++) {
    const w = wCol >= 0 ? rows[i][wCol] : "";
    if (w !== "" && w !== null && Number(w) > 0) withWeight++;
    if (samples.length < 3) {
      samples.push({
        id: idCol >= 0 ? String(rows[i][idCol]) : "(ไม่มีคอลัมน์ id)",
        weightRaw: String(w),
        weightType: typeof w,
      });
    }
  }

  return {
    ok: true,
    rows: rows.length - 1,
    headers: headers,
    weightColumn: wCol >= 0 ? ("คอลัมน์ที่ " + (wCol + 1)) : "❌ ไม่พบหัวตารางชื่อ weight",
    headerMatchesCode: JSON.stringify(headers) === JSON.stringify(PRODUCT_COLS),
    codeExpects: PRODUCT_COLS,
    rowsWithWeight: withWeight,
    samples: samples,
    parsedSample: listProducts().slice(0, 3).map(p => ({ id: p.id, weight: p.weight })),
  };
}

function patchProducts(patches) {
  if (!patches || !patches.length) return { ok: false, error: "ไม่มีข้อมูลส่งมา" };
  const sh = getOrCreateSheet(PRODUCTS_SHEET, PRODUCT_COLS);
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return { ok: false, error: "ยังไม่มีสินค้าใน Sheet" };

  // หาตำแหน่งคอลัมน์จาก "หัวตารางจริง" ไม่ใช่ลำดับที่เขียนไว้ในโค้ด
  // เดิมใช้ PRODUCT_COLS.indexOf() ซึ่งถ้า Sheet เรียงคอลัมน์ไม่ตรงกับโค้ด
  // น้ำหนักจะถูกเขียนลงผิดช่อง — เห็นเลขใน Sheet แต่เว็บอ่านไม่เจอ
  const headers = rows[0].map(h => String(h).trim());
  const colOf = name => headers.indexOf(name) + 1;

  const idCol = colOf("id");
  if (idCol < 1) return { ok: false, error: "ไม่พบคอลัมน์ id ในหัวตาราง" };
  const updCol = colOf("updated_at");

  const targets = ["weight", "dimensions", "shipEst"];
  const missing = targets.filter(k => colOf(k) < 1);
  if (missing.length === targets.length) {
    return { ok: false, error: "ไม่พบคอลัมน์ " + missing.join("/") + " ในหัวตาราง — เช็คว่าแถวแรกสะกดตรงไหม" };
  }

  const rowOf = {};
  for (let i = 1; i < rows.length; i++) rowOf[String(rows[i][idCol - 1]).trim()] = i + 1;

  const now = new Date().toISOString();
  let updated = 0; const notFound = [];

  patches.forEach(p => {
    const r = rowOf[String(p.id).trim()];
    if (!r) { notFound.push(String(p.id)); return; }
    let touched = false;
    targets.forEach(key => {
      if (p[key] === undefined || p[key] === null || p[key] === "") return;
      const col = colOf(key);
      if (col < 1) return;
      sh.getRange(r, col).setValue(p[key]);
      touched = true;
    });
    if (touched) { if (updCol > 0) sh.getRange(r, updCol).setValue(now); updated++; }
  });

  return { ok: true, updated: updated, notFound: notFound.length,
           notFoundIds: notFound.slice(0, 10), skippedCols: missing };
}

function deleteProduct(id) {
  const sh = getOrCreateSheet(PRODUCTS_SHEET, PRODUCT_COLS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      sh.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function bulkUpsertProducts(products) {
  const sh = getOrCreateSheet(PRODUCTS_SHEET, PRODUCT_COLS);
  // Clear all data (keep header) — then re-write all
  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, PRODUCT_COLS.length).clearContent();
  const now = new Date().toISOString();
  const rows = products.map(p => PRODUCT_COLS.map(col => {
    if (col === "updated_at") return now;
    if (col === "sizes" && Array.isArray(p.sizes)) return p.sizes.join(", ");
    if (col === "mall") return !!p.mall;
    return p[col] !== undefined && p[col] !== null ? p[col] : "";
  }));
  if (rows.length) sh.getRange(2, 1, rows.length, PRODUCT_COLS.length).setValues(rows);
  return rows.length;
}

// ==============================
// ORDERS
// ==============================
function listOrders() {
  const sh = getOrCreateSheet(ORDERS_SHEET, ORDER_COLS);
  return rowsToObjects(sh, ORDER_COLS).map(o => ({
    po: String(o.po || ""),
    status: String(o.status || "pending_payment"),
    total: Number(o.total || 0),
    subtotal: Number(o.subtotal || 0),
    discount: Number(o.discount || 0),
    shipping: Number(o.shipping || 0),
    shippingMethod: String(o.shipping_method || ""),
    carrierName: String(o.carrier || ""),
    tracking: String(o.tracking || ""),
    payment: String(o.payment || ""),
    taxInvoice: o.tax_invoice === true || o.tax_invoice === "TRUE",
    customer: {
      name: String(o.customer_name || ""),
      phone: String(o.customer_phone || ""),
      address: String(o.customer_address || ""),
      email: String(o.customer_email || ""),
      company: String(o.customer_company || ""),
      taxId: String(o.customer_tax_id || ""),
      branch: String(o.customer_branch || ""),
    },
    items: safeJson(o.items_json, []),
    createdAt: String(o.created_at || ""),
    updatedAt: String(o.updated_at || ""),
    slip: orderSlip(o),
    slips: orderSlips(o),
    slipStatus: String(o.slip_status || ""),
  }));
}

// รูปหลักฐานทั้งหมดของออเดอร์ (สูงสุด 3 ใบ)
function orderSlipImages(o) {
  return [o.slip_image, o.slip_image2, o.slip_image3]
    .map(v => String(v || "").trim()).filter(Boolean);
}

function orderSlip(o) {
  const images = orderSlipImages(o);
  if (!images.length && !o.slip_amount) return null;
  return {
    image: images[0] || "",
    images: images,
    kind: String(o.slip_kind || "slip"),
    date: String(o.slip_date || ""),
    time: String(o.slip_time || ""),
    amount: Number(o.slip_amount || 0),
    bank: String(o.slip_bank || ""),
    note: String(o.slip_note || ""),
    uploadedAt: String(o.slip_uploaded_at || ""),
  };
}

// รายการแจ้งโอนแต่ละครั้ง (เก็บแยกจากรูป เพราะรูปกินที่)
function orderSlips(o) {
  const meta = safeJson(o.slips_meta, []);
  const images = orderSlipImages(o);
  if (Array.isArray(meta) && meta.length) {
    // แจกรูปให้แต่ละครั้งตามจำนวนที่บันทึกไว้
    let k = 0;
    return meta.map(m => {
      const n = Math.max(0, Number(m.imageCount || 0));
      const mine = images.slice(k, k + n);
      k += n;
      return {
        kind: String(m.kind || "slip"),
        date: String(m.date || ""),
        time: String(m.time || ""),
        amount: Number(m.amount || 0),
        bank: String(m.bank || ""),
        note: String(m.note || ""),
        uploadedAt: String(m.uploadedAt || ""),
        images: mine,
        image: mine[0] || "",
      };
    });
  }
  const one = orderSlip(o);
  return one ? [one] : [];
}

function createOrder(data) {
  const sh = getOrCreateSheet(ORDERS_SHEET, ORDER_COLS);
  const now = new Date().toISOString();
  const c = data.customer || {};
  // เขียนตาม "ชื่อคอลัมน์" — เพิ่มคอลัมน์ใหม่แล้วข้อมูลไม่เลื่อน
  appendByHeader(sh, ORDER_COLS, {
    po: data.po,
    status: data.status || "pending_payment",
    total: data.total || 0,
    subtotal: data.subtotal || 0,
    discount: data.discount || 0,
    shipping: data.shipping || 0,
    shipping_method: data.shippingMethod || "",
    carrier: data.carrierName || "",
    tracking: data.tracking || "",
    payment: data.payment || "",
    tax_invoice: !!data.taxInvoice,
    customer_name: c.name || "",
    customer_phone: c.phone || "",
    customer_address: c.address || "",
    customer_email: c.email || "",
    customer_company: c.company || "",
    customer_tax_id: c.taxId || "",
    customer_branch: c.branch || "",
    items_json: JSON.stringify(data.items || []),
    created_at: data.createdAt || now,
    updated_at: now,
  });

  // Auto-tasks (ห่อ try เพื่อไม่ให้ล้มการ save order)
  try { if (AUTO_DECREMENT_STOCK) decrementStock(data.items || []); } catch (e) { Logger.log("stock err: " + e); }
  try { notifyNewOrder(data); } catch (e) { Logger.log("notify err: " + e); }
  try { updateCustomerStats(data); } catch (e) { Logger.log("custStats err: " + e); }

  return data.po;
}

// ==============================
// Stock auto-decrement
// ==============================
function decrementStock(items) {
  if (!items || !items.length) return;
  const sh = getOrCreateSheet(PRODUCTS_SHEET, PRODUCT_COLS);
  const rows = sh.getDataRange().getValues();
  if (rows.length < 2) return;
  const idCol = 0; // "id"
  const stockCol = PRODUCT_COLS.indexOf("stock");
  const idMap = {};
  for (let i = 1; i < rows.length; i++) idMap[String(rows[i][idCol])] = i;
  items.forEach(it => {
    const rowIdx = idMap[String(it.pid)];
    if (!rowIdx) return;
    const cur = Number(rows[rowIdx][stockCol] || 0);
    const next = Math.max(0, cur - Number(it.qty || 0));
    sh.getRange(rowIdx + 1, stockCol + 1).setValue(next);
  });
}

// ==============================
// Notify — email + optional webhook
// ==============================
function notifyNewOrder(data) {
  const po = data.po || "";
  const total = Number(data.total || 0).toLocaleString("th-TH");
  const cust = data.customer || {};
  const items = (data.items || []).map(i => `- ${i.pid} × ${i.qty} @ ${i.priceEach||0}`).join("\n");
  const summary = `🛒 มี PO ใหม่: ${po}\n\nลูกค้า: ${cust.name || '-'}\nเบอร์: ${cust.phone || '-'}\nที่อยู่: ${cust.address || '-'}\n\nรายการ:\n${items}\n\nยอดรวม: ฿${total}\nจ่าย: ${data.payment || '-'}\n\nดู: iamplastic.vercel.app/#/admin/order/${po}`;

  if (OWNER_EMAIL) {
    try {
      MailApp.sendEmail({
        to: OWNER_EMAIL,
        subject: `[iamplastic] PO ใหม่ ${po} · ฿${total}`,
        body: summary,
      });
    } catch (e) { Logger.log("email err: " + e); }
  }

  if (NOTIFY_WEBHOOK_URL) {
    try {
      const payload = {
        type: "new_order",
        po, total: Number(data.total || 0),
        customer: cust,
        items: data.items || [],
        payment: data.payment || "",
        // Discord format (backward compat with webhook — ถ้าไม่ใช่ Discord ก็ยัง parse ได้)
        content: summary,
        text: summary, // Slack/Telegram-friendly key
      };
      UrlFetchApp.fetch(NOTIFY_WEBHOOK_URL, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
    } catch (e) { Logger.log("webhook err: " + e); }
  }
}

// ==============================
// Update customer stats (orders_count + total_spent) หลังมี order
// ==============================
function updateCustomerStats(data) {
  const cust = data.customer || {};
  if (!cust.phone && !cust.email) return;
  const sh = getOrCreateSheet(CUSTOMERS_SHEET, CUSTOMER_COLS);
  const rows = sh.getDataRange().getValues();
  const phoneCol = CUSTOMER_COLS.indexOf("phone");
  const emailCol = CUSTOMER_COLS.indexOf("email");
  const ordersCol = CUSTOMER_COLS.indexOf("orders_count");
  const spentCol = CUSTOMER_COLS.indexOf("total_spent");
  const updCol = CUSTOMER_COLS.indexOf("updated_at");
  const now = new Date().toISOString();
  for (let i = 1; i < rows.length; i++) {
    const p = String(rows[i][phoneCol] || "");
    const e = String(rows[i][emailCol] || "");
    if ((cust.phone && p === cust.phone) || (cust.email && e === cust.email)) {
      const curCount = Number(rows[i][ordersCol] || 0);
      const curSpent = Number(rows[i][spentCol] || 0);
      sh.getRange(i + 1, ordersCol + 1).setValue(curCount + 1);
      sh.getRange(i + 1, spentCol + 1).setValue(curSpent + Number(data.total || 0));
      sh.getRange(i + 1, updCol + 1).setValue(now);
      return;
    }
  }
}

function updateOrderStatus(po, newStatus, tracking) {
  const sh = getOrCreateSheet(ORDERS_SHEET, ORDER_COLS);
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(po)) {
      sh.getRange(i + 1, 2).setValue(newStatus);
      if (tracking) sh.getRange(i + 1, 9).setValue(tracking);
      sh.getRange(i + 1, ORDER_COLS.length).setValue(now);
      return po;
    }
  }
  return null;
}

// ==============================
// Slip OCR — SlipOK.com integration
// docs: https://slipok.com/docs
// ==============================
function verifySlipOK(slipBase64, expectedAmount, apiKey, branchId) {
  if (!apiKey || !branchId) return { ok: false, error: "ต้องตั้ง SlipOK API key + Branch ID" };
  try {
    const url = `https://api.slipok.com/api/line/apikey/${branchId}`;
    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: { "x-authorization": apiKey },
      payload: JSON.stringify({
        data: slipBase64,
        amount: Number(expectedAmount || 0),
        log: true,
      }),
      muteHttpExceptions: true,
    });
    const body = res.getContentText();
    const parsed = JSON.parse(body || "{}");
    return { ok: !!parsed.success, data: parsed.data || null, raw: parsed };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ==============================
// COUPONS
// ==============================
const COUPONS_SHEET = "coupons";
const COUPON_COLS = ["code", "kind", "value", "min_total", "max_uses", "used", "expires_at", "active", "note", "created_at", "updated_at"];

function listCoupons() {
  const sh = getOrCreateSheet(COUPONS_SHEET, COUPON_COLS);
  return rowsToObjects(sh, COUPON_COLS).map(o => ({
    code: String(o.code||""),
    kind: String(o.kind||"amount"), // amount | percent
    value: Number(o.value||0),
    minTotal: Number(o.min_total||0),
    maxUses: Number(o.max_uses||0),
    used: Number(o.used||0),
    expiresAt: String(o.expires_at||""),
    active: o.active === true || o.active === "TRUE",
    note: String(o.note||""),
  }));
}

function upsertCoupon(data) {
  const sh = getOrCreateSheet(COUPONS_SHEET, COUPON_COLS);
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  const row = [
    data.code, data.kind||"amount", Number(data.value||0),
    Number(data.minTotal||0), Number(data.maxUses||0), Number(data.used||0),
    data.expiresAt||"", !!data.active, data.note||"",
    data.createdAt||now, now,
  ];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.code)) {
      sh.getRange(i + 1, 1, 1, COUPON_COLS.length).setValues([row]);
      return data.code;
    }
  }
  sh.appendRow(row);
  return data.code;
}

function deleteCoupon(code) {
  const sh = getOrCreateSheet(COUPONS_SHEET, COUPON_COLS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(code)) { sh.deleteRow(i + 1); return true; }
  }
  return false;
}

// ==============================
// REVIEWS
// ==============================
const REVIEWS_SHEET = "reviews";
const REVIEW_COLS = ["id", "pid", "po", "customer_name", "customer_phone", "rating", "comment", "created_at"];

function listReviews() {
  const sh = getOrCreateSheet(REVIEWS_SHEET, REVIEW_COLS);
  return rowsToObjects(sh, REVIEW_COLS).map(o => ({
    id: String(o.id||""), pid: String(o.pid||""), po: String(o.po||""),
    customerName: String(o.customer_name||""), customerPhone: String(o.customer_phone||""),
    rating: Number(o.rating||5), comment: String(o.comment||""),
    createdAt: String(o.created_at||""),
  }));
}

function addReview(data) {
  const sh = getOrCreateSheet(REVIEWS_SHEET, REVIEW_COLS);
  const id = "RV-" + Date.now();
  sh.appendRow([
    id, data.pid||"", data.po||"",
    data.customerName||"", data.customerPhone||"",
    Number(data.rating||5), data.comment||"",
    new Date().toISOString(),
  ]);
  return id;
}

// ==============================
// SETTINGS — เก็บใน tab settings (key/value)
// ==============================
const SETTINGS_SHEET = "settings";
const SETTINGS_COLS = ["key", "value", "updated_at"];

// คีย์ที่ห้ามหลุดออกทาง doGet (ไม่มี token) — ใครก็เปิด URL ดูได้
const SECRET_SETTING_KEYS = ["slipokApiKey", "slipokBranchId"];

function publicSettings() {
  const all = loadSettings();
  SECRET_SETTING_KEYS.forEach(k => { delete all[k]; });
  return all;
}

function loadSettings() {
  const sh = getOrCreateSheet(SETTINGS_SHEET, SETTINGS_COLS);
  const rows = sh.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const k = String(rows[i][0] || "");
    if (k) out[k] = String(rows[i][1] || "");
  }
  return out;
}

function saveSettings(settings) {
  const sh = getOrCreateSheet(SETTINGS_SHEET, SETTINGS_COLS);
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  const rowIdx = {};
  for (let i = 1; i < rows.length; i++) {
    const k = String(rows[i][0] || "");
    if (k) rowIdx[k] = i + 1;
  }
  const keys = Object.keys(settings || {});
  keys.forEach(k => {
    const v = String(settings[k] == null ? "" : settings[k]);
    if (rowIdx[k]) {
      sh.getRange(rowIdx[k], 1, 1, 3).setValues([[k, v, now]]);
    } else {
      sh.appendRow([k, v, now]);
    }
  });
  return keys.length;
}

// ==============================
// ADMIN credentials — เก็บใน tab admin
// อ่าน/เขียนผ่าน POST เท่านั้น (ต้องมี token) — ไม่เปิดผ่าน doGet
// ==============================
const ADMIN_SHEET = "admin";
const ADMIN_COLS = ["key", "value", "updated_at"];

function getAdminCreds() {
  const sh = getOrCreateSheet(ADMIN_SHEET, ADMIN_COLS);
  const rows = sh.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const k = String(rows[i][0] || "");
    if (k) out[k] = String(rows[i][1] || "");
  }
  return { user: out.user || "", passHash: out.passHash || "", updatedAt: out.updatedAt || "" };
}

function setAdminCreds(user, passHash) {
  if (!user || !passHash) return { ok: false, error: "ต้องมี user + passHash" };
  const sh = getOrCreateSheet(ADMIN_SHEET, ADMIN_COLS);
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  const rowIdx = {};
  for (let i = 1; i < rows.length; i++) {
    const k = String(rows[i][0] || "");
    if (k) rowIdx[k] = i + 1;
  }
  const put = (k, v) => {
    if (rowIdx[k]) sh.getRange(rowIdx[k], 1, 1, 3).setValues([[k, v, now]]);
    else sh.appendRow([k, v, now]);
  };
  put("user", user);
  put("passHash", passHash);
  put("updatedAt", now);
  return { ok: true, user: user, updatedAt: now };
}

// ==============================
// ADMIN USERS — หลายบัญชี + สิทธิ์ (tab admin_users)
//
// role มี 2 แบบ
//   owner = เจ้าของร้าน ทำได้ทุกอย่าง
//   staff = ลูกน้อง เปิดบิลได้ · ดูข้อมูลอื่นได้ · แก้ไขไม่ได้
//
// อ่าน/เขียนผ่าน POST ที่มี token เท่านั้น ไม่เปิดทาง doGet
// ==============================
const ADMIN_USERS_SHEET = "admin_users";
const ADMIN_USER_COLS = ["username", "pass_hash", "role", "display_name", "active", "created_at", "updated_at"];

// ย้ายบัญชีเจ้าของเดิม (tab admin) เข้ามาใน admin_users ให้อัตโนมัติ
// จะได้ไม่ต้องตั้งรหัสใหม่ และของเดิมยังใช้ล็อกอินได้เหมือนเดิม
function migrateOwnerAccount(sh) {
  const rows = sh.getDataRange().getValues();
  if (rows.length > 1) return;                       // มีบัญชีอยู่แล้ว ไม่ต้องย้าย
  const old = getAdminCreds();
  if (!old.user || !old.passHash) return;            // ยังไม่เคยตั้งรหัสเอง
  const now = new Date().toISOString();
  sh.appendRow([old.user, old.passHash, "owner", "เจ้าของร้าน", true, old.updatedAt || now, now]);
}

function adminUsersSheet() {
  const sh = getOrCreateSheet(ADMIN_USERS_SHEET, ADMIN_USER_COLS);
  try { migrateOwnerAccount(sh); } catch (e) { Logger.log("migrateOwner err: " + e); }
  return sh;
}

// รายชื่อสำหรับหน้าจัดการ — ไม่ส่ง pass_hash ออกไป
function listAdminUsers() {
  const sh = adminUsersSheet();
  return rowsToObjects(sh, ADMIN_USER_COLS, ["username"]).map(o => ({
    username: String(o.username || ""),
    role: String(o.role || "staff"),
    displayName: String(o.display_name || ""),
    active: o.active === true || o.active === "TRUE",
    hasPassword: !!String(o.pass_hash || ""),
    createdAt: String(o.created_at || ""),
    updatedAt: String(o.updated_at || ""),
  }));
}

// ใช้ตอนล็อกอิน — ตัวนี้ส่ง pass_hash กลับไปเทียบ
function getAdminUser(username) {
  const u = String(username || "").trim().toLowerCase();
  if (!u) return null;
  const sh = adminUsersSheet();
  const found = rowsToObjects(sh, ADMIN_USER_COLS, ["username"])
    .find(o => String(o.username || "").trim().toLowerCase() === u);
  if (!found) return null;
  const active = found.active === true || found.active === "TRUE";
  if (!active) return { username: String(found.username), disabled: true };
  return {
    username: String(found.username || ""),
    passHash: String(found.pass_hash || ""),
    role: String(found.role || "staff"),
    displayName: String(found.display_name || ""),
  };
}

function upsertAdminUser(data) {
  if (!data || !data.username) return { ok: false, error: "ต้องมี username" };
  const role = (data.role === "owner") ? "owner" : "staff";
  const sh = adminUsersSheet();
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  const uname = String(data.username).trim();
  const key = uname.toLowerCase();

  let rowIdx = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim().toLowerCase() === key) { rowIdx = i; break; }
  }

  // กันลบ owner คนสุดท้ายโดยการเปลี่ยน role เป็น staff
  if (rowIdx >= 0 && role === "staff" && String(rows[rowIdx][2] || "") === "owner" && countOwners(rows) <= 1) {
    return { ok: false, error: "ต้องเหลือเจ้าของร้านอย่างน้อย 1 คน" };
  }

  const active = (data.active === false) ? false : true;
  if (rowIdx >= 0) {
    // แก้ของเดิม — ถ้าไม่ได้ส่งรหัสใหม่มา ให้คงรหัสเดิมไว้
    const keepHash = String(rows[rowIdx][1] || "");
    const hash = data.passHash ? String(data.passHash) : keepHash;
    const created = String(rows[rowIdx][5] || now);
    sh.getRange(rowIdx + 1, 1, 1, ADMIN_USER_COLS.length)
      .setValues([[uname, hash, role, data.displayName || "", active, created, now]]);
    return { ok: true, username: uname, created: false };
  }

  if (!data.passHash) return { ok: false, error: "บัญชีใหม่ต้องตั้งรหัสผ่าน" };
  sh.appendRow([uname, String(data.passHash), role, data.displayName || "", active, now, now]);
  return { ok: true, username: uname, created: true };
}

function countOwners(rows) {
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    const active = rows[i][4] === true || rows[i][4] === "TRUE";
    if (String(rows[i][2] || "") === "owner" && active) n++;
  }
  return n;
}

function deleteAdminUser(username) {
  const key = String(username || "").trim().toLowerCase();
  if (!key) return { ok: false, error: "ต้องระบุ username" };
  const sh = adminUsersSheet();
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim().toLowerCase() === key) {
      if (String(rows[i][2] || "") === "owner" && countOwners(rows) <= 1) {
        return { ok: false, error: "ลบไม่ได้ — ต้องเหลือเจ้าของร้านอย่างน้อย 1 คน" };
      }
      sh.deleteRow(i + 1);
      return { ok: true, deleted: true };
    }
  }
  return { ok: false, error: "ไม่พบบัญชีนี้" };
}

// ==============================
// PROMOS (Banner + TikTok clips) — เก็บใน tab promos
// ==============================
const PROMOS_SHEET = "promos";
const PROMO_COLS = ["id", "kind", "data_json", "sort", "created_at"];

function listPromos(kind) {
  const sh = getOrCreateSheet(PROMOS_SHEET, PROMO_COLS);
  return rowsToObjects(sh, PROMO_COLS)
    .filter(o => o.kind === kind)
    .map(o => {
      try { return JSON.parse(o.data_json || "{}"); } catch(e) { return null; }
    })
    .filter(Boolean);
}

// Full sync — ลบของเดิม + ใส่ทั้งหมดใหม่ (simpler than diff)
function savePromos(banners, tiktoks) {
  const sh = getOrCreateSheet(PROMOS_SHEET, PROMO_COLS);
  // ลบทุกแถวยกเว้น header
  const last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);
  const now = new Date().toISOString();
  const rows = [];
  banners.forEach((b, i) => rows.push([
    "BN-" + (b.id || Date.now() + "-" + i),
    "banner", JSON.stringify(b), i, now,
  ]));
  tiktoks.forEach((t, i) => rows.push([
    "TT-" + (t.id || Date.now() + "-" + i),
    "tiktok", JSON.stringify(t), i, now,
  ]));
  if (rows.length) sh.getRange(2, 1, rows.length, PROMO_COLS.length).setValues(rows);
  return rows.length;
}

// ==============================
// TikTok oEmbed — ดึง thumbnail + title จาก URL คลิป
// docs: https://developers.tiktok.com/doc/embed-videos
// ==============================
// ลิงก์สั้น vt.tiktok.com / vm.tiktok.com → ตามไปหา URL เต็มที่มี /video/<id>
function resolveTiktokUrl(url) {
  const u = String(url || "");
  if (!/(vt|vm)\.tiktok\.com\//i.test(u)) return u;
  try {
    // ไม่ตามอัตโนมัติ เพื่ออ่าน header Location เอง
    const res = UrlFetchApp.fetch(u, { followRedirects: false, muteHttpExceptions: true });
    const h = res.getHeaders() || {};
    const loc = h["Location"] || h["location"];
    if (loc) return String(loc).split("?")[0];
    // บางกรณี redirect ถูกตามไปแล้ว — หา /video/<id> จาก body
    const body = res.getContentText() || "";
    const m = body.match(/tiktok\.com\/@[\w.\-]+\/video\/(\d+)/);
    if (m) return "https://www.tiktok.com/" + m[0].split("tiktok.com/")[1];
  } catch (e) {
    Logger.log("resolveTiktokUrl err: " + e);
  }
  return u;
}

function oembedTiktok(videoUrl) {
  if (!videoUrl) return { ok: false, error: "no url" };
  try {
    const resolved = resolveTiktokUrl(videoUrl);
    const oembedUrl = "https://www.tiktok.com/oembed?url=" + encodeURIComponent(resolved);
    const res = UrlFetchApp.fetch(oembedUrl, {
      muteHttpExceptions: true,
      followRedirects: true,
    });
    const status = res.getResponseCode();
    const body = res.getContentText() || "{}";
    if (status !== 200) return { ok: false, error: "TikTok returned " + status, resolved: resolved, body: body.substring(0, 200) };
    const data = JSON.parse(body);
    const idm = String(resolved).match(/\/video\/(\d+)/);
    return {
      ok: true,
      thumbnail: data.thumbnail_url || "",
      title: data.title || "",
      author: data.author_name || "",
      authorUrl: data.author_url || "",
      resolved: resolved,                 // URL เต็มหลังแกะลิงก์สั้น
      videoId: idm ? idm[1] : "",         // เลข id ใช้สร้าง embed player
      width: data.thumbnail_width || 0,
      height: data.thumbnail_height || 0,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
