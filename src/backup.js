// Daily backup: full logical snapshot of every business table in production D1,
// written to R2 as gzip-compressed JSON, one dated folder per run.
//
// This exists alongside D1 Time Travel, not instead of it:
//   - Time Travel: automatic, exact point-in-time restore, but whole-database
//     and limited to a retention window (days, not indefinite).
//   - This backup: indefinite retention, human-inspectable JSON per table,
//     off-database (survives even a D1-level catastrophe), one file per table
//     per day, plus a manifest with row counts and a day-over-day change
//     summary so it's easy to see what moved without diffing raw JSON.
//
// Deliberately a full snapshot rather than a row-level change log: at the
// data volumes here (a few MB total), a full nightly snapshot costs nothing
// meaningful in storage and is far more robust than an incremental journal,
// which would silently miss hard deletes unless every table's writes were
// funnelled through a change-capture layer. If data volume grows enough for
// storage cost to matter, this can be switched to incremental without
// changing the restore procedure (each day's snapshot would just become a
// diff instead of a full copy).
//
// Runs on the Cron Trigger defined in wrangler.toml (see [triggers]).
// Can also be run on demand via `wrangler dev` + calling runDailyBackup, or
// by using the "Trigger Cron" test panel in the Cloudflare dashboard for
// this Worker (Workers & Pages -> tagro-os-core -> Triggers -> Cron Triggers).

const BACKUP_TABLES = [
  'branches', 'staff',
  'customers', 'customer_identity_keys', 'customer_branch_access', 'customer_credentials',
  'customer_machines', 'machine_ownership_history',
  'machine_makes', 'machine_models', 'equipment_categories',
  'repair_jobs', 'work_order_details', 'work_order_parts', 'job_events',
  'job_estimates', 'job_estimate_items', 'job_service_records', 'job_service_items',
  'job_billing_items', 'job_billing_materials', 'service_job_types',
  'intake_drafts', 'intake_draft_completions', 'intake_photos',
  'mobile_sales_invoices', 'mobile_sales_invoice_lines', 'mobile_invoices', 'mobile_invoice_lines',
  'busy_write_queue', 'busy_write_receipts',
  'purchase_orders', 'purchase_order_items', 'purchase_order_exports',
  'stock_count_submissions', 'stock_count_entries',
  'catalog_items', 'catalog_name_suggestions',
  'documents', 'evidence_records', 'import_sources',
  'entity_links', 'edit_requests', 'record_change_audit',
  'auth_attempts', 'sessions', 'breaker_flags'
];

export async function runDailyBackup(env) {
  if (!env.BACKUPS) {
    console.error(JSON.stringify({ event: 'backup.skipped', reason: 'no BACKUPS r2 binding configured' }));
    return { ok: false, reason: 'no_binding' };
  }
  if (!env.DB) {
    console.error(JSON.stringify({ event: 'backup.skipped', reason: 'no DB binding configured' }));
    return { ok: false, reason: 'no_db' };
  }

  const startedAt = new Date();
  const dateKey = startedAt.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
  const manifest = {
    date: dateKey,
    started_at: startedAt.toISOString(),
    database: 'tagro-os',
    tables: {}
  };
  let totalRows = 0;
  let failures = 0;

  for (const table of BACKUP_TABLES) {
    try {
      const result = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      const rows = result.results || [];
      const jsonText = JSON.stringify(rows);
      const compressed = await gzipText(jsonText);
      const key = `daily/${dateKey}/${table}.json.gz`;
      await env.BACKUPS.put(key, compressed, {
        httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' }
      });
      manifest.tables[table] = {
        rows: rows.length,
        bytes_raw: jsonText.length,
        bytes_gz: compressed.byteLength
      };
      totalRows += rows.length;
    } catch (error) {
      failures++;
      manifest.tables[table] = { error: String((error && error.message) || error) };
      console.error(JSON.stringify({
        event: 'backup.table_failed',
        table,
        error: String((error && error.message) || error)
      }));
    }
  }

  manifest.finished_at = new Date().toISOString();
  manifest.total_rows = totalRows;
  manifest.failed_tables = failures;

  // Day-over-day row-count change summary, if yesterday's manifest is present.
  try {
    const prevDateKey = new Date(startedAt.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const prevManifestObj = await env.BACKUPS.get(`daily/${prevDateKey}/manifest.json`);
    if (prevManifestObj) {
      const prevManifest = JSON.parse(await prevManifestObj.text());
      const changes = {};
      for (const table of BACKUP_TABLES) {
        const prevRows = (prevManifest.tables[table] && prevManifest.tables[table].rows) || 0;
        const nowRows = (manifest.tables[table] && manifest.tables[table].rows) || 0;
        if (nowRows !== prevRows) {
          changes[table] = { previous: prevRows, current: nowRows, delta: nowRows - prevRows };
        }
      }
      manifest.row_count_changes_since_previous_day = changes;
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'backup.diff_failed', error: String((error && error.message) || error) }));
  }

  await env.BACKUPS.put(`daily/${dateKey}/manifest.json`, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  });

  console.log(JSON.stringify({
    event: 'backup.completed',
    date: dateKey,
    total_rows: totalRows,
    failed_tables: failures
  }));

  return { ok: failures === 0, manifest };
}

async function gzipText(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}
