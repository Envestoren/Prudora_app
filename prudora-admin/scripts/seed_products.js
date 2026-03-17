import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const csvPath = path.join(__dirname, '..', 'products_rows.csv');
const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
const cols = ['id','name','supplier','manufacturer','unit','unit_price_amount','is_weight_item','created_at','updated_at','product_id','type_id','category_id','subcategory_id','image_url'];
const idx = (n) => cols.indexOf(n);
const esc = (s) => (s || '').replace(/'/g, "''");

const rows = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  const out = [];
  let cur = '';
  let inq = false;
  for (let j = 0; j < line.length; j++) {
    const c = line[j];
    if (c === '"') { inq = !inq; continue; }
    if (c === ',' && !inq) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  rows.push(out);
}

// Insert: id, name, supplier, manufacturer, unit, unit_price_amount, is_weight_item, created_at, updated_at, category_id null (FK may not exist), image_url null
const values = rows.map(r => [
  "'" + esc(r[idx('id')]) + "'",
  "'" + esc(r[idx('name')]) + "'",
  "'" + esc(r[idx('supplier')]) + "'",
  "'" + esc(r[idx('manufacturer')]) + "'",
  "'" + esc(r[idx('unit')]) + "'",
  r[idx('unit_price_amount')] || '0',
  (r[idx('is_weight_item')] === 'true') ? 'true' : 'false',
  "'" + esc(r[idx('created_at')]) + "'",
  "'" + esc(r[idx('updated_at')]) + "'",
  'null',
  'null'
].join(',')).map(row => '(' + row + ')').join(',\n');

const sql = `insert into public.products (id, name, supplier, manufacturer, unit, unit_price_amount, is_weight_item, created_at, updated_at, category_id, image_url)
values ${values}
on conflict (id) do nothing;`;

fs.writeFileSync(path.join(__dirname, '..', 'seed_products.sql'), sql, 'utf8');
console.log('Wrote seed_products.sql with', rows.length, 'rows');
