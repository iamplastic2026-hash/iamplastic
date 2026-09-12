/**
 * iamplastic — Google Sheet Sync Backend
 * =========================================
 * วิธี deploy: Extensions → Apps Script → paste code นี้ → Save
 * → Deploy → New deployment → Type: Web app
 * → Execute as: Me · Who has access: Anyone
 * → Deploy → Copy Web app URL → paste ในหน้า Admin Settings ของเว็บ
 *
 * รหัสยืนยัน (ใช้กันคนอื่นเขียนข้อมูลผ่าน URL) — เปลี่ยนได้ตามใจ
 */
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
  "mall", "weight", "dimensions", "shipEst", "updated_at"
];

const ORDER_COLS = [
  "po", "status", "total", "subtotal", "discount",
  "shipping", "shipping_method", "carrier", "tracking",
  "payment", "tax_invoice", "customer_name", "customer_phone",
  "customer_address", "items_json", "created_at", "updated_at",
  "slip_image", "slip_date", "slip_time", "slip_amount", "slip_bank",
  "slip_note", "slip_status", "slip_uploaded_at"
];

const CUSTOMER_COLS = [
  "name", "first_name", "last_name", "phone", "email",
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
    if (action === "ping") return json({ ok: true, message: "pong", time: new Date().toISOString() });
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
    if (action === "registercustomer") return json({ ok: true, email: registerCustomer(body.data) });
    if (action === "bulkupsertcustomers") return json({ ok: true, count: bulkUpsertCustomers(body.data) });
    if (action === "verifyslip") return json({ ok: true, result: verifySlipOK(body.slipBase64, body.expectedAmount, body.slipokApiKey, body.slipokBranchId) });
    if (action === "listcoupons") return json({ ok: true, coupons: listCoupons() });
    if (action === "upsertcoupon") return json({ ok: true, code: upsertCoupon(body.data) });
    if (action === "deletecoupon") return json({ ok: true, deleted: deleteCoupon(body.code) });
    if (action === "addreview") return json({ ok: true, id: addReview(body.data) });
    if (action === "listreviews") return json({ ok: true, reviews: listReviews() });
    if (action === "uploadslip") return json({ ok: true, po: uploadSlip(body.po, body.slip) });
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

function uploadSlip(po, slip) {
  const sh = getOrCreateSheet(ORDERS_SHEET, ORDER_COLS);
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(po)) {
      // Cols 18-25 (1-indexed) = slip_image, slip_date, slip_time, slip_amount, slip_bank, slip_note, slip_status, slip_uploaded_at
      sh.getRange(i + 1, 18).setValue(slip.image || "");
      sh.getRange(i + 1, 19).setValue(slip.date || "");
      sh.getRange(i + 1, 20).setValue(slip.time || "");
      sh.getRange(i + 1, 21).setValue(slip.amount || 0);
      sh.getRange(i + 1, 22).setValue(slip.bank || "");
      sh.getRange(i + 1, 23).setValue(slip.note || "");
      sh.getRange(i + 1, 24).setValue("pending_verify");
      sh.getRange(i + 1, 25).setValue(slip.uploadedAt || now);
      sh.getRange(i + 1, 17).setValue(now); // updated_at
      return po;
    }
  }
  return null;
}

function updateSlipStatus(po, slipStatus) {
  const sh = getOrCreateSheet(ORDERS_SHEET, ORDER_COLS);
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(po)) {
      sh.getRange(i + 1, 24).setValue(slipStatus);
      if (slipStatus === "verified") sh.getRange(i + 1, 2).setValue("paid");
      sh.getRange(i + 1, 17).setValue(now);
      return po;
    }
  }
  return null;
}

