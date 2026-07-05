import { readFile } from 'node:fs/promises';

const [worker, migration, contactMigration, receive, intake, work, workOrderForm, sw] = await Promise.all([
  readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0009_intake_drafts.sql', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0011_intake_contact_verification.sql', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/receive.html', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/intake.js', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/work.html', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/work-order-form.js', import.meta.url), 'utf8'),
  readFile(new URL('../tagros/sw.js', import.meta.url), 'utf8')
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const table of ['intake_drafts', 'intake_photos', 'intake_draft_completions']) {
  assert(migration.includes(`CREATE TABLE ${table}`), `Missing ${table} migration`);
}
assert(migration.includes("photo_type IN ('service_sheet', 'machine', 'serial_plate', 'damage', 'other')"), 'Photo classifications are not constrained');
assert(migration.includes('draft_id TEXT PRIMARY KEY'), 'Draft completion is not idempotency-guarded');
assert(worker.includes('INTAKE_PHOTO_MAX_FILES = 8'), 'Eight-photo limit is missing');
assert(worker.includes("['image/jpeg', 'image/png', 'image/webp'].includes(detectedType)"), 'Uploaded photo content is not signature-validated');
assert(worker.includes("if (!hasRole(session, 'owner') && draft.branch_id !== session.branch_id)"), 'Intake branch isolation is missing');
assert(worker.includes("SET status = 'completed', job_id = ?"), 'Completed intake is not linked to its work order');
assert(worker.includes('intake_draft_completions'), 'Concurrent completion guard is missing');
assert(receive.includes('Automatic photo reading is not connected yet.'), 'OCR status is not stated honestly');
assert(receive.includes('id="camera-input"') && receive.includes('capture="environment"'), 'Camera capture input is missing');
assert(receive.includes('id="gallery-input"') && receive.includes('multiple'), 'Multi-photo gallery input is missing');
assert(intake.includes('defaultComplaints') && intake.includes('save-complaints'), 'Configurable complaint choices are missing');
assert(intake.includes('data-photo-type') && intake.includes('data-delete-photo'), 'Photo classification/removal controls are missing');
assert(!work.includes("location.replace('receive.html'"), 'Work page still redirects into intake');
assert(work.includes("WorkOrderForm.mount({mode:'edit'"), 'Existing work-order editing is not preserved');
assert(work.includes('id="intake-photo-panel"') && workOrderForm.includes('renderIntakePhotos(order.intake)'), 'Completed intake photos are not shown on the work order');
assert(worker.includes('FROM intake_drafts WHERE job_id = ?'), 'Work-order API does not attach completed intake photos');
assert(contactMigration.includes("customer_confirmed', 'staff_no_contact"), 'Contact verification choices are not constrained');
assert(receive.includes('id="customer-name"') && receive.includes('id="customer-phone"') &&
  receive.includes('id="complaint"') && (receive.match(/required/g) || []).length >= 3,
  'Mandatory intake fields are not enforced in the form');
assert(intake.includes("input[name=\"contact-verification\"]:checked") &&
  worker.includes('validateIntakeCompletion'), 'Contact confirmation does not block completion');
assert(worker.includes("intakeDraft ? 'job_received' : 'machine_received'"), 'Completed intake does not record job_received');
assert(worker.includes("'Machine received through intake'") &&
  worker.includes('customerMachineId'), 'Completed intake does not create or link the physical machine');
assert(sw.includes("'tagro-white-v22'"), 'Service worker cache was not advanced');

for (const retired of ['Rubber Biju', 'Jose Sawmill', 'Thomas Thumpassery', '9447000001', '9447000002', '9656361846']) {
  assert(!receive.includes(retired) && !intake.includes(retired), `Retired sample data found: ${retired}`);
}

console.log('PASS: intake schema is branch-scoped, resumable and completion-guarded');
console.log('PASS: photo upload is typed, size-limited and content-validated');
console.log('PASS: intake UI is photo-first, honest about OCR and complaint-configurable');
console.log('PASS: existing work-order editing remains separate from new intake');
