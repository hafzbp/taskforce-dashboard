PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  min_date TEXT NOT NULL,
  max_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'complete', 'failed')),
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS sales_staging (
  import_id TEXT NOT NULL,
  row_key TEXT NOT NULL,
  posting_date TEXT NOT NULL,
  branch_name TEXT,
  distribution_channel TEXT,
  customer_code TEXT,
  customer_name TEXT,
  billing_number TEXT,
  item_code TEXT,
  description TEXT,
  sales REAL NOT NULL,
  ctn_qty REAL NOT NULL,
  cancel_bill_doc TEXT,
  billing_type TEXT,
  salesman_id TEXT,
  salesman_name TEXT,
  PRIMARY KEY (import_id, row_key),
  FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales_rows (
  row_key TEXT PRIMARY KEY,
  posting_date TEXT NOT NULL,
  branch_name TEXT,
  distribution_channel TEXT,
  customer_code TEXT,
  customer_name TEXT,
  billing_number TEXT,
  item_code TEXT,
  description TEXT,
  sales REAL NOT NULL,
  ctn_qty REAL NOT NULL,
  cancel_bill_doc TEXT,
  billing_type TEXT,
  salesman_id TEXT,
  salesman_name TEXT,
  import_id TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_posting_date ON sales_rows(posting_date);
CREATE INDEX IF NOT EXISTS idx_sales_branch_date ON sales_rows(branch_name, posting_date);
CREATE INDEX IF NOT EXISTS idx_sales_salesman_date ON sales_rows(salesman_id, posting_date);
CREATE INDEX IF NOT EXISTS idx_imports_status_created ON imports(status, created_at DESC);
