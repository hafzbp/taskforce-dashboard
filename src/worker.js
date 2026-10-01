const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

const SALES_COLUMNS = [
  "posting_date", "branch_name", "distribution_channel", "customer_code",
  "customer_name", "billing_number", "item_code", "description", "sales",
  "ctn_qty", "cancel_bill_doc", "billing_type", "salesman_id", "salesman_name"
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    try {
      if (!env.DB) return json({ error: "D1 binding DB belum dikonfigurasi." }, 503);
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, app: env.APP_NAME || "Taskforce Dashboard" });
      }
      if (request.method === "GET" && url.pathname === "/api/status") {
        return status(env);
      }
      if (request.method === "GET" && url.pathname === "/api/sales") {
        return listSales(url, env);
      }
      if (url.pathname.startsWith("/api/admin/")) {
        const auth = authorizeAdmin(request, env);
        if (auth) return auth;
        if (request.method === "POST" && url.pathname === "/api/admin/setup") {
          return setupDatabase(env);
        }
        if (request.method === "POST" && url.pathname === "/api/admin/imports") {
          return createImport(request, env);
        }
        const chunkMatch = url.pathname.match(/^\/api\/admin\/imports\/([a-f0-9-]+)\/chunks$/i);
        if (request.method === "POST" && chunkMatch) {
          return uploadChunk(request, env, chunkMatch[1]);
        }
        const completeMatch = url.pathname.match(/^\/api\/admin\/imports\/([a-f0-9-]+)\/complete$/i);
        if (request.method === "POST" && completeMatch) {
          return completeImport(env, completeMatch[1]);
        }
        const failMatch = url.pathname.match(/^\/api\/admin\/imports\/([a-f0-9-]+)\/fail$/i);
        if (request.method === "POST" && failMatch) {
          return failImport(env, failMatch[1]);
        }
      }
      return json({ error: "Endpoint tidak ditemukan." }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: error?.message || "Terjadi kesalahan pada server." }, 500);
    }
  }
};

function json(body, statusCode = 200) {
  return new Response(JSON.stringify(body), { status: statusCode, headers: JSON_HEADERS });
}

async function setupDatabase(env) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY, file_name TEXT NOT NULL, file_size INTEGER NOT NULL DEFAULT 0,
      row_count INTEGER NOT NULL DEFAULT 0, min_date TEXT NOT NULL, max_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'complete', 'failed')),
      uploaded_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS sales_staging (
      import_id TEXT NOT NULL, row_key TEXT NOT NULL, posting_date TEXT NOT NULL,
      branch_name TEXT, distribution_channel TEXT, customer_code TEXT, customer_name TEXT,
      billing_number TEXT, item_code TEXT, description TEXT, sales REAL NOT NULL,
      ctn_qty REAL NOT NULL, cancel_bill_doc TEXT, billing_type TEXT, salesman_id TEXT,
      salesman_name TEXT, PRIMARY KEY (import_id, row_key),
      FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS sales_rows (
      row_key TEXT PRIMARY KEY, posting_date TEXT NOT NULL, branch_name TEXT,
      distribution_channel TEXT, customer_code TEXT, customer_name TEXT, billing_number TEXT,
      item_code TEXT, description TEXT, sales REAL NOT NULL, ctn_qty REAL NOT NULL,
      cancel_bill_doc TEXT, billing_type TEXT, salesman_id TEXT, salesman_name TEXT,
      import_id TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    "CREATE INDEX IF NOT EXISTS idx_sales_posting_date ON sales_rows(posting_date)",
    "CREATE INDEX IF NOT EXISTS idx_sales_branch_date ON sales_rows(branch_name, posting_date)",
    "CREATE INDEX IF NOT EXISTS idx_sales_salesman_date ON sales_rows(salesman_id, posting_date)",
    "CREATE INDEX IF NOT EXISTS idx_imports_status_created ON imports(status, created_at DESC)"
  ];
  await env.DB.batch(statements.map(sql => env.DB.prepare(sql)));
  return json({ ok: true, message: "Database siap digunakan." });
}

function authorizeAdmin(request, env) {
  if (!env.ADMIN_TOKEN) {
    return json({ error: "Secret ADMIN_TOKEN belum dikonfigurasi di Cloudflare." }, 503);
  }
  const supplied = request.headers.get("authorization") || "";
  if (supplied !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ error: "Token admin tidak valid." }, 401);
  }
  return null;
}

async function status(env) {
  const latest = await env.DB.prepare(
    `SELECT id, file_name, row_count, min_date, max_date, uploaded_by, completed_at
     FROM imports WHERE status = 'complete' ORDER BY completed_at DESC LIMIT 1`
  ).first();
  const totals = await env.DB.prepare(
    `SELECT COUNT(*) AS row_count, MIN(posting_date) AS min_date, MAX(posting_date) AS max_date
     FROM sales_rows`
  ).first();
  return json({ latest: latest || null, data: totals || { row_count: 0, min_date: null, max_date: null } });
}