function listCustomers() {
  const sh = getOrCreateSheet(CUSTOMERS_SHEET, CUSTOMER_COLS);
  return rowsToObjects(sh, CUSTOMER_COLS).map(o => ({
    name: String(o.name || ""),
    firstName: String(o.first_name || ""),
    lastName: String(o.last_name || ""),
    phone: String(o.phone || ""),
    email: String(o.email || ""),
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
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  const phoneCol = CUSTOMER_COLS.indexOf("phone");
  const emailCol = CUSTOMER_COLS.indexOf("email");
  const row = [
    data.name || "",
    data.firstName || "",
    data.lastName || "",
    data.phone || "",
    data.email || "",
    data.address || "",
    data.prov || "",
    data.zip || "",
    !!data.isCorporate,
    data.company || "",
    data.taxId || "",
    data.branch || "",
    data.companyPhone || "",
    data.companyEmail || "",
    data.companyAddress || "",
    JSON.stringify(data.addresses || []),
    Number(data.ordersCount || 0),
    Number(data.totalSpent || 0),
    data.lineUserId || "",
    data.pictureUrl || "",
    data.registeredAt || now,
    now,
  ];
  const lineCol = CUSTOMER_COLS.indexOf("line_user_id");
  // ค้นแถวเดิม (match LINE ID > phone > email — ไม่ให้ตรงกับค่าว่าง)
  for (let i = 1; i < rows.length; i++) {
    const p = String(rows[i][phoneCol] || "");
    const e = String(rows[i][emailCol] || "");
    const lu = String(rows[i][lineCol] || "");
    if ((data.lineUserId && lu === data.lineUserId) ||
        (data.phone && p === data.phone) ||
        (data.email && e === data.email)) {
      sh.getRange(i + 1, 1, 1, CUSTOMER_COLS.length).setValues([row]);
      return data.email || data.phone || data.lineUserId;
    }
  }
  sh.appendRow(row);
  return data.email || data.phone || data.lineUserId;
}

function bulkUpsertCustomers(arr) {
  let n = 0;
  (arr || []).forEach(c => { registerCustomer(c); n++; });
  return n;
}

// เรียกฟังก์ชันนี้ใน editor เพื่อทดสอบว่าเชื่อม Sheet ได้ไหม (ปลอดภัย — ไม่ต้องมี e)
function testSetup() {
  const sh = getOrCreateSheet(PRODUCTS_SHEET, PRODUCT_COLS);
  Logger.log("✓ Sheet 'products' พร้อมใช้ (" + sh.getLastRow() + " แถว)");
  const sh2 = getOrCreateSheet(ORDERS_SHEET, ORDER_COLS);
  Logger.log("✓ Sheet 'orders' พร้อมใช้ (" + sh2.getLastRow() + " แถว)");
  Logger.log("👉 ต่อไป: Deploy → New deployment → Web app → Anyone → Deploy");
  return "OK — sheets ready. ดู logs ด้านล่างหรือกด View → Executions";
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==============================
// Sheet helpers
// ==============================
function getOrCreateSheet(name, columns) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, columns.length).setValues([columns]);
    sh.getRange(1, 1, 1, columns.length).setFontWeight("bold").setBackground("#EE4D2D").setFontColor("#FFFFFF");
    sh.setFrozenRows(1);
  }
  return sh;
}

function rowsToObjects(sheet, columns) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  }).filter(o => o.id || o.po);
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
    tiers: [[Number(p.moq || 1), 999999, Number(p.wholesale || 0)]],
  }));
}

function upsertProduct(data) {
  const sh = getOrCreateSheet(PRODUCTS_SHEET, PRODUCT_COLS);
  const rows = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  const rowData = PRODUCT_COLS.map(col => {
    if (col === "updated_at") return now;
    if (col === "sizes" && Array.isArray(data.sizes)) return data.sizes.join(", ");
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
    },
    items: o.items_json ? JSON.parse(o.items_json) : [],
    createdAt: String(o.created_at || ""),
    updatedAt: String(o.updated_at || ""),
    slip: o.slip_image || o.slip_amount ? {
      image: String(o.slip_image || ""),
      date: String(o.slip_date || ""),
      time: String(o.slip_time || ""),
      amount: Number(o.slip_amount || 0),
      bank: String(o.slip_bank || ""),
      note: String(o.slip_note || ""),
      uploadedAt: String(o.slip_uploaded_at || ""),
    } : null,
    slipStatus: String(o.slip_status || ""),
  }));
}

function createOrder(data) {
  const sh = getOrCreateSheet(ORDERS_SHEET, ORDER_COLS);
  const now = new Date().toISOString();
  const row = [
    data.po, data.status || "pending_payment",
    data.total || 0, data.subtotal || 0, data.discount || 0,
    data.shipping || 0, data.shippingMethod || "",
    data.carrierName || "", data.tracking || "",
    data.payment || "", !!data.taxInvoice,
    (data.customer || {}).name || "",
    (data.customer || {}).phone || "",
    (data.customer || {}).address || "",
    JSON.stringify(data.items || []),
    data.createdAt || now, now,
  ];
  sh.appendRow(row);

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
// TikTok oEmbed — ดึง thumbnail + title จาก URL คลิป
// docs: https://developers.tiktok.com/doc/embed-videos
// ==============================
function oembedTiktok(videoUrl) {
  if (!videoUrl) return { ok: false, error: "no url" };
  try {
    const oembedUrl = "https://www.tiktok.com/oembed?url=" + encodeURIComponent(videoUrl);
    const res = UrlFetchApp.fetch(oembedUrl, {
      muteHttpExceptions: true,
      followRedirects: true,
    });
    const status = res.getResponseCode();
    const body = res.getContentText() || "{}";
    if (status !== 200) return { ok: false, error: "TikTok returned " + status, body: body.substring(0, 200) };
    const data = JSON.parse(body);
    return {
      ok: true,
      thumbnail: data.thumbnail_url || "",
      title: data.title || "",
      author: data.author_name || "",
      authorUrl: data.author_url || "",
      width: data.thumbnail_width || 0,
      height: data.thumbnail_height || 0,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