async function listSales(url, env) {
  const limit = Math.min(2000, Math.max(100, Number(url.searchParams.get("limit")) || 2000));
  const cursor = Math.max(0, Number(url.searchParams.get("cursor")) || 0);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const conditions = [];
  const values = [];
  if (from) { conditions.push("posting_date >= ?"); values.push(from); }
  if (to) { conditions.push("posting_date <= ?"); values.push(to); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const query = `SELECT ${SALES_COLUMNS.join(", ")} FROM sales_rows ${where}
                 ORDER BY posting_date, branch_name, billing_number, item_code, row_key
                 LIMIT ? OFFSET ?`;
  const result = await env.DB.prepare(query).bind(...values, limit + 1, cursor).all();
  const records = result.results || [];
  const hasMore = records.length > limit;
  const page = records.slice(0, limit).map(record => SALES_COLUMNS.map(column => record[column] ?? ""));
  return json({ rows: page, next_cursor: hasMore ? cursor + limit : null });
}

async function createImport(request, env) {
  const body = await readJson(request);
  const fileName = text(body.file_name, 240);
  const minDate = isoDate(body.min_date);
  const maxDate = isoDate(body.max_date);
  const rowCount = integer(body.row_count, 1, 1000000);
  const fileSize = integer(body.file_size || 0, 0, 200000000);
  if (!fileName || !minDate || !maxDate || minDate > maxDate || !rowCount) {
    return json({ error: "Metadata import tidak valid." }, 400);
  }
  const id = crypto.randomUUID();
  const uploadedBy = text(request.headers.get("cf-access-authenticated-user-email") || "token-admin", 240);
  await env.DB.prepare(
    `INSERT INTO imports (id, file_name, file_size, row_count, min_date, max_date, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, fileName, fileSize, rowCount, minDate, maxDate, uploadedBy).run();
  return json({ id, status: "uploading" }, 201);
}

async function uploadChunk(request, env, importId) {
  const found = await env.DB.prepare(
    "SELECT id FROM imports WHERE id = ? AND status = 'uploading'"
  ).bind(importId).first();
  if (!found) return json({ error: "Import tidak ditemukan atau sudah ditutup." }, 404);

  const body = await readJson(request);
  if (!Array.isArray(body.rows) || !body.rows.length || body.rows.length > 250) {
    return json({ error: "Chunk harus berisi 1–250 baris." }, 400);
  }
  const normalized = body.rows.map(validateRow);
  await env.DB.prepare(
    `INSERT OR REPLACE INTO sales_staging (
      import_id, row_key, posting_date, branch_name, distribution_channel, customer_code,
      customer_name, billing_number, item_code, description, sales, ctn_qty,
      cancel_bill_doc, billing_type, salesman_id, salesman_name
    )
    SELECT ?,
      json_extract(value, '$.row_key'),
      json_extract(value, '$.values[0]'),
      json_extract(value, '$.values[1]'),
      json_extract(value, '$.values[2]'),
      json_extract(value, '$.values[3]'),
      json_extract(value, '$.values[4]'),
      json_extract(value, '$.values[5]'),
      json_extract(value, '$.values[6]'),
      json_extract(value, '$.values[7]'),
      CAST(json_extract(value, '$.values[8]') AS REAL),
      CAST(json_extract(value, '$.values[9]') AS REAL),
      json_extract(value, '$.values[10]'),
      json_extract(value, '$.values[11]'),
      json_extract(value, '$.values[12]'),
      json_extract(value, '$.values[13]')
    FROM json_each(?)`
  ).bind(importId, JSON.stringify(normalized)).run();
  return json({ accepted: normalized.length });
}

async function completeImport(env, importId) {
  const item = await env.DB.prepare(
    "SELECT * FROM imports WHERE id = ? AND status = 'uploading'"
  ).bind(importId).first();
  if (!item) return json({ error: "Import tidak ditemukan atau sudah ditutup." }, 404);
  const staged = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM sales_staging WHERE import_id = ?"
  ).bind(importId).first();
  if (Number(staged?.count) !== Number(item.row_count)) {
    return json({ error: `Jumlah staging ${staged?.count || 0} tidak sama dengan ${item.row_count}.` }, 409);
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM sales_rows WHERE posting_date BETWEEN ? AND ?").bind(item.min_date, item.max_date),
    env.DB.prepare(
      `INSERT INTO sales_rows (
        row_key, posting_date, branch_name, distribution_channel, customer_code,
        customer_name, billing_number, item_code, description, sales, ctn_qty,
        cancel_bill_doc, billing_type, salesman_id, salesman_name, import_id
      ) SELECT row_key, posting_date, branch_name, distribution_channel, customer_code,
        customer_name, billing_number, item_code, description, sales, ctn_qty,
        cancel_bill_doc, billing_type, salesman_id, salesman_name, import_id
        FROM sales_staging WHERE import_id = ?`
    ).bind(importId),
    env.DB.prepare(
      "UPDATE imports SET status = 'complete', completed_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(importId),
    env.DB.prepare("DELETE FROM sales_staging WHERE import_id = ?").bind(importId)
  ]);
  return json({ id: importId, status: "complete", rows: Number(staged.count) });
}

async function failImport(env, importId) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sales_staging WHERE import_id = ?").bind(importId),
    env.DB.prepare("UPDATE imports SET status = 'failed' WHERE id = ? AND status = 'uploading'").bind(importId)
  ]);
  return json({ id: importId, status: "failed" });
}

function validateRow(item) {
  if (!item || typeof item !== "object" || !Array.isArray(item.values) || item.values.length !== 14) {
    throw new Error("Format baris tidak valid.");
  }
  const values = item.values.map((value, index) => {
    if (index === 8 || index === 9) {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error("Sales atau CTN Qty tidak valid.");
      return number;
    }
    return text(value, 500);
  });
  if (!isoDate(values[0])) throw new Error("Posting Date tidak valid.");
  const rowKey = text(item.row_key, 64);
  if (!/^[a-f0-9]{64}$/i.test(rowKey)) throw new Error("Row key tidak valid.");
  return { row_key: rowKey, values };
}

async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("Content-Type harus application/json.");
  return request.json();
}

function text(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isoDate(value) {
  const date = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function integer(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : 0;
}
