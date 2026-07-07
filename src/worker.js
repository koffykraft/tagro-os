import ExcelJS from 'exceljs';

const SESSION_COOKIE = 'tagro_session';
const SESSION_HOURS = 12;
const PIN_ITERATIONS = 100000;
const CUSTOMER_DOCUMENT_FIELDS = Object.freeze([
  { field: 'aadhaar', type: 'aadhaar', label: 'Aadhaar' },
  { field: 'pan', type: 'pan', label: 'PAN' },
  { field: 'gst_certificate', type: 'gst_certificate', label: 'GST certificate' },
  { field: 'address_proof', type: 'address_proof', label: 'Address proof' },
  { field: 'bank_document', type: 'bank_document', label: 'Bank Passbook / Statement' },
  { field: 'land_tax_receipt', type: 'land_tax_receipt', label: 'Land Tax Receipt' },
  { field: 'sale_invoice', type: 'sale_invoice', label: 'Invoice' },
  { field: 'payment_receipt', type: 'payment_receipt', label: 'Receipt copy' },
  { field: 'handover_photo', type: 'handover_photo', label: 'Handover photo' },
  { field: 'other_document', type: 'other', label: 'Other document' }
]);
const CUSTOMER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const CUSTOMER_DOCUMENT_TOTAL_MAX_BYTES = 25 * 1024 * 1024;
const CUSTOMER_DOCUMENT_MAX_FILES = 12;
const INTAKE_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const INTAKE_PHOTO_MAX_FILES = 8;
const INTAKE_PHOTO_TYPES = new Set(['service_sheet', 'machine', 'serial_plate', 'damage', 'other']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await routeApi(request, env, url);
      return await serveAsset(request, env, url);
    } catch (error) {
      console.error(JSON.stringify({
        event: 'request.unhandled_error',
        method: request.method,
        path: url.pathname,
        error: errorMessage(error)
      }));
      return json({
        ok: false,
        code: 'INTERNAL_ERROR',
        error: 'Unable to complete the request.'
      }, 500);
    }
  }
};

async function routeApi(request, env, url) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return json({ ok: true, service: 'tagro-os', time: new Date().toISOString() });
  }

  if (request.method === 'POST' && url.pathname === '/api/bootstrap') {
    return bootstrap(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/api/public/branches') {
    const result = await env.DB.prepare(
      'SELECT id, code, name, city, state FROM branches WHERE active = 1 ORDER BY name'
    ).all();
    return json({ ok: true, branches: result.results || [] });
  }

  if (request.method === 'GET' && url.pathname === '/api/public/staff') {
    const branch = cleanText(url.searchParams.get('branch'), 20).toUpperCase();
    if (!branch) return json({ ok: false, error: 'Branch is required.' }, 400);
    const result = await env.DB.prepare(
      'SELECT s.id, s.name, s.role FROM staff s JOIN branches b ON b.id = s.branch_id WHERE b.code = ? AND b.active = 1 AND s.active = 1 AND s.pin_hash IS NOT NULL ORDER BY s.name'
    ).bind(branch).all();
    return json({ ok: true, staff: result.results || [] });
  }

  if (url.pathname === '/api/public/parts' && request.method === 'OPTIONS') {
    return catalogCorsResponse(request, new Response(null, { status: 204 }));
  }

  if (url.pathname === '/api/public/parts' && request.method === 'GET') {
    return catalogCorsResponse(request, await searchKnowledgeParts(env, url));
  }

  if (url.pathname === '/api/admin/import-customers' && request.method === 'POST') {
    return importCustomersAdmin(request, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    return login(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/session') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return json({ ok: true, staff: publicSession(session) });
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie(env) });
  }

  const customerMachineResponse = await routeCustomerMachinesApi(request, env, url);
  if (customerMachineResponse) return customerMachineResponse;

  if (url.pathname === '/api/customers' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return listCustomers(env, url);
  }

  if (url.pathname === '/api/customers' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return createCustomer(request, env, session);
  }

  const customerMachinesMatch = url.pathname.match(/^\/api\/customers\/([^/]+)\/machines$/);
  if (customerMachinesMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return listCustomerMachines(env, decodeURIComponent(customerMachinesMatch[1]));
  }

  const customerDocumentDownloadMatch = url.pathname.match(/^\/api\/customers\/([^/]+)\/documents\/([^/]+)\/download$/);
  if (customerDocumentDownloadMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return downloadCustomerDocument(
      env,
      decodeURIComponent(customerDocumentDownloadMatch[1]),
      decodeURIComponent(customerDocumentDownloadMatch[2])
    );
  }

  const customerDocumentsMatch = url.pathname.match(/^\/api\/customers\/([^/]+)\/documents$/);
  if (customerDocumentsMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return listCustomerDocuments(env, decodeURIComponent(customerDocumentsMatch[1]));
  }

  const customerCredentialRevealMatch = url.pathname.match(/^\/api\/customers\/([^/]+)\/credentials\/([^/]+)\/reveal$/);
  if (customerCredentialRevealMatch && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Manager access is required.' }, 403);
    return revealCustomerCredential(
      request,
      env,
      session,
      decodeURIComponent(customerCredentialRevealMatch[1]),
      decodeURIComponent(customerCredentialRevealMatch[2])
    );
  }

  const customerCredentialsMatch = url.pathname.match(/^\/api\/customers\/([^/]+)\/credentials$/);
  if (customerCredentialsMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Manager access is required.' }, 403);
    return listCustomerCredentials(env, decodeURIComponent(customerCredentialsMatch[1]));
  }

  const customerMatch = url.pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return getCustomer(env, decodeURIComponent(customerMatch[1]));
  }

  if (customerMatch && request.method === 'PUT') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return updateCustomer(request, env, session, decodeURIComponent(customerMatch[1]));
  }

  if (url.pathname === '/api/branches' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Access restricted.' }, 403);
    return listBranches(env, session);
  }

  if (url.pathname === '/api/branches' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'owner')) return json({ ok: false, error: 'Only owners can create branches.' }, 403);
    return createBranch(request, env);
  }

  const branchMatch = url.pathname.match(/^\/api\/branches\/([^/]+)$/);
  if (branchMatch && request.method === 'PUT') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Access restricted.' }, 403);
    return updateBranch(request, env, session, decodeURIComponent(branchMatch[1]));
  }

  if (url.pathname === '/api/machine-catalog' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return listMachineCatalog(env);
  }

  if (url.pathname === '/api/machine-makes' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Access restricted.' }, 403);
    return createMachineMake(request, env);
  }

  if (url.pathname === '/api/machine-models' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Access restricted.' }, 403);
    return createMachineModel(request, env);
  }

  if (url.pathname === '/api/catalog' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return listCatalogItems(env, url);
  }

  if (url.pathname === '/api/catalog' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return createCatalogItem(request, env, session);
  }

  if (url.pathname === '/api/catalog/suggest' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return suggestCatalogValues(request, env);
  }

  if (url.pathname === '/api/catalog/name-suggestions' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Manager access is required.' }, 403);
    return createCatalogNameSuggestions(request, env, session);
  }

  if (url.pathname === '/api/catalog/name-requests' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return requestCatalogTagroName(request, env, session);
  }

  if (url.pathname === '/api/purchase-orders' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return listPurchaseOrders(env, session, url);
  }

  if (url.pathname === '/api/purchase-orders' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return createPurchaseOrder(request, env, session);
  }

  const purchaseOrderExportMatch = url.pathname.match(/^\/api\/purchase-orders\/([^/]+)\/export$/);
  if (purchaseOrderExportMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return exportPurchaseOrder(env, session, decodeURIComponent(purchaseOrderExportMatch[1]), url);
  }

  const purchaseOrderMatch = url.pathname.match(/^\/api\/purchase-orders\/([^/]+)$/);
  if (purchaseOrderMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return getPurchaseOrder(env, session, decodeURIComponent(purchaseOrderMatch[1]));
  }
  if (purchaseOrderMatch && request.method === 'PUT') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return updatePurchaseOrder(request, env, session, decodeURIComponent(purchaseOrderMatch[1]));
  }

  const catalogMatch = url.pathname.match(/^\/api\/catalog\/([^/]+)$/);
  if (catalogMatch && request.method === 'PUT') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return updateCatalogItem(request, env, session, decodeURIComponent(catalogMatch[1]));
  }

  if (url.pathname === '/api/service-types' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return listServiceTypes(env);
  }

  if (url.pathname === '/api/service-types' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Access restricted.' }, 403);
    return createServiceType(request, env);
  }

  if (url.pathname === '/api/intake-drafts' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return listIntakeDrafts(env, session, url);
  }

  if (url.pathname === '/api/intake-drafts' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return createIntakeDraft(request, env, session);
  }

  const intakePhotoMatch = url.pathname.match(/^\/api\/intake-drafts\/([^/]+)\/photos\/([^/]+)$/);
  if (intakePhotoMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return downloadIntakePhoto(
      env,
      session,
      decodeURIComponent(intakePhotoMatch[1]),
      decodeURIComponent(intakePhotoMatch[2])
    );
  }
  if (intakePhotoMatch && request.method === 'PUT') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return updateIntakePhoto(
      request,
      env,
      session,
      decodeURIComponent(intakePhotoMatch[1]),
      decodeURIComponent(intakePhotoMatch[2])
    );
  }
  if (intakePhotoMatch && request.method === 'DELETE') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return deleteIntakePhoto(
      env,
      session,
      decodeURIComponent(intakePhotoMatch[1]),
      decodeURIComponent(intakePhotoMatch[2])
    );
  }

  const intakePhotosMatch = url.pathname.match(/^\/api\/intake-drafts\/([^/]+)\/photos$/);
  if (intakePhotosMatch && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return uploadIntakePhoto(
      request,
      env,
      session,
      decodeURIComponent(intakePhotosMatch[1])
    );
  }

  const intakeCompleteMatch = url.pathname.match(/^\/api\/intake-drafts\/([^/]+)\/complete$/);
  if (intakeCompleteMatch && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return completeIntakeDraft(
      request,
      env,
      session,
      decodeURIComponent(intakeCompleteMatch[1])
    );
  }

  const intakeDraftMatch = url.pathname.match(/^\/api\/intake-drafts\/([^/]+)$/);
  if (intakeDraftMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return getIntakeDraft(env, session, decodeURIComponent(intakeDraftMatch[1]));
  }
  if (intakeDraftMatch && request.method === 'PUT') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return updateIntakeDraft(
      request,
      env,
      session,
      decodeURIComponent(intakeDraftMatch[1])
    );
  }

  const serviceTypeMatch = url.pathname.match(/^\/api\/service-types\/([^/]+)$/);
  if (serviceTypeMatch && request.method === 'PUT') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Access restricted.' }, 403);
    return updateServiceType(request, env, decodeURIComponent(serviceTypeMatch[1]));
  }

  if (url.pathname === '/api/work-orders' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return listWorkOrders(env, session, url);
  }

  if (url.pathname === '/api/work-orders' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return createWorkOrder(request, env, session);
  }

  const workOrderMatch = url.pathname.match(/^\/api\/work-orders\/([^/]+)$/);
  if (workOrderMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return getWorkOrder(env, session, decodeURIComponent(workOrderMatch[1]));
  }

  if (workOrderMatch && request.method === 'PUT') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return updateWorkOrder(request, env, session, decodeURIComponent(workOrderMatch[1]));
  }

  if (url.pathname === '/api/repair-jobs' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return listRepairJobs(env, session, url);
  }

  if (url.pathname === '/api/repair-jobs' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return createRepairJob(request, env, session);
  }

  const repairEventMatch = url.pathname.match(/^\/api\/repair-jobs\/([^/]+)\/events$/);
  if (repairEventMatch && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return addRepairJobEvent(request, env, session, decodeURIComponent(repairEventMatch[1]));
  }

  const repairEstimateMatch = url.pathname.match(/^\/api\/repair-jobs\/([^/]+)\/estimate$/);
  if (repairEstimateMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return getJobEstimate(env, session, decodeURIComponent(repairEstimateMatch[1]));
  }

  if (repairEstimateMatch && request.method === 'PUT') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return saveJobEstimate(request, env, session, decodeURIComponent(repairEstimateMatch[1]));
  }

  const serviceRecordCompleteMatch = url.pathname.match(/^\/api\/repair-jobs\/([^/]+)\/service-record\/complete$/);
  if (serviceRecordCompleteMatch && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return completeServiceRecord(request, env, session, decodeURIComponent(serviceRecordCompleteMatch[1]));
  }

  const serviceRecordMatch = url.pathname.match(/^\/api\/repair-jobs\/([^/]+)\/service-record$/);
  if (serviceRecordMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return getServiceRecord(env, session, decodeURIComponent(serviceRecordMatch[1]));
  }

  if (serviceRecordMatch && request.method === 'PUT') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return saveServiceRecord(request, env, session, decodeURIComponent(serviceRecordMatch[1]));
  }

  const billingMaterialMatch = url.pathname.match(/^\/api\/repair-jobs\/([^/]+)\/billing-material$/);
  if (billingMaterialMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return getBillingMaterial(env, session, decodeURIComponent(billingMaterialMatch[1]));
  }

  const repairJobMatch = url.pathname.match(/^\/api\/repair-jobs\/([^/]+)$/);
  if (repairJobMatch && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return getRepairJob(env, session, decodeURIComponent(repairJobMatch[1]));
  }

  if (url.pathname === '/api/staff' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Access restricted.' }, 403);
    return listStaff(env, session);
  }

  if (url.pathname === '/api/staff' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Access restricted.' }, 403);
    return createStaff(request, env, session);
  }

  const staffMatch = url.pathname.match(/^\/api\/staff\/([^/]+)$/);
  if (staffMatch && request.method === 'PUT') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Access restricted.' }, 403);
    return updateStaff(request, env, session, decodeURIComponent(staffMatch[1]));
  }

  if (url.pathname === '/api/reports/overview' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    if (!hasRole(session, 'manager', 'owner')) return json({ ok: false, error: 'Access restricted.' }, 403);
    return reportOverview(env, session, url);
  }

  if (url.pathname === '/api/knowledge/models' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return listKnowledgeModels(env);
  }

  if (url.pathname === '/api/knowledge/parts' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return searchKnowledgeParts(env, url);
  }

  if (url.pathname === '/api/knowledge/assets' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return listKnowledgeAssets(env, url);
  }

  if (url.pathname === '/api/knowledge/file' && request.method === 'GET') {
    const session = await getSession(request, env);
    if (!session) return json({ ok: false, error: 'Session expired.' }, 401);
    return serveKnowledgeFile(env, url);
  }

  return json({ ok: false, error: 'API route not found.' }, 404);
}

async function bootstrap(request, env) {
  if (!env.BOOTSTRAP_SECRET) return json({ ok: false, error: 'Bootstrap is not configured.' }, 503);
  if (!safeEqual(request.headers.get('X-Bootstrap-Secret') || '', env.BOOTSTRAP_SECRET)) {
    return json({ ok: false, error: 'Not authorized.' }, 403);
  }

  const count = await env.DB.prepare('SELECT COUNT(*) AS total FROM staff').first();
  if (Number(count?.total || 0) > 0) return json({ ok: false, error: 'TAGRO OS has already been initialized.' }, 409);

  const body = await readJson(request);
  const branchCode = cleanText(body.branchCode, 12).toUpperCase();
  const branchName = cleanText(body.branchName, 100);
  const staffName = cleanText(body.staffName, 120);
  const phone = cleanText(body.phone, 20) || null;
  const pin = String(body.pin || '');

  if (!branchCode || !branchName || !staffName || !/^\d{4,8}$/.test(pin)) {
    return json({ ok: false, error: 'Branch code, branch name, staff name and a 4–8 digit PIN are required.' }, 400);
  }

  const now = new Date().toISOString();
  const branchId = makeId('branch');
  const staffId = makeId('staff');
  const salt = randomToken(16);
  let pinHash;
  try {
    pinHash = await hashPin(pin, salt);
  } catch (error) {
    console.error('PIN protection setup failed', error);
    return json({ ok: false, error: 'Unable to protect the owner PIN.' }, 500);
  }

  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO branches (id, code, name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
        .bind(branchId, branchCode, branchName, now, now),
      env.DB.prepare("INSERT INTO staff (id, branch_id, name, phone, role, pin_salt, pin_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'owner', ?, ?, 1, ?, ?)")
        .bind(staffId, branchId, staffName, phone, salt, pinHash, now, now)
    ]);
  } catch (error) {
    console.error('Bootstrap database setup failed', error);
    return json({ ok: false, error: 'Unable to initialize the cloud database.' }, 500);
  }

  return json({ ok: true, message: 'First owner and branch created.' }, 201);
}

const CUSTOMER_IMPORT_MAX_BYTES = 8 * 1024 * 1024;
const CUSTOMER_IMPORT_MAX_CUSTOMERS = 2000;
const CUSTOMER_IMPORT_MAX_MACHINES = 100;
const CUSTOMER_IMPORT_MAX_JOBS = 100;
const CUSTOMER_IMPORT_BATCH_STATEMENTS = 75;

async function importCustomersAdmin(request, env) {
  const configuredToken = String(env.OWNER_TOKEN || '');
  if (!configuredToken) {
    return json({ ok: false, error: 'Customer import is not configured.' }, 503);
  }
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const suppliedToken = match ? match[1].trim() : '';
  if (!suppliedToken || !safeEqual(suppliedToken, configuredToken)) {
    return json({ ok: false, error: 'Not authorized.' }, 403);
  }

  let body;
  try {
    body = await readJsonLimited(request, CUSTOMER_IMPORT_MAX_BYTES);
  } catch (error) {
    return adminImportErrorResponse(error);
  }
  const branchCode = cleanText(body?.branchCode ?? body?.branch, 12).toUpperCase();
  const sourceCustomers = body?.customers;
  if (!branchCode) return json({ ok: false, error: 'Branch code is required.' }, 400);
  if (!Array.isArray(sourceCustomers) || sourceCustomers.length === 0) {
    return json({ ok: false, error: 'Add at least one customer to import.' }, 400);
  }
  if (sourceCustomers.length > CUSTOMER_IMPORT_MAX_CUSTOMERS) {
    return json({
      ok: false,
      error: `Import no more than ${CUSTOMER_IMPORT_MAX_CUSTOMERS} customers per request.`
    }, 413);
  }

  const branch = await env.DB.prepare(
    'SELECT id, code, name FROM branches WHERE code = ? AND active = 1'
  ).bind(branchCode).first();
  if (!branch) return json({ ok: false, error: 'Active branch not found.' }, 404);

  const actor = await env.DB.prepare(
    `SELECT id, name FROM staff
     WHERE role = 'owner' AND active = 1
     ORDER BY created_at, id LIMIT 1`
  ).first();
  if (!actor) return json({ ok: false, error: 'No active owner is available to record this import.' }, 409);

  const modelResult = await env.DB.prepare(
    `SELECT mm.id, mm.model_name, mk.name AS make_name
     FROM machine_models mm
     JOIN machine_makes mk ON mk.id = mm.make_id
     WHERE mm.active = 1 AND mk.active = 1`
  ).all();
  const modelMap = new Map();
  for (const model of modelResult.results || []) {
    modelMap.set(importModelKey(model.model_name), model);
  }

  const existingResult = await env.DB.prepare(
    `SELECT identity_value AS phone
     FROM customer_identity_keys
     WHERE identity_type = 'phone'
     UNION
     SELECT phone
     FROM customers
     WHERE active = 1 AND record_kind = 'customer' AND phone IS NOT NULL`
  ).all();
  const seenPhones = new Set(
    (existingResult.results || []).map(row => importPhoneKey(row.phone)).filter(Boolean)
  );

  const groups = [];
  const skipped = [];
  let skippedCustomers = 0;
  for (let index = 0; index < sourceCustomers.length; index += 1) {
    try {
      const customer = importCustomerInput(sourceCustomers[index], index);
      const phoneKey = importPhoneKey(customer.phone);
      if (seenPhones.has(phoneKey)) {
        skippedCustomers += 1;
        if (skipped.length < 100) {
          skipped.push({
            index,
            name: customer.name,
            phone: customer.phone,
            reason: 'duplicate_phone'
          });
        }
        continue;
      }
      const group = buildCustomerImportGroup(
        env,
        customer,
        branch,
        actor,
        modelMap
      );
      groups.push(group);
      seenPhones.add(phoneKey);
    } catch (error) {
      skippedCustomers += 1;
      if (skipped.length < 100) {
        skipped.push({
          index,
          name: cleanText(sourceCustomers[index]?.name, 140) || null,
          phone: cleanText(sourceCustomers[index]?.phone, 30) || null,
          reason: errorMessage(error)
        });
      }
    }
  }

  const created = { customers: 0, machines: 0, jobs: 0 };
  let chunkStatements = [];
  let chunkGroups = [];
  const commitChunk = async () => {
    if (!chunkStatements.length) return;
    await env.DB.batch(chunkStatements);
    for (const group of chunkGroups) {
      created.customers += 1;
      created.machines += group.machineCount;
      created.jobs += group.jobCount;
    }
    chunkStatements = [];
    chunkGroups = [];
  };

  try {
    for (const group of groups) {
      if (
        chunkStatements.length &&
        chunkStatements.length + group.statements.length > CUSTOMER_IMPORT_BATCH_STATEMENTS
      ) {
        await commitChunk();
      }
      chunkStatements.push(...group.statements);
      chunkGroups.push(group);
      if (chunkStatements.length >= CUSTOMER_IMPORT_BATCH_STATEMENTS) {
        await commitChunk();
      }
    }
    await commitChunk();
  } catch (error) {
    console.error(JSON.stringify({
      event: 'admin.customer_import_failed',
      branch: branch.code,
      created,
      skippedCustomers,
      error: errorMessage(error)
    }));
    return json({
      ok: false,
      code: 'CUSTOMER_IMPORT_PARTIAL',
      error: 'The import stopped before completion. Retry the same file; existing phone numbers will be skipped safely.',
      branch: branch.code,
      requestedCustomers: sourceCustomers.length,
      createdCustomers: created.customers,
      skippedCustomers,
      createdMachines: created.machines,
      createdJobs: created.jobs,
      skipped
    }, 500);
  }

  console.log(JSON.stringify({
    event: 'admin.customers_imported',
    branch: branch.code,
    actorId: actor.id,
    requestedCustomers: sourceCustomers.length,
    createdCustomers: created.customers,
    skippedCustomers,
    createdMachines: created.machines,
    createdJobs: created.jobs
  }));
  return json({
    ok: true,
    branch: branch.code,
    requestedCustomers: sourceCustomers.length,
    createdCustomers: created.customers,
    skippedCustomers,
    createdMachines: created.machines,
    createdJobs: created.jobs,
    skipped,
    skippedDetailsTruncated: skippedCustomers > skipped.length
  }, 201);
}

function importCustomerInput(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw customerRequestError(`Customer row ${index + 1} must be an object.`);
  }
  const name = boundedText(value.name, 140, `Customer row ${index + 1} name`);
  const phone = normalizeImportPhone(value.phone, `Customer row ${index + 1} phone`);
  const place = boundedText(value.place, 600, `Customer row ${index + 1} place`) || null;
  if (name.length < 2) throw customerRequestError(`Customer row ${index + 1} name is required.`);
  if (!phone) throw customerRequestError(`Customer row ${index + 1} phone is required.`);
  const machines = Array.isArray(value.machines) ? value.machines : [];
  const jobs = Array.isArray(value.jobs) ? value.jobs : [];
  if (machines.length > CUSTOMER_IMPORT_MAX_MACHINES) {
    throw customerRequestError(`Customer row ${index + 1} has too many machines.`);
  }
  if (jobs.length > CUSTOMER_IMPORT_MAX_JOBS) {
    throw customerRequestError(`Customer row ${index + 1} has too many jobs.`);
  }
  return { name, phone, place, machines, jobs, rowNumber: index + 1 };
}

function buildCustomerImportGroup(env, customer, branch, actor, modelMap) {
  const now = new Date().toISOString();
  const customerId = makeId('customer');
  const statements = [
    env.DB.prepare(
      `INSERT INTO customers
        (id, customer_code, customer_type, name, phone, alternate_phone, email,
         address, tax_id, notes, created_at, updated_at, created_branch_id,
         created_by, active, record_kind)
       VALUES (?, ?, 'individual', ?, ?, NULL, NULL, ?, NULL,
         'Imported through owner customer import', ?, ?, ?, ?, 1, 'customer')`
    ).bind(
      customerId,
      makeCustomerCode(),
      customer.name,
      customer.phone,
      customer.place,
      now,
      now,
      branch.id,
      actor.id
    ),
    env.DB.prepare(
      `INSERT INTO customer_identity_keys
        (identity_type, identity_value, customer_id, created_at)
       VALUES ('phone', ?, ?, ?)`
    ).bind(customer.phone, customerId, now)
  ];

  const machineByExactKey = new Map();
  const firstMachineByModel = new Map();
  let machineCount = 0;
  const addMachine = (modelValue, serialValue, source) => {
    const model = importModel(modelValue, modelMap, customer.rowNumber);
    const serial = boundedText(
      serialValue,
      120,
      `Customer row ${customer.rowNumber} machine serial`
    ).toUpperCase() || null;
    const exactKey = `${model.id}|${serial || ''}`;
    if (machineByExactKey.has(exactKey)) return machineByExactKey.get(exactKey);
    if (!serial && firstMachineByModel.has(model.id)) return firstMachineByModel.get(model.id);
    const machineId = makeId('customer_machine');
    const machine = { id: machineId, model, serial };
    statements.push(
      env.DB.prepare(
        `INSERT INTO customer_machines
          (id, customer_id, machine_model_id, display_name, serial_number, notes,
           provisional, active, first_seen_at, last_seen_at, created_by,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?)`
      ).bind(
        machineId,
        customerId,
        model.id,
        model.model_name,
        serial,
        source,
        now,
        now,
        actor.id,
        now,
        now
      ),
      env.DB.prepare(
        `INSERT INTO machine_ownership_history
          (id, machine_id, customer_id, started_at, ended_at,
           transferred_by, note, created_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`
      ).bind(
        makeId('ownership'),
        machineId,
        customerId,
        now,
        actor.id,
        'Imported customer ownership',
        now
      )
    );
    machineByExactKey.set(exactKey, machine);
    if (!firstMachineByModel.has(model.id)) firstMachineByModel.set(model.id, machine);
    machineCount += 1;
    return machine;
  };

  for (const value of customer.machines) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw customerRequestError(`Customer row ${customer.rowNumber} contains an invalid machine.`);
    }
    addMachine(value.model, value.serial, 'Imported from customer machine list');
  }

  let jobCount = 0;
  for (const value of customer.jobs) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw customerRequestError(`Customer row ${customer.rowNumber} contains an invalid job.`);
    }
    const modelName = value.machine_model ?? value.model;
    const model = importModel(modelName, modelMap, customer.rowNumber);
    const serial = boundedText(
      value.machine_serial ?? value.serial,
      120,
      `Customer row ${customer.rowNumber} job serial`
    ).toUpperCase() || null;
    const exactKey = `${model.id}|${serial || ''}`;
    let machine = machineByExactKey.get(exactKey);
    if (!machine && !serial) machine = firstMachineByModel.get(model.id);
    if (!machine) {
      machine = addMachine(model.model_name, serial, 'Created from imported service job');
    }
    const workAttended = boundedText(
      value.work_attended,
      3000,
      `Customer row ${customer.rowNumber} work attended`
    ) || 'Not Mentioned';
    const openedAt = importReceivedDate(value.date_received, customer.rowNumber);
    const importedStatus = boundedText(
      value.status,
      40,
      `Customer row ${customer.rowNumber} job status`
    ).toLowerCase() || null;
    const jobId = makeId('job');
    const eventData = JSON.stringify({
      source: 'owner_customer_import',
      importedStatus,
      originalDateReceived: openedAt.slice(0, 10),
      urgency: 'normal',
      accessories: []
    });
    statements.push(
      env.DB.prepare(
        `INSERT INTO repair_jobs
          (id, work_order, branch_id, customer_id, machine_model_id,
           serial_number, reported_problem, opened_by, opened_at, updated_at,
           customer_machine_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        jobId,
        makeWorkOrder(branch.code),
        branch.id,
        customerId,
        model.id,
        serial,
        workAttended,
        actor.id,
        openedAt,
        openedAt,
        machine.id
      ),
      env.DB.prepare(
        `INSERT INTO work_order_details
          (job_id, customer_name, customer_phone, customer_place,
           machine_description, machine_model_id, serial_number,
           accessories_json, complaint, observation, work_done, assigned_to,
           billing_subtotal, billing_tax, billing_total, billing_note,
           created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, NULL, NULL, NULL,
           NULL, NULL, NULL, NULL, ?, ?, ?)`
      ).bind(
        jobId,
        customer.name,
        customer.phone,
        customer.place,
        model.model_name,
        model.id,
        serial,
        workAttended,
        openedAt,
        openedAt,
        actor.id
      ),
      env.DB.prepare(
        `INSERT INTO job_events
          (id, job_id, event_type, event_data_json, created_by,
           created_at, server_received_at)
         VALUES (?, ?, 'machine_received', ?, ?, ?, ?)`
      ).bind(
        makeId('event'),
        jobId,
        eventData,
        actor.id,
        openedAt,
        now
      )
    );
    jobCount += 1;
  }

  return { statements, machineCount, jobCount };
}

function importModel(value, modelMap, rowNumber) {
  const key = importModelKey(value);
  if (!key) throw customerRequestError(`Customer row ${rowNumber} machine model is required.`);
  const model = modelMap.get(key);
  if (!model) {
    throw customerRequestError(`Customer row ${rowNumber} uses unknown model "${cleanText(value, 120)}".`);
  }
  return model;
}

function importModelKey(value) {
  return cleanText(value, 120).replace(/\s+/g, ' ').toUpperCase();
}

function normalizeImportPhone(value, label) {
  const normalized = normalizePhone(value, label);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, '');
  const canonical = digits.length === 12 && digits.startsWith('91')
    ? digits.slice(2)
    : digits;
  if (!/^\d{10,15}$/.test(canonical)) {
    throw customerRequestError(`${label} must contain 10 to 15 digits.`);
  }
  return canonical;
}

function importPhoneKey(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

function importReceivedDate(value, rowNumber) {
  const date = boundedText(value, 10, `Customer row ${rowNumber} received date`);
  if (!date) return new Date().toISOString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw customerRequestError(`Customer row ${rowNumber} received date must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw customerRequestError(`Customer row ${rowNumber} received date is invalid.`);
  }
  return parsed.toISOString();
}

async function readJsonLimited(request, maxBytes) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) {
    throw customerRequestError(
      'Content-Type must be application/json.',
      415,
      'UNSUPPORTED_MEDIA_TYPE'
    );
  }
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw customerRequestError('Customer import file is too large.', 413, 'IMPORT_TOO_LARGE');
  }
  if (!request.body) throw customerRequestError('JSON body is required.');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw customerRequestError('Customer import file is too large.', 413, 'IMPORT_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw customerRequestError('The customer import JSON is invalid.');
  }
}

function adminImportErrorResponse(error) {
  const status = Number(error?.status);
  return json({
    ok: false,
    code: error?.code || 'INVALID_CUSTOMER_IMPORT',
    error: errorMessage(error)
  }, status >= 400 && status <= 599 ? status : 400);
}

async function login(request, env) {
  const body = await readJson(request);
  const staffId = cleanText(body.staffId, 80);
  const pin = String(body.pin || '');
  if (!staffId || !/^\d{4,8}$/.test(pin)) return json({ ok: false, error: 'Select your name and enter your PIN.' }, 400);

  const staff = await env.DB.prepare(
    'SELECT s.id, s.name, s.role, s.pin_salt, s.pin_hash, b.id AS branch_id, b.code AS branch, b.name AS branch_name FROM staff s JOIN branches b ON b.id = s.branch_id WHERE s.id = ? AND s.active = 1 AND b.active = 1'
  ).bind(staffId).first();

  if (!staff?.pin_hash || !staff?.pin_salt) return json({ ok: false, error: 'Login unavailable for this account.' }, 401);

  const attempt = await env.DB.prepare('SELECT failures, blocked_until FROM auth_attempts WHERE staff_id = ?').bind(staffId).first();
  if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > Date.now()) {
    return json({ ok: false, error: 'Too many attempts. Please wait 15 minutes.' }, 429);
  }

  const suppliedHash = await hashPin(pin, staff.pin_salt);
  if (!safeEqual(suppliedHash, staff.pin_hash)) {
    const failures = Number(attempt?.failures || 0) + 1;
    const blockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await env.DB.prepare(
      'INSERT INTO auth_attempts (staff_id, failures, blocked_until, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(staff_id) DO UPDATE SET failures = excluded.failures, blocked_until = excluded.blocked_until, updated_at = excluded.updated_at'
    ).bind(staffId, failures >= 5 ? 0 : failures, blockedUntil, new Date().toISOString()).run();
    return json({ ok: false, error: failures >= 5 ? 'Too many attempts. Please wait 15 minutes.' : 'Incorrect PIN.' }, failures >= 5 ? 429 : 401);
  }

  await env.DB.prepare('DELETE FROM auth_attempts WHERE staff_id = ?').bind(staffId).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(new Date().toISOString()).run();

  const token = randomToken(32);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  await env.DB.prepare(
    'INSERT INTO sessions (id, staff_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(makeId('session'), staff.id, await sha256(token), expires.toISOString(), now.toISOString(), now.toISOString()).run();

  return json({ ok: true, staff: publicSession(staff) }, 200, { 'Set-Cookie': sessionCookie(token, env) });
}

async function getSession(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const now = new Date().toISOString();
  const session = await env.DB.prepare(
    'SELECT s.id, s.name, s.role, b.id AS branch_id, b.code AS branch, b.name AS branch_name, x.id AS session_id FROM sessions x JOIN staff s ON s.id = x.staff_id JOIN branches b ON b.id = s.branch_id WHERE x.token_hash = ? AND x.expires_at > ? AND s.active = 1 AND b.active = 1'
  ).bind(await sha256(token), now).first();
  if (session) await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(now, session.session_id).run();
  return session || null;
}

function publicSession(staff) {
  return { id: staff.id, name: staff.name, role: staff.role, branchId: staff.branch_id, branch: staff.branch, branchName: staff.branch_name };
}

async function listCustomers(env, url) {
  const query = cleanText(url.searchParams.get('query'), 100);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), 100);
  let result;

  if (query) {
    const like = `%${query}%`;
    result = await env.DB.prepare(
      `SELECT c.id, c.customer_code, c.customer_type, c.name, c.phone, c.alternate_phone,
        c.email, c.address, c.tax_id, c.notes, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM repair_jobs j WHERE j.customer_id = c.id) AS total_visits,
        (SELECT COUNT(DISTINCT e.job_id) FROM job_events e
          JOIN repair_jobs j ON j.id = e.job_id
          WHERE j.customer_id = c.id
            AND e.event_type IN ('repair_completed', 'machine_delivered', 'job_completed', 'job_returned')
        ) AS completed_services
       FROM customers c
       WHERE active = 1 AND record_kind = 'customer'
         AND (name LIKE ? COLLATE NOCASE OR phone LIKE ? OR alternate_phone LIKE ? OR customer_code LIKE ? COLLATE NOCASE)
       ORDER BY c.updated_at DESC
       LIMIT ?`
    ).bind(like, like, like, like, limit).all();
  } else {
    result = await env.DB.prepare(
      `SELECT c.id, c.customer_code, c.customer_type, c.name, c.phone, c.alternate_phone,
        c.email, c.address, c.tax_id, c.notes, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM repair_jobs j WHERE j.customer_id = c.id) AS total_visits,
        (SELECT COUNT(DISTINCT e.job_id) FROM job_events e
          JOIN repair_jobs j ON j.id = e.job_id
          WHERE j.customer_id = c.id
            AND e.event_type IN ('repair_completed', 'machine_delivered', 'job_completed', 'job_returned')
        ) AS completed_services
       FROM customers c
       WHERE active = 1 AND record_kind = 'customer'
       ORDER BY c.updated_at DESC
       LIMIT ?`
    ).bind(limit).all();
  }

  const customers = (result.results || []).map(customer => ({
    ...customer,
    total_visits: Number(customer.total_visits || 0),
    completed_services: Number(customer.completed_services || 0),
    loyal: Number(customer.completed_services || 0) >= 5
  }));
  return json({ ok: true, customers });
}

async function routeCustomerMachinesApi(request, env, url) {
  if (!url.pathname.startsWith('/api/customer-machines')) return null;
  const session = await getSession(request, env);
  if (!session) return json({ ok: false, error: 'Session expired.' }, 401);

  if (url.pathname === '/api/customer-machines' && request.method === 'POST') {
    return createCustomerMachine(request, env, session);
  }
  const transferMatch = url.pathname.match(/^\/api\/customer-machines\/([^/]+)\/owner$/);
  if (transferMatch && request.method === 'PUT') {
    return transferCustomerMachine(request, env, session, decodeURIComponent(transferMatch[1]));
  }
  const machineMatch = url.pathname.match(/^\/api\/customer-machines\/([^/]+)$/);
  if (machineMatch && request.method === 'GET') {
    return getCustomerMachine(env, decodeURIComponent(machineMatch[1]));
  }
  return json({ ok: false, error: 'Machine route not found.' }, 404);
}

async function createCustomerMachine(request, env, session) {
  const body = await readJson(request);
  const customerId = cleanText(body.customerId, 80);
  const displayName = cleanText(body.model ?? body.displayName, 160);
  const serialNumber = cleanText(body.serialNumber, 120).toUpperCase();
  const modelId = cleanText(body.machineModelId, 80) || null;
  const notes = cleanText(body.notes, 1000) || null;
  if (!customerId || !displayName || !serialNumber) {
    return json({ ok: false, error: 'Customer, machine model and serial number are required.' }, 400);
  }
  const [customer, duplicate] = await Promise.all([
    env.DB.prepare(
      `SELECT id FROM customers
       WHERE id = ? AND active = 1 AND record_kind = 'customer'`
    ).bind(customerId).first(),
    env.DB.prepare(
      `SELECT id FROM customer_machines
       WHERE UPPER(serial_number) = ? AND active = 1 LIMIT 1`
    ).bind(serialNumber).first()
  ]);
  if (!customer) return json({ ok: false, error: 'Customer not found.' }, 404);
  if (duplicate) return json({ ok: false, error: 'A machine with this serial number already exists.' }, 409);
  if (modelId) {
    const model = await env.DB.prepare(
      'SELECT id FROM machine_models WHERE id = ? AND active = 1'
    ).bind(modelId).first();
    if (!model) return json({ ok: false, error: 'Machine model not found.' }, 404);
  }

  const now = new Date().toISOString();
  const machineId = makeId('customer_machine');
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO customer_machines
        (id, customer_id, machine_model_id, display_name, serial_number, notes,
         provisional, active, first_seen_at, last_seen_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
    ).bind(
      machineId, customerId, modelId, displayName, serialNumber, notes,
      modelId ? 0 : 1, now, now, session.id, now, now
    ),
    env.DB.prepare(
      `INSERT INTO machine_ownership_history
        (id, machine_id, customer_id, started_at, ended_at, transferred_by, note, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`
    ).bind(makeId('ownership'), machineId, customerId, now, session.id, 'Machine record created', now)
  ]);
  return getCustomerMachine(env, machineId, 201);
}

async function transferCustomerMachine(request, env, session, machineIdValue) {
  const machineId = cleanText(machineIdValue, 80);
  const body = await readJson(request);
  const customerId = cleanText(body.customerId, 80);
  const note = cleanText(body.note, 1000) || 'Ownership transferred';
  if (!customerId) return json({ ok: false, error: 'New customer is required.' }, 400);
  const [machine, customer] = await Promise.all([
    env.DB.prepare(
      `SELECT id, customer_id FROM customer_machines
       WHERE id = ? AND active = 1`
    ).bind(machineId).first(),
    env.DB.prepare(
      `SELECT id FROM customers
       WHERE id = ? AND active = 1 AND record_kind = 'customer'`
    ).bind(customerId).first()
  ]);
  if (!machine) return json({ ok: false, error: 'Machine not found.' }, 404);
  if (!customer) return json({ ok: false, error: 'New customer not found.' }, 404);
  if (machine.customer_id === customerId) {
    return json({ ok: false, error: 'This customer already owns the machine.' }, 409);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE machine_ownership_history
       SET ended_at = ?
       WHERE machine_id = ? AND ended_at IS NULL`
    ).bind(now, machineId),
    env.DB.prepare(
      `INSERT INTO machine_ownership_history
        (id, machine_id, customer_id, started_at, ended_at, transferred_by, note, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`
    ).bind(makeId('ownership'), machineId, customerId, now, session.id, note, now),
    env.DB.prepare(
      `UPDATE customer_machines
       SET customer_id = ?, updated_at = ?
       WHERE id = ? AND active = 1`
    ).bind(customerId, now, machineId)
  ]);
  return getCustomerMachine(env, machineId);
}

async function getCustomerMachine(env, machineIdValue, status = 200) {
  const machineId = cleanText(machineIdValue, 80);
  const [machineResult, jobsResult, partsResult, ownershipResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT cm.id, cm.customer_id, c.name AS customer_name, c.phone AS customer_phone,
        cm.machine_model_id, cm.display_name, cm.serial_number, cm.notes, cm.provisional,
        cm.first_seen_at, cm.last_seen_at, cm.created_at, cm.updated_at,
        mm.model_name, mm.machine_type, mk.name AS make_name
       FROM customer_machines cm
       JOIN customers c ON c.id = cm.customer_id
       LEFT JOIN machine_models mm ON mm.id = cm.machine_model_id
       LEFT JOIN machine_makes mk ON mk.id = mm.make_id
       WHERE cm.id = ? AND cm.active = 1`
    ).bind(machineId),
    env.DB.prepare(
      `SELECT j.id, j.work_order, j.customer_id, c.name AS customer_name,
        j.reported_problem, j.opened_at, j.updated_at,
        (SELECT e.event_type FROM job_events e
          WHERE e.job_id = j.id AND e.event_type <> 'note_added'
          ORDER BY e.created_at DESC, e.id DESC LIMIT 1
        ) AS latest_event_type
       FROM repair_jobs j
       JOIN customers c ON c.id = j.customer_id
       WHERE j.customer_machine_id = ?
       ORDER BY j.opened_at DESC, j.id DESC`
    ).bind(machineId),
    env.DB.prepare(
      `SELECT wp.part_number, wp.item_name, SUM(COALESCE(wp.quantity, 0)) AS total_quantity,
        COUNT(DISTINCT wp.job_id) AS job_count
       FROM work_order_parts wp
       JOIN repair_jobs j ON j.id = wp.job_id
       WHERE j.customer_machine_id = ?
         AND wp.part_number IS NOT NULL AND wp.part_number <> ''
       GROUP BY wp.part_number, wp.item_name
       ORDER BY MAX(wp.created_at) DESC`
    ).bind(machineId),
    env.DB.prepare(
      `SELECT h.id, h.customer_id, c.name AS customer_name, h.started_at, h.ended_at,
        h.note, h.transferred_by, s.name AS transferred_by_name
       FROM machine_ownership_history h
       JOIN customers c ON c.id = h.customer_id
       JOIN staff s ON s.id = h.transferred_by
       WHERE h.machine_id = ?
       ORDER BY h.started_at DESC, h.id DESC`
    ).bind(machineId)
  ]);
  const machine = machineResult.results?.[0];
  if (!machine) return json({ ok: false, error: 'Machine not found.' }, 404);
  const jobs = (jobsResult.results || []).map(job => {
    const jobState = jobStatus(job.latest_event_type);
    return { ...job, status: jobState, status_label: JOB_STATUS_LABELS[jobState] || jobState };
  });
  return json({
    ok: true,
    machine: {
      ...machine,
      jobs,
      parts: partsResult.results || [],
      complaints: jobs.map(job => ({
        job_id: job.id,
        work_order: job.work_order,
        complaint: job.reported_problem,
        opened_at: job.opened_at
      })),
      ownership: ownershipResult.results || []
    }
  }, status);
}

async function getCustomer(env, id) {
  const customer = await getCustomerRecordData(env, cleanText(id, 80));
  if (!customer) return json({ ok: false, error: 'Customer not found.' }, 404);
  return json({ ok: true, customer });
}

async function getCustomerRecordData(env, customerId) {
  const [customerResult, machinesResult, jobsResult, completedResult] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, customer_code, customer_type, name, phone, alternate_phone, email,
        address, tax_id, notes, created_at, updated_at
       FROM customers
       WHERE id = ? AND active = 1 AND record_kind = 'customer'`
    ).bind(customerId),
    env.DB.prepare(
      `SELECT cm.id, cm.customer_id, cm.machine_model_id, cm.display_name, cm.serial_number,
        cm.notes, cm.provisional, cm.first_seen_at, cm.last_seen_at,
        mm.model_name, mm.machine_type, mk.name AS make_name,
        COUNT(j.id) AS repair_count, MAX(j.opened_at) AS last_repair_at
       FROM customer_machines cm
       LEFT JOIN machine_models mm ON mm.id = cm.machine_model_id
       LEFT JOIN machine_makes mk ON mk.id = mm.make_id
       LEFT JOIN repair_jobs j ON j.customer_machine_id = cm.id
       WHERE cm.customer_id = ? AND cm.active = 1
       GROUP BY cm.id
       ORDER BY cm.last_seen_at DESC, cm.display_name`
    ).bind(customerId),
    env.DB.prepare(
      `SELECT j.id, j.work_order, j.customer_machine_id, j.serial_number,
        j.reported_problem, j.opened_at, j.updated_at,
        cm.display_name AS machine_name,
        (SELECT e.event_type FROM job_events e
          WHERE e.job_id = j.id AND e.event_type <> 'note_added'
          ORDER BY e.created_at DESC, e.id DESC LIMIT 1
        ) AS latest_event_type
       FROM repair_jobs j
       LEFT JOIN customer_machines cm ON cm.id = j.customer_machine_id
       WHERE j.customer_id = ?
       ORDER BY j.opened_at DESC, j.id DESC`
    ).bind(customerId),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT e.job_id) AS completed_services
       FROM job_events e
       JOIN repair_jobs j ON j.id = e.job_id
       WHERE j.customer_id = ?
         AND e.event_type IN ('repair_completed', 'machine_delivered', 'job_completed', 'job_returned')`
    ).bind(customerId)
  ]);
  const customer = customerResult.results?.[0];
  if (!customer) return null;
  const jobs = (jobsResult.results || []).map(job => {
    const status = jobStatus(job.latest_event_type);
    return {
      ...job,
      status,
      status_label: JOB_STATUS_LABELS[status] || status
    };
  });
  const completedServices = Number(completedResult.results?.[0]?.completed_services || 0);
  return {
    ...customer,
    machines: machinesResult.results || [],
    jobs,
    total_visits: jobs.length,
    completed_services: completedServices,
    loyal: completedServices >= 5
  };
}

async function listCustomerDocuments(env, id) {
  const customerId = cleanText(id, 80);
  const customer = await env.DB.prepare(
    `SELECT id FROM customers
     WHERE id = ? AND active = 1 AND record_kind = 'customer'`
  ).bind(customerId).first();
  if (!customer) return json({ ok: false, error: 'Customer not found.' }, 404);

  const result = await env.DB.prepare(
    `SELECT d.id, d.doc_type, d.original_filename, d.content_type, d.size_bytes,
      d.checksum_sha256, d.created_at, s.name AS uploaded_by_name
     FROM documents d
     JOIN staff s ON s.id = d.uploaded_by
     WHERE d.customer_id = ?
     ORDER BY d.created_at DESC, d.id DESC`
  ).bind(customerId).all();

  return json({ ok: true, documents: result.results || [] });
}

async function listCustomerCredentials(env, id) {
  const customerId = cleanText(id, 80);
  const customer = await env.DB.prepare(
    `SELECT id FROM customers
     WHERE id = ? AND active = 1 AND record_kind = 'customer'`
  ).bind(customerId).first();
  if (!customer) return json({ ok: false, error: 'Customer not found.' }, 404);

  const result = await env.DB.prepare(
    `SELECT id, service_label, created_at, updated_at
     FROM customer_credentials
     WHERE customer_id = ?
     ORDER BY created_at DESC, id DESC`
  ).bind(customerId).all();
  return json({ ok: true, credentials: result.results || [] });
}

async function revealCustomerCredential(request, env, session, customerIdValue, credentialIdValue) {
  const customerId = cleanText(customerIdValue, 80);
  const credentialId = cleanText(credentialIdValue, 80);
  let body;
  try {
    body = await readJson(request);
  } catch {
    return json({ ok: false, error: 'A JSON body containing your staff PIN is required.' }, 400);
  }
  const pin = String(body.pin || '');
  if (!/^\d{4,8}$/.test(pin)) {
    return json({ ok: false, error: 'Enter your staff PIN.' }, 400);
  }

  const attempt = await env.DB.prepare(
    'SELECT failures, blocked_until FROM auth_attempts WHERE staff_id = ?'
  ).bind(session.id).first();
  if (attempt?.blocked_until && Date.parse(attempt.blocked_until) > Date.now()) {
    return json({ ok: false, error: 'Too many attempts. Please wait 15 minutes.' }, 429);
  }

  const staff = await env.DB.prepare(
    'SELECT pin_salt, pin_hash FROM staff WHERE id = ? AND active = 1'
  ).bind(session.id).first();
  if (!staff?.pin_salt || !staff?.pin_hash || !safeEqual(await hashPin(pin, staff.pin_salt), staff.pin_hash)) {
    const failures = Number(attempt?.failures || 0) + 1;
    const blockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    await env.DB.prepare(
      `INSERT INTO auth_attempts (staff_id, failures, blocked_until, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(staff_id) DO UPDATE SET
         failures = excluded.failures,
         blocked_until = excluded.blocked_until,
         updated_at = excluded.updated_at`
    ).bind(
      session.id,
      failures >= 5 ? 0 : failures,
      blockedUntil,
      new Date().toISOString()
    ).run();
    console.warn(JSON.stringify({
      event: 'customer_credential.reveal_denied',
      staffId: session.id,
      customerId,
      credentialId
    }));
    return json({
      ok: false,
      error: failures >= 5 ? 'Too many attempts. Please wait 15 minutes.' : 'Incorrect PIN.'
    }, failures >= 5 ? 429 : 401);
  }
  await env.DB.prepare('DELETE FROM auth_attempts WHERE staff_id = ?').bind(session.id).run();

  const row = await env.DB.prepare(
    `SELECT cc.id, cc.service_label, cc.encrypted_secret, cc.encryption_iv
     FROM customer_credentials cc
     JOIN customers c ON c.id = cc.customer_id
     WHERE cc.id = ? AND cc.customer_id = ?
       AND c.active = 1 AND c.record_kind = 'customer'`
  ).bind(credentialId, customerId).first();
  if (!row) return json({ ok: false, error: 'Saved login not found.' }, 404);

  let secret;
  try {
    secret = await decryptCustomerCredential(env, row.encrypted_secret, row.encryption_iv);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'customer_credential.decrypt_failed',
      customerId,
      credentialId,
      error: errorMessage(error)
    }));
    return json({ ok: false, error: 'The encrypted login could not be opened.' }, 500);
  }

  console.log(JSON.stringify({
    event: 'customer_credential.revealed',
    staffId: session.id,
    customerId,
    credentialId
  }));
  return json({
    ok: true,
    credential: {
      id: row.id,
      service_label: row.service_label,
      login_id: secret.loginId,
      password: secret.password
    }
  }, 200, { 'Cache-Control': 'private, no-store' });
}

async function downloadCustomerDocument(env, customerIdValue, documentIdValue) {
  if (!env.DOCS) {
    return json({ ok: false, error: 'Customer document storage is not configured.' }, 503);
  }

  const customerId = cleanText(customerIdValue, 80);
  const documentId = cleanText(documentIdValue, 80);
  const document = await env.DB.prepare(
    `SELECT d.r2_key, d.original_filename, d.content_type
     FROM documents d
     JOIN customers c ON c.id = d.customer_id
     WHERE d.id = ? AND d.customer_id = ?
       AND c.active = 1 AND c.record_kind = 'customer'`
  ).bind(documentId, customerId).first();
  if (!document) return json({ ok: false, error: 'Document not found.' }, 404);

  const object = await env.DOCS.get(document.r2_key);
  if (!object || !object.body) {
    console.error(JSON.stringify({
      event: 'customer_document.missing_object',
      customerId,
      documentId,
      r2Key: document.r2_key
    }));
    return json({ ok: false, error: 'The document record exists, but the stored file is unavailable.' }, 410);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', document.content_type || 'application/octet-stream');
  headers.set('Content-Disposition', contentDisposition(document.original_filename));
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}

async function listCustomerMachines(env, id) {
  const customerId = cleanText(id, 80);
  const customer = await env.DB.prepare(
    `SELECT id FROM customers
     WHERE id = ? AND active = 1 AND record_kind = 'customer'`
  ).bind(customerId).first();
  if (!customer) return json({ ok: false, error: 'Customer not found.' }, 404);
  const result = await env.DB.prepare(
    `SELECT cm.id, cm.customer_id, cm.machine_model_id, cm.display_name, cm.serial_number,
      cm.notes, cm.provisional, cm.first_seen_at, cm.last_seen_at,
      mm.model_name, mm.machine_type, mk.name AS make_name,
      COUNT(j.id) AS repair_count, MAX(j.opened_at) AS last_repair_at
     FROM customer_machines cm
     LEFT JOIN machine_models mm ON mm.id = cm.machine_model_id
     LEFT JOIN machine_makes mk ON mk.id = mm.make_id
     LEFT JOIN repair_jobs j ON j.customer_machine_id = cm.id
     WHERE cm.customer_id = ? AND cm.active = 1
     GROUP BY cm.id
     ORDER BY cm.last_seen_at DESC, cm.display_name`
  ).bind(customerId).all();
  return json({ ok: true, machines: result.results || [] });
}

async function createCustomer(request, env, session) {
  let parsed;
  try {
    parsed = await parseCustomerRequest(request);
  } catch (error) {
    return customerRequestErrorResponse(error);
  }

  const { input, documents, credential } = parsed;
  const validation = validateCustomer(input);
  if (validation) return json({ ok: false, error: validation }, 400);
  if (credential && !hasRole(session, 'manager', 'owner')) {
    return json({ ok: false, error: 'Manager access is required to save applicant login details.' }, 403);
  }

  const duplicate = await findDuplicateCustomer(env, input);
  if (duplicate) {
    return duplicateCustomerResponse(duplicate);
  }

  const now = new Date().toISOString();
  const customer = {
    id: makeId('customer'),
    customerCode: makeCustomerCode(),
    ...input,
    createdAt: now,
    updatedAt: now
  };

  let uploadedDocuments = [];
  try {
    uploadedDocuments = await uploadCustomerDocuments(env, customer, session, documents, now);
    const encryptedCredential = credential
      ? await encryptCustomerCredential(env, customer.id, session.id, credential, now)
      : null;
    const statements = [
      env.DB.prepare(
        `INSERT INTO customers
          (id, customer_code, customer_type, name, phone, alternate_phone, email, address,
           tax_id, notes, created_at, updated_at, created_branch_id, created_by, active, record_kind)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'customer')`
      ).bind(
        customer.id, customer.customerCode, customer.customerType, customer.name, customer.phone,
        customer.alternatePhone, customer.email, customer.address, customer.taxId, customer.notes,
        now, now, session.branch_id, session.id
      ),
      ...customerIdentityStatements(env, customer, now),
      ...customerDocumentStatements(env, customer.id, uploadedDocuments),
      ...(encryptedCredential ? [customerCredentialStatement(env, encryptedCredential)] : [])
    ];
    await env.DB.batch(statements);
  } catch (error) {
    await cleanupCustomerDocuments(env, uploadedDocuments);
    if (Number(error?.status) >= 400 && Number(error?.status) <= 599) {
      return customerRequestErrorResponse(error);
    }
    if (isIdentityConflict(error)) {
      const concurrentDuplicate = await findDuplicateCustomer(env, input);
      if (concurrentDuplicate) return duplicateCustomerResponse(concurrentDuplicate);
    }
    console.error(JSON.stringify({
      event: 'customer.create_failed',
      error: errorMessage(error),
      documentCount: documents.length
    }));
    return json({
      ok: false,
      code: 'CUSTOMER_CREATE_FAILED',
      error: 'The customer could not be saved. No customer record or document metadata was committed.'
    }, 500);
  }

  console.log(JSON.stringify({
    event: 'customer.created',
    customerId: customer.id,
    customerCode: customer.customerCode,
    branchId: session.branch_id,
    documentCount: uploadedDocuments.length
  }));
  const customerRecord = await getCustomerRecordData(env, customer.id);
  return json({
    ok: true,
    customer: customerRecord || {
      ...publicCustomer(customer),
      machines: [],
      jobs: [],
      total_visits: 0,
      completed_services: 0,
      loyal: false
    },
    documents: uploadedDocuments.map(publicCustomerDocument)
  }, 201);
}

async function updateCustomer(request, env, session, id) {
  const customerId = cleanText(id, 80);
  const existing = await env.DB.prepare(
    `SELECT id, customer_code, created_at
     FROM customers WHERE id = ? AND active = 1 AND record_kind = 'customer'`
  ).bind(customerId).first();
  if (!existing) return json({ ok: false, error: 'Customer not found.' }, 404);

  let parsed;
  try {
    parsed = await parseCustomerRequest(request);
  } catch (error) {
    return customerRequestErrorResponse(error);
  }

  const { input, documents, credential } = parsed;
  const validation = validateCustomer(input);
  if (validation) return json({ ok: false, error: validation }, 400);
  if (credential && !hasRole(session, 'manager', 'owner')) {
    return json({ ok: false, error: 'Manager access is required to save applicant login details.' }, 403);
  }

  const duplicate = await findDuplicateCustomer(env, input, customerId);
  if (duplicate) {
    return duplicateCustomerResponse(duplicate);
  }

  const updatedAt = new Date().toISOString();
  const customer = {
    id: customerId,
    customerCode: existing.customer_code,
    createdAt: existing.created_at,
    updatedAt,
    ...input
  };

  let uploadedDocuments = [];
  try {
    uploadedDocuments = await uploadCustomerDocuments(env, customer, session, documents, updatedAt);
    const encryptedCredential = credential
      ? await encryptCustomerCredential(env, customerId, session.id, credential, updatedAt)
      : null;
    const statements = [
      env.DB.prepare(
        `UPDATE customers SET
          customer_type = ?, name = ?, phone = ?, alternate_phone = ?, email = ?,
          address = ?, tax_id = ?, notes = ?, updated_at = ?
         WHERE id = ? AND active = 1 AND record_kind = 'customer'`
      ).bind(
        input.customerType, input.name, input.phone, input.alternatePhone, input.email,
        input.address, input.taxId, input.notes, updatedAt, customerId
      ),
      env.DB.prepare('DELETE FROM customer_identity_keys WHERE customer_id = ?').bind(customerId),
      ...customerIdentityStatements(env, customer, updatedAt),
      ...customerDocumentStatements(env, customerId, uploadedDocuments),
      ...(encryptedCredential ? [customerCredentialStatement(env, encryptedCredential)] : [])
    ];
    await env.DB.batch(statements);
  } catch (error) {
    await cleanupCustomerDocuments(env, uploadedDocuments);
    if (Number(error?.status) >= 400 && Number(error?.status) <= 599) {
      return customerRequestErrorResponse(error);
    }
    if (isIdentityConflict(error)) {
      const concurrentDuplicate = await findDuplicateCustomer(env, input, customerId);
      if (concurrentDuplicate) return duplicateCustomerResponse(concurrentDuplicate);
    }
    console.error(JSON.stringify({
      event: 'customer.update_failed',
      customerId,
      error: errorMessage(error),
      documentCount: documents.length
    }));
    return json({
      ok: false,
      code: 'CUSTOMER_UPDATE_FAILED',
      error: 'The customer changes could not be saved. Existing customer data remains unchanged.'
    }, 500);
  }

  console.log(JSON.stringify({
    event: 'customer.updated',
    customerId,
    customerCode: existing.customer_code,
    documentCount: uploadedDocuments.length
  }));
  const customerRecord = await getCustomerRecordData(env, customerId);
  return json({
    ok: true,
    customer: customerRecord || publicCustomer(customer),
    documents: uploadedDocuments.map(publicCustomerDocument)
  });
}

function customerInput(body) {
  if (!body || typeof body !== 'object') throw customerRequestError('Customer details are required.');
  return {
    customerType: boundedText(body.customerType ?? body.customer_type, 20, 'Customer type').toLowerCase() || 'individual',
    name: boundedText(body.name, 140, 'Customer name'),
    phone: normalizePhone(body.phone ?? body.mobile_number, 'Phone'),
    alternatePhone: normalizePhone(body.alternatePhone ?? body.alternate_phone, 'Alternate phone'),
    email: boundedText(body.email, 180, 'Email').toLowerCase() || null,
    address: boundedText(body.address, 600, 'Address') || null,
    taxId: boundedText(body.taxId ?? body.tax_id, 30, 'GSTIN / Tax ID').toUpperCase() || null,
    notes: boundedText(body.notes, 1000, 'Notes') || null
  };
}

function validateCustomer(customer) {
  if (!['individual', 'business'].includes(customer.customerType)) return 'Customer type must be individual or business.';
  if (!customer.name || customer.name.length < 2) return 'Customer name must contain at least 2 characters.';
  if (!customer.phone) return 'Customer phone is required.';
  if (customer.phone && !/^\+?\d{10,15}$/.test(customer.phone)) return 'Enter a valid phone number or leave it blank.';
  if (customer.alternatePhone && !/^\+?\d{10,15}$/.test(customer.alternatePhone)) return 'Enter a valid alternate phone number or leave it blank.';
  if (customer.phone && customer.alternatePhone && customer.phone === customer.alternatePhone) return 'Alternate phone must be different from the primary phone.';
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return 'Enter a valid email address or leave it blank.';
  if (customer.taxId && !/^[A-Z0-9 -]+$/.test(customer.taxId)) return 'GSTIN / Tax ID contains unsupported characters.';
  return null;
}

function makeCustomerCode() {
  const year = new Date().getUTCFullYear();
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  return `CUS-${year}-${suffix}`;
}

function publicCustomer(customer) {
  return {
    id: customer.id,
    customer_code: customer.customerCode ?? customer.customer_code,
    customer_type: customer.customerType ?? customer.customer_type,
    name: customer.name,
    phone: customer.phone,
    alternate_phone: customer.alternatePhone ?? customer.alternate_phone,
    email: customer.email,
    address: customer.address,
    tax_id: customer.taxId ?? customer.tax_id,
    notes: customer.notes,
    created_at: customer.createdAt ?? customer.created_at,
    updated_at: customer.updatedAt ?? customer.updated_at
  };
}

async function parseCustomerRequest(request) {
  const contentType = (request.headers.get('Content-Type') || '').toLowerCase();
  let body;
  let documents = [];
  let credentialBody = null;

  if (contentType.includes('multipart/form-data')) {
    let formData;
    try {
      formData = await request.formData();
    } catch {
      throw customerRequestError('The multipart form data could not be read.');
    }
    body = {
      customerType: formData.get('customerType') ?? formData.get('customer_type'),
      name: formData.get('name'),
      phone: formData.get('phone') ?? formData.get('mobile_number'),
      alternatePhone: formData.get('alternatePhone') ?? formData.get('alternate_phone'),
      email: formData.get('email'),
      address: formData.get('address'),
      taxId: formData.get('taxId') ?? formData.get('tax_id'),
      notes: formData.get('notes')
    };
    credentialBody = {
      service: formData.get('credentialService'),
      loginId: formData.get('credentialLogin'),
      password: formData.get('credentialPassword')
    };
    documents = extractCustomerDocuments(formData);
  } else if (contentType.includes('application/json')) {
    try {
      body = await request.json();
      credentialBody = body.credential || null;
    } catch {
      throw customerRequestError('The JSON request body is invalid.');
    }
  } else {
    throw customerRequestError('Content-Type must be application/json or multipart/form-data.', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }

  return {
    input: customerInput(body),
    documents,
    credential: customerCredentialInput(credentialBody)
  };
}

function customerCredentialInput(body) {
  if (!body || typeof body !== 'object') return null;
  const service = boundedText(body.service ?? body.serviceLabel, 100, 'Portal / scheme');
  const loginId = boundedText(body.loginId ?? body.login_id, 300, 'Login ID');
  const password = boundedText(body.password, 500, 'Password');
  if (!service && !loginId && !password) return null;
  if (!service || !loginId || !password) {
    throw customerRequestError('Portal / scheme, Login ID and Password are all required when saving applicant access.');
  }
  return { service, loginId, password };
}

function extractCustomerDocuments(formData) {
  const documents = [];
  let totalBytes = 0;

  for (const definition of CUSTOMER_DOCUMENT_FIELDS) {
    for (const value of formData.getAll(definition.field)) {
      if (!isUploadedFile(value) || value.size === 0) continue;
      if (value.size > CUSTOMER_DOCUMENT_MAX_BYTES) {
        throw customerRequestError(`${definition.label} must be 10 MB or smaller.`, 413, 'DOCUMENT_TOO_LARGE');
      }
      if (!value.name || value.name.length > 180) {
        throw customerRequestError(`${definition.label} must have a valid filename.`);
      }
      totalBytes += value.size;
      documents.push({ ...definition, file: value });
    }
  }

  if (documents.length > CUSTOMER_DOCUMENT_MAX_FILES) {
    throw customerRequestError(`Upload no more than ${CUSTOMER_DOCUMENT_MAX_FILES} documents at once.`, 413, 'TOO_MANY_DOCUMENTS');
  }
  if (totalBytes > CUSTOMER_DOCUMENT_TOTAL_MAX_BYTES) {
    throw customerRequestError('The combined document upload must be 25 MB or smaller.', 413, 'DOCUMENTS_TOO_LARGE');
  }
  return documents;
}

function isUploadedFile(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof value.arrayBuffer === 'function' &&
    Number.isFinite(value.size)
  );
}

async function uploadCustomerDocuments(env, customer, session, documents, createdAt) {
  if (!documents.length) return [];
  if (!env.DOCS) {
    throw customerRequestError('Customer document storage is not configured.', 503, 'DOCUMENT_STORAGE_UNAVAILABLE');
  }

  const uploaded = [];
  try {
    for (const document of documents) {
      const buffer = await document.file.arrayBuffer();
      const detectedType = detectDocumentContentType(buffer);
      if (!detectedType) {
        throw customerRequestError(
          `${document.label} must be a PDF, JPEG, PNG, or WebP file.`,
          415,
          'INVALID_DOCUMENT_TYPE'
        );
      }
      const claimedType = String(document.file.type || '').toLowerCase();
      if (claimedType && claimedType !== 'application/octet-stream' && claimedType !== detectedType) {
        throw customerRequestError(`${document.label} content does not match its declared file type.`);
      }

      const id = makeId('document');
      const filename = safeDocumentFilename(document.file.name);
      const r2Key = `customers/${customer.customerCode}/${document.type}/${id}-${filename}`;
      const checksum = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)));
      const stored = await env.DOCS.put(r2Key, buffer, {
        httpMetadata: {
          contentType: detectedType,
          contentDisposition: contentDisposition(filename)
        }
      });
      if (!stored) throw new Error('R2 rejected the document upload.');

      uploaded.push({
        id,
        customerId: customer.id,
        r2Key,
        originalFilename: filename,
        docType: document.type,
        contentType: detectedType,
        sizeBytes: document.file.size,
        checksumSha256: checksum,
        r2Etag: stored.etag || null,
        uploadedBy: session.id,
        createdAt
      });
    }
    return uploaded;
  } catch (error) {
    await cleanupCustomerDocuments(env, uploaded);
    throw error;
  }
}

function detectDocumentContentType(buffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16));
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'image/webp';
  return null;
}

function customerDocumentStatements(env, customerId, documents) {
  return documents.map(document => env.DB.prepare(
    `INSERT INTO documents
      (id, customer_id, r2_key, original_filename, doc_type, content_type,
       size_bytes, checksum_sha256, r2_etag, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    document.id, customerId, document.r2Key, document.originalFilename, document.docType,
    document.contentType, document.sizeBytes, document.checksumSha256, document.r2Etag,
    document.uploadedBy, document.createdAt
  ));
}

async function encryptCustomerCredential(env, customerId, staffId, credential, timestamp) {
  const key = await customerCredentialKey(env);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify({
    loginId: credential.loginId,
    password: credential.password
  }));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    id: makeId('credential'),
    customerId,
    serviceLabel: credential.service,
    encryptedSecret: bytesToBase64(new Uint8Array(encrypted)),
    encryptionIv: bytesToBase64(iv),
    createdBy: staffId,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

async function decryptCustomerCredential(env, encryptedSecret, encryptionIv) {
  const key = await customerCredentialKey(env);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(encryptionIv) },
    key,
    base64ToBytes(encryptedSecret)
  );
  const value = JSON.parse(new TextDecoder().decode(decrypted));
  if (!value || typeof value.loginId !== 'string' || typeof value.password !== 'string') {
    throw new Error('Decrypted credential has an invalid format.');
  }
  return value;
}

async function customerCredentialKey(env) {
  const encoded = String(env.CUSTOMER_CREDENTIALS_KEY || '');
  if (!encoded) {
    throw customerRequestError(
      'Encrypted applicant-login storage is not configured.',
      503,
      'CREDENTIAL_STORAGE_UNAVAILABLE'
    );
  }
  let raw;
  try {
    raw = base64ToBytes(encoded);
  } catch {
    throw new Error('CUSTOMER_CREDENTIALS_KEY is not valid base64.');
  }
  if (raw.byteLength !== 32) throw new Error('CUSTOMER_CREDENTIALS_KEY must contain 32 bytes.');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function customerCredentialStatement(env, credential) {
  return env.DB.prepare(
    `INSERT INTO customer_credentials
      (id, customer_id, service_label, encrypted_secret, encryption_iv,
       created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    credential.id,
    credential.customerId,
    credential.serviceLabel,
    credential.encryptedSecret,
    credential.encryptionIv,
    credential.createdBy,
    credential.createdAt,
    credential.updatedAt
  );
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  const decoded = atob(String(value || ''));
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

async function cleanupCustomerDocuments(env, documents) {
  if (!env.DOCS || !documents.length) return;
  const keys = documents.map(document => document.r2Key).filter(Boolean);
  if (!keys.length) return;
  try {
    await env.DOCS.delete(keys);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'customer_document.cleanup_failed',
      objectCount: keys.length,
      error: errorMessage(error)
    }));
  }
}

function publicCustomerDocument(document) {
  return {
    id: document.id,
    doc_type: document.docType,
    original_filename: document.originalFilename,
    content_type: document.contentType,
    size_bytes: document.sizeBytes,
    checksum_sha256: document.checksumSha256,
    created_at: document.createdAt
  };
}

function customerIdentityEntries(customer) {
  const entries = [
    customer.phone ? { type: 'phone', value: customer.phone, label: 'phone number' } : null,
    customer.alternatePhone ? { type: 'phone', value: customer.alternatePhone, label: 'phone number' } : null,
    customer.email ? { type: 'email', value: customer.email, label: 'email address' } : null,
    customer.taxId ? { type: 'tax_id', value: customer.taxId, label: 'GSTIN / Tax ID' } : null
  ].filter(Boolean);
  return entries.filter((entry, index) => entries.findIndex(
    candidate => candidate.type === entry.type && candidate.value === entry.value
  ) === index);
}

function customerIdentityStatements(env, customer, createdAt) {
  return customerIdentityEntries(customer).map(identity => env.DB.prepare(
    `INSERT INTO customer_identity_keys
      (identity_type, identity_value, customer_id, created_at)
     VALUES (?, ?, ?, ?)`
  ).bind(identity.type, identity.value, customer.id, createdAt));
}

async function findDuplicateCustomer(env, customer, excludeCustomerId = null) {
  for (const identity of customerIdentityEntries(customer)) {
    const duplicate = await env.DB.prepare(
      `SELECT c.id, c.customer_code, c.customer_type, c.name, c.phone, c.alternate_phone,
        c.email, c.address, c.tax_id, c.notes, c.created_at, c.updated_at
       FROM customer_identity_keys k
       JOIN customers c ON c.id = k.customer_id
       WHERE k.identity_type = ? AND k.identity_value = ?
         AND c.active = 1 AND c.record_kind = 'customer'
         AND (? IS NULL OR c.id <> ?)
       LIMIT 1`
    ).bind(identity.type, identity.value, excludeCustomerId, excludeCustomerId).first();
    if (duplicate) return { customer: duplicate, field: identity.type, label: identity.label };
  }
  return null;
}

function duplicateCustomerResponse(duplicate) {
  return json({
    ok: false,
    code: 'CUSTOMER_DUPLICATE',
    error: `This ${duplicate.label} already belongs to ${duplicate.customer.name}.`,
    duplicateField: duplicate.field,
    existingCustomer: duplicate.customer
  }, 409);
}

function isIdentityConflict(error) {
  const message = errorMessage(error).toLowerCase();
  return message.includes('customer_identity_keys') && message.includes('unique');
}

function normalizePhone(value, label) {
  const raw = boundedText(value, 30, label);
  if (!raw) return null;
  if (!/^\+?[\d\s().-]+$/.test(raw)) {
    throw customerRequestError(`${label} contains unsupported characters.`);
  }
  const digits = raw.replace(/\D/g, '');
  return (raw.startsWith('+') ? '+' : '') + digits;
}

function cleanPhone(value) {
  const phone = String(value || '').replace(/[^\d+]/g, '').slice(0, 16);
  return phone || null;
}

function boundedText(value, max, label) {
  if (value == null) return '';
  if (typeof value !== 'string') throw customerRequestError(`${label} must be text.`);
  const text = value.trim().replace(/[\u0000-\u001f\u007f]/g, '');
  if (text.length > max) throw customerRequestError(`${label} must be ${max} characters or fewer.`);
  return text;
}

function safeDocumentFilename(value) {
  const filename = String(value || 'document')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return filename || 'document';
}

function contentDisposition(filename) {
  const safeAscii = safeDocumentFilename(filename).replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function customerRequestError(message, status = 400, code = 'INVALID_CUSTOMER_INPUT') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function customerRequestErrorResponse(error) {
  const status = Number(error?.status);
  return json({
    ok: false,
    code: error?.code || 'INVALID_CUSTOMER_INPUT',
    error: errorMessage(error)
  }, status >= 400 && status <= 599 ? status : 400);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

async function listBranches(env, session) {
  let result;
  if (hasRole(session, 'owner')) {
    result = await env.DB.prepare(
      `SELECT id, code, name, address_line_1, address_line_2, city, state, postal_code, phone, active, created_at, updated_at
       FROM branches ORDER BY active DESC, name`
    ).all();
  } else {
    result = await env.DB.prepare(
      `SELECT id, code, name, address_line_1, address_line_2, city, state, postal_code, phone, active, created_at, updated_at
       FROM branches WHERE id = ?`
    ).bind(session.branch_id).all();
  }
  return json({ ok: true, branches: result.results || [] });
}

async function createBranch(request, env) {
  const input = branchInput(await readJson(request));
  const validation = validateBranch(input);
  if (validation) return json({ ok: false, error: validation }, 400);

  const duplicate = await env.DB.prepare('SELECT id FROM branches WHERE code = ? COLLATE NOCASE LIMIT 1').bind(input.code).first();
  if (duplicate) return json({ ok: false, error: 'That branch code already exists.' }, 409);

  const now = new Date().toISOString();
  const branch = { id: makeId('branch'), ...input, active: 1, created_at: now, updated_at: now };
  await env.DB.prepare(
    `INSERT INTO branches
      (id, code, name, address_line_1, address_line_2, city, state, postal_code, phone, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).bind(
    branch.id, branch.code, branch.name, branch.address_line_1, branch.address_line_2,
    branch.city, branch.state, branch.postal_code, branch.phone, now, now
  ).run();
  return json({ ok: true, branch }, 201);
}

async function updateBranch(request, env, session, id) {
  const branchId = cleanText(id, 80);
  const existing = await env.DB.prepare('SELECT id, code FROM branches WHERE id = ?').bind(branchId).first();
  if (!existing) return json({ ok: false, error: 'Branch not found.' }, 404);
  if (!hasRole(session, 'owner') && session.branch_id !== branchId) {
    return json({ ok: false, error: 'Managers can only update their own branch.' }, 403);
  }

  const input = branchInput(await readJson(request));
  const validation = validateBranch(input);
  if (validation) return json({ ok: false, error: validation }, 400);

  const duplicate = await env.DB.prepare(
    'SELECT id FROM branches WHERE code = ? COLLATE NOCASE AND id <> ? LIMIT 1'
  ).bind(input.code, branchId).first();
  if (duplicate) return json({ ok: false, error: 'That branch code already exists.' }, 409);

  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE branches SET code = ?, name = ?, address_line_1 = ?, address_line_2 = ?,
      city = ?, state = ?, postal_code = ?, phone = ?, updated_at = ? WHERE id = ?`
  ).bind(
    input.code, input.name, input.address_line_1, input.address_line_2, input.city,
    input.state, input.postal_code, input.phone, updatedAt, branchId
  ).run();

  const branch = await env.DB.prepare(
    `SELECT id, code, name, address_line_1, address_line_2, city, state, postal_code, phone, active, created_at, updated_at
     FROM branches WHERE id = ?`
  ).bind(branchId).first();
  return json({ ok: true, branch });
}

function branchInput(body) {
  return {
    code: cleanText(body.code, 12).toUpperCase(),
    name: cleanText(body.name, 120),
    address_line_1: cleanText(body.addressLine1, 180) || null,
    address_line_2: cleanText(body.addressLine2, 180) || null,
    city: cleanText(body.city, 100) || null,
    state: cleanText(body.state, 100) || null,
    postal_code: cleanText(body.postalCode, 12) || null,
    phone: cleanPhone(body.phone)
  };
}

function validateBranch(branch) {
  if (!branch.code || !/^[A-Z0-9_-]{2,12}$/.test(branch.code)) return 'Enter a 2–12 character branch code using letters or numbers.';
  if (!branch.name) return 'Branch name is required.';
  if (branch.phone && branch.phone.length < 10) return 'Enter a valid branch phone number or leave it blank.';
  return null;
}

function hasRole(session, ...roles) {
  return roles.includes(String(session?.role || '').toLowerCase());
}

async function listMachineCatalog(env) {
  const makes = await env.DB.prepare(
    'SELECT id, name, active FROM machine_makes WHERE active = 1 ORDER BY name'
  ).all();
  const models = await env.DB.prepare(
    `SELECT m.id, m.make_id, k.name AS make_name, m.model_name, m.machine_type, m.specifications_json, m.active
     FROM machine_models m JOIN machine_makes k ON k.id = m.make_id
     WHERE m.active = 1 AND k.active = 1 ORDER BY k.name, m.model_name`
  ).all();
  return json({ ok: true, makes: makes.results || [], models: models.results || [] });
}

async function createMachineMake(request, env) {
  const body = await readJson(request);
  const name = cleanText(body.name, 100);
  if (!name) return json({ ok: false, error: 'Manufacturer name is required.' }, 400);
  const duplicate = await env.DB.prepare(
    'SELECT id FROM machine_makes WHERE name = ? COLLATE NOCASE LIMIT 1'
  ).bind(name).first();
  if (duplicate) return json({ ok: false, error: 'That manufacturer already exists.' }, 409);
  const make = { id: makeId('make'), name, active: 1 };
  await env.DB.prepare('INSERT INTO machine_makes (id, name, active) VALUES (?, ?, 1)').bind(make.id, make.name).run();
  return json({ ok: true, make }, 201);
}

async function createMachineModel(request, env) {
  const body = await readJson(request);
  const makeId = cleanText(body.makeId, 80);
  const modelName = cleanText(body.modelName, 120);
  const machineType = cleanText(body.machineType, 100);
  const notes = cleanText(body.specificationNotes, 1500);
  if (!makeId || !modelName || !machineType) {
    return json({ ok: false, error: 'Manufacturer, model name and machine type are required.' }, 400);
  }
  const make = await env.DB.prepare('SELECT id, name FROM machine_makes WHERE id = ? AND active = 1').bind(makeId).first();
  if (!make) return json({ ok: false, error: 'Manufacturer not found.' }, 404);
  const duplicate = await env.DB.prepare(
    'SELECT id FROM machine_models WHERE make_id = ? AND model_name = ? COLLATE NOCASE LIMIT 1'
  ).bind(makeId, modelName).first();
  if (duplicate) return json({ ok: false, error: 'That model already exists for this manufacturer.' }, 409);
  const model = {
    id: makeIdFromModel(),
    make_id: makeId,
    make_name: make.name,
    model_name: modelName,
    machine_type: machineType,
    specifications_json: notes ? JSON.stringify({ notes }) : null,
    active: 1
  };
  await env.DB.prepare(
    'INSERT INTO machine_models (id, make_id, model_name, machine_type, specifications_json, active) VALUES (?, ?, ?, ?, ?, 1)'
  ).bind(model.id, model.make_id, model.model_name, model.machine_type, model.specifications_json).run();
  return json({ ok: true, model }, 201);
}

function makeIdFromModel() {
  return makeId('model');
}

const CATALOG_TYPES = new Set(['machine', 'accessory', 'part', 'service']);

async function listCatalogItems(env, url) {
  const query = cleanText(url.searchParams.get('query'), 120);
  const type = cleanText(url.searchParams.get('type'), 20).toLowerCase();
  const reviewOnly = url.searchParams.get('review') === '1';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 80, 1), 200);
  const conditions = ['active = 1'];
  const values = [];
  if (query) {
    conditions.push('(part_number LIKE ? COLLATE NOCASE OR item_name LIKE ? COLLATE NOCASE OR hsn_sac LIKE ? COLLATE NOCASE)');
    const like = `%${query}%`;
    values.push(like, like, like);
  }
  if (type && CATALOG_TYPES.has(type)) {
    conditions.push('item_type = ?');
    values.push(type);
  }
  if (reviewOnly) conditions.push('review_required = 1');
  values.push(limit);
  const result = await env.DB.prepare(
    `SELECT id, part_number, item_name, item_type, hsn_sac, gst_rate, retail_price, mrp,
      details_json, data_source, review_required, active, created_at, updated_at
     FROM catalog_items WHERE ${conditions.join(' AND ')}
     ORDER BY review_required DESC, item_name LIMIT ?`
  ).bind(...values).all();
  const localItems = (result.results || []).map(item => ({
    ...item,
    tagro_name: item.item_name,
    stihl_name: item.item_name
  }));
  if (reviewOnly || type === 'service' || !env.TAGRO_DATA || localItems.length >= limit) {
    return json({ ok: true, items: localItems, source: { local: localItems.length, official: 0 } });
  }

  const master = await env.TAGRO_DATA.get('parts:master', { type: 'json' });
  if (!Array.isArray(master)) {
    return json({ ok: true, items: localItems, source: { local: localItems.length, official: 0 } });
  }
  const existingPartNumbers = new Set(localItems.map(item => normalizePartNumber(item.part_number)));
  const officialItems = [];
  for (const part of master) {
    const itemType = catalogTypeFromGroup(part?.group);
    if (type && CATALOG_TYPES.has(type) && itemType !== type) continue;
    const partNumber = cleanText(part?.no || part?.id, 100).toUpperCase();
    const tagroName = cleanText(part?.tagroName || part?.name, 240);
    const stihlName = cleanText(part?.stihlName || part?.name, 240);
    const itemName = tagroName || stihlName;
    const hsnSac = cleanText(part?.hsn, 30).toUpperCase();
    if (!partNumber || !itemName || !hsnSac) continue;
    const aliases = Array.isArray(part?.aliases)
      ? cleanStringList(part.aliases, 20, 240)
      : cleanStringList(String(part?.alias || '').split(','), 20, 240);
    const score = query
      ? flexiblePartScore(query, {
          partNumber,
          tagroName,
          stihlName,
          aliases,
          modelGroup: part?.modelGroup,
          models: part?.models
        })
      : 0;
    if (query && score < 0) continue;
    const normalized = normalizePartNumber(partNumber);
    if (existingPartNumbers.has(normalized)) continue;
    existingPartNumbers.add(normalized);
    officialItems.push({
      id: `official:${partNumber}`,
      part_number: partNumber,
      item_name: itemName,
      tagro_name: tagroName || null,
      stihl_name: stihlName,
      item_type: itemType,
      hsn_sac: hsnSac,
      gst_rate: optionalNumber(part?.gst) ?? 0,
      retail_price: optionalNumber(part?.price),
      mrp: optionalNumber(part?.mrp),
      details_json: JSON.stringify({
        source: cleanText(part?.source, 120) || 'Official STIHL price list',
        effectiveDate: cleanText(part?.effectiveDate, 20) || null
      }),
      data_source: 'official_price_list',
      review_required: part?.reviewRequired ? 1 : 0,
      active: 1,
      read_only: 1,
      created_at: cleanText(part?.effectiveDate, 20) || null,
      updated_at: cleanText(part?.effectiveDate, 20) || null,
      _score: score
    });
    if (!query && localItems.length + officialItems.length >= limit) break;
  }
  officialItems.sort((a, b) => Number(b._score || 0) - Number(a._score || 0) ||
    String(a.stihl_name || a.item_name).localeCompare(String(b.stihl_name || b.item_name)));
  const visibleOfficialItems = officialItems
    .slice(0, Math.max(0, limit - localItems.length))
    .map(item => {
      const { _score, ...publicItem } = item;
      return publicItem;
    });
  return json({
    ok: true,
    items: [...localItems, ...visibleOfficialItems],
    source: {
      local: localItems.length,
      official: visibleOfficialItems.length,
      officialMatches: officialItems.length,
      officialTotal: master.length
    }
  });
}

function catalogTypeFromGroup(group) {
  const value = cleanText(group, 40).toLowerCase();
  if (value === 'machines' || value === 'machine') return 'machine';
  if (value === 'accessories' || value === 'accessory') return 'accessory';
  return 'part';
}

async function createCatalogItem(request, env, session) {
  const body = await readJson(request);
  const input = catalogInput(body);
  const validation = validateCatalogItem(input);
  if (validation) return json({ ok: false, error: validation }, 400);
  const duplicate = await env.DB.prepare(
    'SELECT id, item_name FROM catalog_items WHERE part_number = ? COLLATE NOCASE LIMIT 1'
  ).bind(input.part_number).first();
  if (duplicate) return json({ ok: false, error: `Part number already belongs to ${duplicate.item_name}.` }, 409);
  const now = new Date().toISOString();
  const assisted = body.dataSource === 'ai_suggested';
  const imported = body.dataSource === 'imported';
  const item = {
    id: makeId('item'), ...input,
    data_source: assisted ? 'ai_suggested' : (imported ? 'imported' : 'manual'),
    review_required: assisted || imported ? 1 : 0,
    active: 1, created_at: now, updated_at: now
  };
  await env.DB.prepare(
    `INSERT INTO catalog_items
      (id, part_number, item_name, item_type, hsn_sac, gst_rate, retail_price, mrp,
       details_json, data_source, review_required, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).bind(
    item.id, item.part_number, item.item_name, item.item_type, item.hsn_sac, item.gst_rate,
    item.retail_price, item.mrp, item.details_json, item.data_source, item.review_required, now, now
  ).run();
  return json({ ok: true, item }, 201);
}

async function updateCatalogItem(request, env, session, id) {
  const itemId = cleanText(id, 80);
  const existing = await env.DB.prepare(
    'SELECT id, data_source, review_required FROM catalog_items WHERE id = ? AND active = 1'
  ).bind(itemId).first();
  if (!existing) return json({ ok: false, error: 'Catalog item not found.' }, 404);
  const body = await readJson(request);
  const input = catalogInput(body);
  const validation = validateCatalogItem(input);
  if (validation) return json({ ok: false, error: validation }, 400);
  const duplicate = await env.DB.prepare(
    'SELECT id, item_name FROM catalog_items WHERE part_number = ? COLLATE NOCASE AND id <> ? LIMIT 1'
  ).bind(input.part_number, itemId).first();
  if (duplicate) return json({ ok: false, error: `Part number already belongs to ${duplicate.item_name}.` }, 409);

  const canVerify = hasRole(session, 'manager', 'owner');
  const verified = body.confirmReview === true && canVerify;
  const source = verified ? 'manual' : (body.dataSource === 'ai_suggested' ? 'ai_suggested' : existing.data_source);
  const reviewRequired = verified ? 0 : (source === 'ai_suggested' ? 1 : existing.review_required);
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE catalog_items SET part_number = ?, item_name = ?, item_type = ?, hsn_sac = ?, gst_rate = ?,
      retail_price = ?, mrp = ?, details_json = ?, data_source = ?, review_required = ?, updated_at = ?
     WHERE id = ? AND active = 1`
  ).bind(
    input.part_number, input.item_name, input.item_type, input.hsn_sac, input.gst_rate,
    input.retail_price, input.mrp, input.details_json, source, reviewRequired, updatedAt, itemId
  ).run();
  const item = await env.DB.prepare(
    `SELECT id, part_number, item_name, item_type, hsn_sac, gst_rate, retail_price, mrp,
      details_json, data_source, review_required, active, created_at, updated_at
     FROM catalog_items WHERE id = ?`
  ).bind(itemId).first();
  return json({ ok: true, item });
}

async function suggestCatalogValues(request, env) {
  const body = await readJson(request);
  const itemType = cleanText(body.itemType, 20).toLowerCase();
  const itemName = cleanText(body.itemName, 160);
  const partNumber = cleanText(body.partNumber, 80).toUpperCase();
  if (!CATALOG_TYPES.has(itemType) || (!itemName && !partNumber)) {
    return json({ ok: false, error: 'Enter an item type and either an item name or part number first.' }, 400);
  }
  const result = await env.DB.prepare(
    `SELECT part_number, item_name, hsn_sac, gst_rate, retail_price, mrp
     FROM catalog_items WHERE active = 1 AND item_type = ? ORDER BY updated_at DESC LIMIT 100`
  ).bind(itemType).all();
  const candidates = (result.results || []).map(item => ({
    item,
    score: catalogSimilarity({ itemName, partNumber }, item)
  })).filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score);
  if (!candidates.length) return json({ ok: true, suggestion: null });
  const best = candidates[0].item;
  return json({
    ok: true,
    suggestion: {
      hsnSac: best.hsn_sac,
      gstRate: best.gst_rate,
      retailPrice: best.retail_price,
      mrp: best.mrp,
      basedOn: { partNumber: best.part_number, itemName: best.item_name },
      dataSource: 'ai_suggested',
      reviewRequired: true
    }
  });
}

function catalogInput(body) {
  return {
    part_number: cleanText(body.partNumber, 80).toUpperCase(),
    item_name: cleanText(body.itemName, 160),
    item_type: cleanText(body.itemType, 20).toLowerCase(),
    hsn_sac: cleanText(body.hsnSac, 30).toUpperCase(),
    gst_rate: optionalNumber(body.gstRate),
    retail_price: optionalNumber(body.retailPrice),
    mrp: optionalNumber(body.mrp),
    details_json: cleanText(body.details, 2000) ? JSON.stringify({ notes: cleanText(body.details, 2000) }) : null
  };
}

function validateCatalogItem(item) {
  if (!item.part_number) return 'Part number is required.';
  if (!item.item_name) return 'Item name is required.';
  if (!CATALOG_TYPES.has(item.item_type)) return 'Select a valid item type.';
  if (!item.hsn_sac) return 'HSN/SAC is required.';
  if (item.gst_rate === null || !Number.isFinite(item.gst_rate) || item.gst_rate < 0 || item.gst_rate > 100) return 'GST rate is required and must be between 0 and 100.';
  if (item.retail_price !== null && (!Number.isFinite(item.retail_price) || item.retail_price < 0)) return 'Retail price must be a positive number or blank.';
  if (item.mrp !== null && (!Number.isFinite(item.mrp) || item.mrp < 0)) return 'MRP must be a positive number or blank.';
  if (item.retail_price !== null && item.mrp !== null && item.retail_price > item.mrp) return 'Retail price cannot be greater than MRP.';
  return null;
}

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function catalogSimilarity(input, candidate) {
  let score = 0;
  const prefix = input.partNumber.replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const candidatePart = String(candidate.part_number || '').replace(/[^A-Z0-9]/g, '');
  if (prefix.length >= 3 && candidatePart.startsWith(prefix)) score += 5;
  const words = new Set(input.itemName.toLowerCase().split(/\W+/).filter(word => word.length > 2));
  const candidateWords = new Set(String(candidate.item_name || '').toLowerCase().split(/\W+/));
  for (const word of words) if (candidateWords.has(word)) score += 2;
  return score;
}

async function listServiceTypes(env) {
  const result = await env.DB.prepare(
    `SELECT id, name, description, standard_minutes, default_price, hsn_sac, gst_rate, active, created_at, updated_at
     FROM service_job_types WHERE active = 1 ORDER BY name`
  ).all();
  return json({ ok: true, serviceTypes: result.results || [] });
}

async function createServiceType(request, env) {
  const input = serviceTypeInput(await readJson(request));
  const validation = validateServiceType(input);
  if (validation) return json({ ok: false, error: validation }, 400);
  const duplicate = await env.DB.prepare(
    'SELECT id FROM service_job_types WHERE name = ? COLLATE NOCASE LIMIT 1'
  ).bind(input.name).first();
  if (duplicate) return json({ ok: false, error: 'That service job name already exists.' }, 409);
  const now = new Date().toISOString();
  const serviceType = { id: makeId('service'), ...input, active: 1, created_at: now, updated_at: now };
  await env.DB.prepare(
    `INSERT INTO service_job_types
      (id, name, description, standard_minutes, default_price, hsn_sac, gst_rate, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).bind(
    serviceType.id, serviceType.name, serviceType.description, serviceType.standard_minutes,
    serviceType.default_price, serviceType.hsn_sac, serviceType.gst_rate, now, now
  ).run();
  return json({ ok: true, serviceType }, 201);
}

async function updateServiceType(request, env, id) {
  const serviceId = cleanText(id, 80);
  const existing = await env.DB.prepare(
    'SELECT id FROM service_job_types WHERE id = ? AND active = 1'
  ).bind(serviceId).first();
  if (!existing) return json({ ok: false, error: 'Service job not found.' }, 404);
  const input = serviceTypeInput(await readJson(request));
  const validation = validateServiceType(input);
  if (validation) return json({ ok: false, error: validation }, 400);
  const duplicate = await env.DB.prepare(
    'SELECT id FROM service_job_types WHERE name = ? COLLATE NOCASE AND id <> ? LIMIT 1'
  ).bind(input.name, serviceId).first();
  if (duplicate) return json({ ok: false, error: 'That service job name already exists.' }, 409);
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE service_job_types SET name = ?, description = ?, standard_minutes = ?, default_price = ?,
      hsn_sac = ?, gst_rate = ?, updated_at = ? WHERE id = ? AND active = 1`
  ).bind(
    input.name, input.description, input.standard_minutes, input.default_price,
    input.hsn_sac, input.gst_rate, updatedAt, serviceId
  ).run();
  const serviceType = await env.DB.prepare(
    `SELECT id, name, description, standard_minutes, default_price, hsn_sac, gst_rate, active, created_at, updated_at
     FROM service_job_types WHERE id = ?`
  ).bind(serviceId).first();
  return json({ ok: true, serviceType });
}

function serviceTypeInput(body) {
  return {
    name: cleanText(body.name, 160),
    description: cleanText(body.description, 1000) || null,
    standard_minutes: optionalInteger(body.standardMinutes),
    default_price: optionalNumber(body.defaultPrice),
    hsn_sac: cleanText(body.hsnSac, 30).toUpperCase(),
    gst_rate: optionalNumber(body.gstRate)
  };
}

function validateServiceType(service) {
  if (!service.name) return 'Service repair job name is required.';
  if (!service.hsn_sac) return 'HSN/SAC is required.';
  if (service.gst_rate === null || !Number.isFinite(service.gst_rate) || service.gst_rate < 0 || service.gst_rate > 100) return 'GST rate is required and must be between 0 and 100.';
  if (service.standard_minutes !== null && (!Number.isInteger(service.standard_minutes) || service.standard_minutes <= 0)) return 'Standard time must be a positive whole number of minutes or blank.';
  if (service.default_price !== null && (!Number.isFinite(service.default_price) || service.default_price < 0)) return 'Default price must be a positive number or blank.';
  return null;
}

function optionalInteger(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
}

async function listIntakeDrafts(env, session, url) {
  const requestedStatus = cleanText(url.searchParams.get('status'), 30).toLowerCase();
  const allowedStatuses = new Set(['draft', 'needs_review', 'ready', 'completed', 'cancelled']);
  const conditions = [];
  const values = [];
  if (!hasRole(session, 'owner')) {
    conditions.push('d.branch_id = ?');
    values.push(session.branch_id);
  }
  if (requestedStatus && allowedStatuses.has(requestedStatus)) {
    conditions.push('d.status = ?');
    values.push(requestedStatus);
  } else {
    conditions.push(`d.status NOT IN ('completed', 'cancelled')`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await env.DB.prepare(
    `${intakeDraftSelect()}
     ${where}
     ORDER BY d.updated_at DESC
     LIMIT 100`
  ).bind(...values).all();
  return json({ ok: true, drafts: (result.results || []).map(publicIntakeDraft) });
}

async function createIntakeDraft(request, env, session) {
  const body = await readJson(request);
  const input = intakeDraftInput(body);
  const validation = validateIntakeDraftInput(input);
  if (validation) return json({ ok: false, error: validation }, 400);
  const branch = await resolveWorkOrderBranch(env, session, body.branchId);
  if (!branch) return json({ ok: false, error: 'Branch not found.' }, 404);
  const now = new Date().toISOString();
  const id = makeId('intake');
  await env.DB.prepare(
    `INSERT INTO intake_drafts
      (id, branch_id, created_by, assigned_to, status, extraction_status,
       customer_id, customer_name, customer_phone, customer_place,
       machine_model_id, machine_description, serial_number, complaint,
       contact_verification, contact_verification_note,
       accessories_json, job_id, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 'draft', 'not_configured', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).bind(
    id, branch.id, session.id,
    input.customerId, input.customerName, input.customerPhone, input.customerPlace,
    input.machineModelId, input.machineDescription, input.serialNumber, input.complaint,
    input.contactVerification, input.contactVerificationNote,
    JSON.stringify(input.accessories), now, now
  ).run();
  return getIntakeDraft(env, session, id, 201);
}

async function getIntakeDraft(env, session, id, successStatus = 200) {
  const draft = await getIntakeDraftRecord(env, session, id);
  if (draft instanceof Response) return draft;
  const photosResult = await env.DB.prepare(
    `SELECT id, draft_id, original_filename, photo_type, content_type, size_bytes,
      checksum_sha256, r2_etag, uploaded_by, created_at
     FROM intake_photos WHERE draft_id = ? ORDER BY created_at, id`
  ).bind(draft.id).all();
  return json({
    ok: true,
    draft: {
      ...publicIntakeDraft(draft),
      photos: (photosResult.results || []).map(photo => publicIntakePhoto(photo, draft.id))
    }
  }, successStatus);
}

async function updateIntakeDraft(request, env, session, id) {
  const draft = await getIntakeDraftRecord(env, session, id);
  if (draft instanceof Response) return draft;
  if (draft.status === 'completed') {
    return json({ ok: false, error: 'This intake has already created a work order.' }, 409);
  }
  const body = await readJson(request);
  const input = intakeDraftInput(body);
  const validation = validateIntakeDraftInput(input);
  if (validation) return json({ ok: false, error: validation }, 400);
  const allowedStatuses = new Set(['draft', 'needs_review', 'ready', 'cancelled']);
  const status = allowedStatuses.has(cleanText(body.status, 30).toLowerCase())
    ? cleanText(body.status, 30).toLowerCase()
    : draft.status;
  let assignedTo = draft.assigned_to || null;
  if (hasRole(session, 'manager', 'owner') && Object.hasOwn(body, 'assignedTo')) {
    assignedTo = cleanText(body.assignedTo, 80) || null;
    if (assignedTo) {
      const assignee = await env.DB.prepare(
        'SELECT id, branch_id FROM staff WHERE id = ? AND active = 1'
      ).bind(assignedTo).first();
      if (!assignee || assignee.branch_id !== draft.branch_id) {
        return json({ ok: false, error: 'Reviewer is not available for this branch.' }, 400);
      }
    }
  }
  const updatedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE intake_drafts SET
      assigned_to = ?, status = ?, customer_id = ?, customer_name = ?,
      customer_phone = ?, customer_place = ?, machine_model_id = ?,
      machine_description = ?, serial_number = ?, complaint = ?,
      contact_verification = ?, contact_verification_note = ?,
      accessories_json = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    assignedTo, status, input.customerId, input.customerName, input.customerPhone,
    input.customerPlace, input.machineModelId, input.machineDescription,
    input.serialNumber, input.complaint, input.contactVerification,
    input.contactVerificationNote, JSON.stringify(input.accessories),
    updatedAt, draft.id
  ).run();
  return getIntakeDraft(env, session, draft.id);
}

async function uploadIntakePhoto(request, env, session, id) {
  if (!env.DOCS) return json({ ok: false, error: 'Intake photo storage is not configured.' }, 503);
  const draft = await getIntakeDraftRecord(env, session, id);
  if (draft instanceof Response) return draft;
  if (draft.status === 'completed' || draft.status === 'cancelled') {
    return json({ ok: false, error: 'This intake no longer accepts photos.' }, 409);
  }
  const countRow = await env.DB.prepare(
    'SELECT COUNT(*) AS photo_count FROM intake_photos WHERE draft_id = ?'
  ).bind(draft.id).first();
  if (Number(countRow?.photo_count || 0) >= INTAKE_PHOTO_MAX_FILES) {
    return json({ ok: false, error: `An intake can contain up to ${INTAKE_PHOTO_MAX_FILES} photos.` }, 413);
  }
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ ok: false, error: 'The photo upload could not be read.' }, 400);
  }
  const file = formData.get('photo');
  if (!isUploadedFile(file) || file.size === 0) {
    return json({ ok: false, error: 'Choose a photo to upload.' }, 400);
  }
  if (file.size > INTAKE_PHOTO_MAX_BYTES) {
    return json({ ok: false, error: 'Each intake photo must be 10 MB or smaller.' }, 413);
  }
  if (!file.name || file.name.length > 180) {
    return json({ ok: false, error: 'The photo must have a valid filename.' }, 400);
  }
  const requestedType = cleanText(formData.get('photoType'), 30).toLowerCase();
  const photoType = INTAKE_PHOTO_TYPES.has(requestedType) ? requestedType : 'other';
  const buffer = await file.arrayBuffer();
  const detectedType = detectDocumentContentType(buffer);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(detectedType)) {
    return json({ ok: false, error: 'Intake photos must be JPEG, PNG, or WebP images.' }, 415);
  }
  const claimedType = String(file.type || '').toLowerCase();
  if (claimedType && claimedType !== 'application/octet-stream' && claimedType !== detectedType) {
    return json({ ok: false, error: 'The photo content does not match its declared file type.' }, 415);
  }
  const photoId = makeId('intake_photo');
  const filename = safeDocumentFilename(file.name);
  const r2Key = `intake/${draft.branch_code}/${draft.id}/${photoId}-${filename}`;
  const checksum = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)));
  const stored = await env.DOCS.put(r2Key, buffer, {
    httpMetadata: {
      contentType: detectedType,
      contentDisposition: `inline; filename="${safeDocumentFilename(filename).replace(/[^\x20-\x7e]/g, '_')}"`
    }
  });
  if (!stored) return json({ ok: false, error: 'Photo storage rejected the upload.' }, 502);
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO intake_photos
          (id, draft_id, r2_key, original_filename, photo_type, content_type,
           size_bytes, checksum_sha256, r2_etag, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        photoId, draft.id, r2Key, filename, photoType, detectedType, file.size,
        checksum, stored.etag || null, session.id, now
      ),
      env.DB.prepare(
        `UPDATE intake_drafts
         SET status = 'needs_review', extraction_status = 'not_configured', updated_at = ?
         WHERE id = ?`
      ).bind(now, draft.id)
    ]);
  } catch (error) {
    await env.DOCS.delete(r2Key);
    throw error;
  }
  return getIntakeDraft(env, session, draft.id, 201);
}

async function updateIntakePhoto(request, env, session, draftId, photoId) {
  const draft = await getIntakeDraftRecord(env, session, draftId);
  if (draft instanceof Response) return draft;
  if (draft.status === 'completed' || draft.status === 'cancelled') {
    return json({ ok: false, error: 'This intake photo can no longer be changed.' }, 409);
  }
  const body = await readJson(request);
  const photoType = cleanText(body.photoType, 30).toLowerCase();
  if (!INTAKE_PHOTO_TYPES.has(photoType)) {
    return json({ ok: false, error: 'Select a valid photo type.' }, 400);
  }
  const result = await env.DB.prepare(
    'UPDATE intake_photos SET photo_type = ? WHERE id = ? AND draft_id = ?'
  ).bind(photoType, cleanText(photoId, 90), draft.id).run();
  if (!result.meta?.changes) return json({ ok: false, error: 'Intake photo not found.' }, 404);
  await env.DB.prepare('UPDATE intake_drafts SET updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), draft.id).run();
  return getIntakeDraft(env, session, draft.id);
}

async function deleteIntakePhoto(env, session, draftId, photoId) {
  if (!env.DOCS) return json({ ok: false, error: 'Intake photo storage is not configured.' }, 503);
  const draft = await getIntakeDraftRecord(env, session, draftId);
  if (draft instanceof Response) return draft;
  if (draft.status === 'completed' || draft.status === 'cancelled') {
    return json({ ok: false, error: 'This intake photo can no longer be removed.' }, 409);
  }
  const photo = await env.DB.prepare(
    'SELECT id, r2_key FROM intake_photos WHERE id = ? AND draft_id = ?'
  ).bind(cleanText(photoId, 90), draft.id).first();
  if (!photo) return json({ ok: false, error: 'Intake photo not found.' }, 404);
  await env.DOCS.delete(photo.r2_key);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM intake_photos WHERE id = ? AND draft_id = ?').bind(photo.id, draft.id),
    env.DB.prepare('UPDATE intake_drafts SET updated_at = ? WHERE id = ?').bind(now, draft.id)
  ]);
  return getIntakeDraft(env, session, draft.id);
}

async function downloadIntakePhoto(env, session, draftId, photoId) {
  if (!env.DOCS) return json({ ok: false, error: 'Intake photo storage is not configured.' }, 503);
  const draft = await getIntakeDraftRecord(env, session, draftId);
  if (draft instanceof Response) return draft;
  const photo = await env.DB.prepare(
    `SELECT id, r2_key, original_filename, content_type
     FROM intake_photos WHERE id = ? AND draft_id = ?`
  ).bind(cleanText(photoId, 90), draft.id).first();
  if (!photo) return json({ ok: false, error: 'Intake photo not found.' }, 404);
  const object = await env.DOCS.get(photo.r2_key);
  if (!object) return json({ ok: false, error: 'The stored intake photo is unavailable.' }, 410);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', photo.content_type);
  headers.set('Content-Disposition', `inline; filename="${safeDocumentFilename(photo.original_filename).replace(/[^\x20-\x7e]/g, '_')}"`);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}

async function completeIntakeDraft(request, env, session, id) {
  const draft = await getIntakeDraftRecord(env, session, id);
  if (draft instanceof Response) return draft;
  if (draft.job_id) return getWorkOrder(env, session, draft.job_id);
  if (draft.status === 'cancelled') {
    return json({ ok: false, error: 'A cancelled intake cannot create a work order.' }, 409);
  }
  const body = await readJson(request);
  return createWorkOrderFromBody({
    ...body,
    branchId: draft.branch_id,
    customerId: body.customerId ?? draft.customer_id,
    customerName: body.customerName ?? draft.customer_name,
    customerPhone: body.customerPhone ?? draft.customer_phone,
    customerPlace: body.customerPlace ?? draft.customer_place,
    machineModelId: body.machineModelId ?? draft.machine_model_id,
    machineDescription: body.machineDescription ?? draft.machine_description,
    serialNumber: body.serialNumber ?? draft.serial_number,
    complaint: body.complaint ?? draft.complaint,
    contactVerification: body.contactVerification ?? draft.contact_verification,
    contactVerificationNote: body.contactVerificationNote ?? draft.contact_verification_note,
    accessories: body.accessories ?? parseJsonArray(draft.accessories_json)
  }, env, session, draft);
}

function intakeDraftInput(body) {
  const safeBody = body && typeof body === 'object' ? body : {};
  return {
    ...workOrderInput(safeBody),
    contactVerification: cleanText(safeBody.contactVerification, 30).toLowerCase() || null,
    contactVerificationNote: cleanText(safeBody.contactVerificationNote, 500) || null
  };
}

function validateIntakeDraftInput(input) {
  const workOrderError = validateWorkOrderInput(input);
  if (workOrderError) return workOrderError;
  if (input.contactVerification &&
      !['customer_confirmed', 'staff_no_contact'].includes(input.contactVerification)) {
    return 'Select a valid customer contact confirmation.';
  }
  return null;
}

function intakeDraftSelect() {
  return `SELECT d.id, d.branch_id, b.code AS branch_code, b.name AS branch_name,
    d.created_by, creator.name AS created_by_name, d.assigned_to,
    reviewer.name AS assigned_to_name, d.status, d.extraction_status,
    d.customer_id, d.customer_name, d.customer_phone, d.customer_place,
    d.machine_model_id, d.machine_description, d.serial_number, d.complaint,
    d.contact_verification, d.contact_verification_note,
    d.contact_verified_by, d.contact_verified_at,
    d.accessories_json, d.job_id, d.created_at, d.updated_at,
    (SELECT COUNT(*) FROM intake_photos p WHERE p.draft_id = d.id) AS photo_count
   FROM intake_drafts d
   JOIN branches b ON b.id = d.branch_id
   JOIN staff creator ON creator.id = d.created_by
   LEFT JOIN staff reviewer ON reviewer.id = d.assigned_to`;
}

async function getIntakeDraftRecord(env, session, id) {
  const draftId = cleanText(id, 90);
  const draft = await env.DB.prepare(
    `${intakeDraftSelect()} WHERE d.id = ?`
  ).bind(draftId).first();
  if (!draft) return json({ ok: false, error: 'Intake draft not found.' }, 404);
  if (!hasRole(session, 'owner') && draft.branch_id !== session.branch_id) {
    return json({ ok: false, error: 'This intake belongs to another branch.' }, 403);
  }
  return draft;
}

function publicIntakeDraft(draft) {
  return {
    id: draft.id,
    branchId: draft.branch_id,
    branchCode: draft.branch_code,
    branchName: draft.branch_name,
    createdBy: draft.created_by,
    createdByName: draft.created_by_name,
    assignedTo: draft.assigned_to || null,
    assignedToName: draft.assigned_to_name || '',
    status: draft.status,
    extractionStatus: draft.extraction_status,
    customerId: draft.customer_id || null,
    customerName: draft.customer_name || '',
    customerPhone: draft.customer_phone || '',
    customerPlace: draft.customer_place || '',
    machineModelId: draft.machine_model_id || null,
    machineDescription: draft.machine_description || '',
    serialNumber: draft.serial_number || '',
    complaint: draft.complaint || '',
    contactVerification: draft.contact_verification || '',
    contactVerificationNote: draft.contact_verification_note || '',
    contactVerifiedBy: draft.contact_verified_by || null,
    contactVerifiedAt: draft.contact_verified_at || null,
    accessories: parseJsonArray(draft.accessories_json),
    jobId: draft.job_id || null,
    photoCount: Number(draft.photo_count || 0),
    createdAt: draft.created_at,
    updatedAt: draft.updated_at
  };
}

function publicIntakePhoto(photo, draftId) {
  return {
    id: photo.id,
    draftId: photo.draft_id || draftId,
    originalFilename: photo.original_filename,
    photoType: photo.photo_type,
    contentType: photo.content_type,
    sizeBytes: Number(photo.size_bytes || 0),
    checksumSha256: photo.checksum_sha256,
    uploadedBy: photo.uploaded_by,
    createdAt: photo.created_at,
    url: `/api/intake-drafts/${encodeURIComponent(draftId)}/photos/${encodeURIComponent(photo.id)}`
  };
}

const JOB_EVENT_STATUS = {
  job_received: 'received',
  machine_received: 'received',
  job_taken: 'inspecting',
  inspection_observed: 'inspecting',
  inspection_started: 'inspecting',
  estimate_created: 'awaiting_approval',
  inspection_completed: 'awaiting_approval',
  estimate_approved: 'repairing',
  repair_started: 'repairing',
  job_paused: 'paused',
  repair_paused: 'paused',
  job_resumed: 'repairing',
  repair_resumed: 'repairing',
  parts_requested: 'waiting_parts',
  parts_received: 'repairing',
  job_completed: 'ready',
  repair_completed: 'ready',
  customer_notified: 'ready',
  job_returned: 'returned',
  machine_delivered: 'returned',
  job_cancelled: 'cancelled'
};

const JOB_STATUS_LABELS = {
  received: 'Received',
  inspecting: 'Inspecting',
  awaiting_approval: 'Awaiting Approval',
  repairing: 'Repairing',
  paused: 'Paused',
  waiting_parts: 'Waiting for Parts',
  ready: 'Ready for Collection',
  returned: 'Returned',
  cancelled: 'Cancelled'
};

const JOB_STATUS_EVENTS = {
  received: ['job_received', 'machine_received'],
  inspecting: ['job_taken', 'inspection_observed', 'inspection_started'],
  awaiting_approval: ['estimate_created', 'inspection_completed'],
  repairing: ['estimate_approved', 'repair_started', 'job_resumed', 'repair_resumed', 'parts_received'],
  paused: ['job_paused', 'repair_paused'],
  waiting_parts: ['parts_requested'],
  ready: ['job_completed', 'repair_completed', 'customer_notified'],
  returned: ['job_returned', 'machine_delivered'],
  cancelled: ['job_cancelled']
};

const JOB_TRANSITIONS = {
  received: new Set(['job_taken', 'inspection_started', 'repair_started', 'job_cancelled']),
  inspecting: new Set([
    'inspection_observed', 'estimate_created', 'inspection_completed',
    'repair_started', 'job_paused', 'repair_paused', 'parts_requested', 'job_cancelled'
  ]),
  awaiting_approval: new Set(['estimate_approved', 'job_paused', 'repair_paused', 'job_cancelled']),
  repairing: new Set([
    'job_paused', 'repair_paused', 'parts_requested',
    'job_completed', 'repair_completed', 'job_cancelled'
  ]),
  paused: new Set(['job_resumed', 'repair_resumed', 'parts_requested', 'job_cancelled']),
  waiting_parts: new Set(['job_resumed', 'repair_resumed', 'parts_received', 'job_cancelled']),
  ready: new Set(['customer_notified', 'job_returned', 'machine_delivered']),
  returned: new Set(),
  cancelled: new Set()
};

const JOB_PAUSE_REASONS = new Set([
  'Waiting Customer',
  'Waiting Parts',
  'Outside Work',
  'Priority Changed',
  'End of Day',
  'Other'
]);

function workOrderInput(body) {
  const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};
  const machine = body.machine && typeof body.machine === 'object' ? body.machine : {};
  const work = body.work && typeof body.work === 'object' ? body.work : {};
  const billing = body.billing && typeof body.billing === 'object' ? body.billing : {};
  return {
    customerId: cleanText(body.customerId ?? customer.id, 80) || null,
    customerName: cleanText(body.customerName ?? customer.name, 160) || null,
    customerPhone: cleanText(body.customerPhone ?? customer.phone, 40) || null,
    customerPlace: cleanText(body.customerPlace ?? customer.place, 500) || null,
    machineModelId: cleanText(body.machineModelId ?? machine.modelId, 80) || null,
    machineDescription: cleanText(body.machineDescription ?? machine.description, 200) || null,
    serialNumber: cleanText(body.serialNumber ?? machine.serialNumber, 120).toUpperCase() || null,
    accessories: cleanStringList(body.accessories ?? machine.accessories, 25, 100),
    complaint: cleanText(body.complaint ?? work.complaint, 3000) || null,
    observation: cleanText(body.observation ?? work.observation, 5000) || null,
    workDone: cleanText(body.workDone ?? work.workDone, 5000) || null,
    assignedTo: cleanText(body.assignedTo ?? work.assignedTo, 80) || null,
    billingSubtotal: optionalNumber(body.billingSubtotal ?? billing.subtotal),
    billingTax: optionalNumber(body.billingTax ?? billing.tax),
    billingTotal: optionalNumber(body.billingTotal ?? billing.total),
    billingNote: cleanText(body.billingNote ?? billing.note, 3000) || null,
    parts: prepareVanillaParts(body.parts ?? work.parts)
  };
}

function prepareVanillaParts(value) {
  const source = Array.isArray(value) ? value.slice(0, 50) : [];
  const parts = [];
  for (const entry of source) {
    const input = entry && typeof entry === 'object' ? entry : {};
    const part = {
      partNumber: cleanText(input.partNumber, 100).toUpperCase() || null,
      itemName: cleanText(input.itemName ?? input.name, 300) || null,
      quantity: optionalNumber(input.quantity),
      unitPrice: optionalNumber(input.unitPrice),
      hsnSac: cleanText(input.hsnSac, 30).toUpperCase() || null,
      gstRate: optionalNumber(input.gstRate),
      notes: cleanText(input.notes, 1000) || null,
      source: cleanText(input.source, 80) || 'manual'
    };
    if (!part.partNumber && !part.itemName && part.quantity === null && part.unitPrice === null &&
        !part.hsnSac && part.gstRate === null && !part.notes) continue;
    if (part.quantity === null) part.quantity = 1;
    parts.push(part);
  }
  return parts;
}

function validateWorkOrderInput(input) {
  for (const [label, value] of [
    ['Billing subtotal', input.billingSubtotal],
    ['Billing tax', input.billingTax],
    ['Billing total', input.billingTotal]
  ]) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) return `${label} must be a positive number or blank.`;
  }
  for (let index = 0; index < input.parts.length; index += 1) {
    const part = input.parts[index];
    if (!Number.isFinite(part.quantity) || part.quantity <= 0) return `Part row ${index + 1} has an invalid quantity.`;
    if (part.unitPrice !== null && (!Number.isFinite(part.unitPrice) || part.unitPrice < 0)) {
      return `Part row ${index + 1} has an invalid price.`;
    }
    if (part.gstRate !== null && (!Number.isFinite(part.gstRate) || part.gstRate < 0 || part.gstRate > 100)) {
      return `Part row ${index + 1} has an invalid GST rate.`;
    }
  }
  return null;
}

function validateIntakeCompletion(input, contactVerification) {
  if (!input.customerName) return 'Customer name is required before creating the job.';
  if (!input.customerPhone) return 'Customer phone is required before creating the job.';
  if (!input.complaint) return 'Customer complaint is required before creating the job.';
  if (!['customer_confirmed', 'staff_no_contact'].includes(contactVerification)) {
    return 'Confirm customer contact or record the customer no-contact request.';
  }
  return null;
}

function pendingCustomerId(branchId) {
  return `customer_pending_${cleanText(branchId, 70)}`;
}

async function resolveWorkOrderBranch(env, session, requestedBranchId) {
  const branchId = hasRole(session, 'owner') && requestedBranchId
    ? cleanText(requestedBranchId, 80)
    : session.branch_id;
  return env.DB.prepare(
    'SELECT id, code, name FROM branches WHERE id = ? AND active = 1'
  ).bind(branchId).first();
}

async function listWorkOrders(env, session, url) {
  const query = cleanText(url.searchParams.get('query'), 120);
  const statusFilter = cleanText(url.searchParams.get('status'), 40).toLowerCase();
  const dateFrom = cleanText(url.searchParams.get('dateFrom'), 10);
  const dateTo = cleanText(url.searchParams.get('dateTo'), 10);
  const mechanicId = cleanText(url.searchParams.get('mechanic'), 80);
  const mine = url.searchParams.get('mine') === '1';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 120, 1), 250);
  const conditions = [];
  const values = [];
  if (!hasRole(session, 'owner')) {
    conditions.push('j.branch_id = ?');
    values.push(session.branch_id);
  }
  if (mine) {
    conditions.push('d.assigned_to = ?');
    values.push(session.id);
  }
  if (mechanicId) {
    if (!hasRole(session, 'manager', 'owner') && mechanicId !== session.id) {
      return json({ ok: false, error: 'Mechanic history filtering is restricted.' }, 403);
    }
    conditions.push('d.assigned_to = ?');
    values.push(mechanicId);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    conditions.push('SUBSTR(j.opened_at, 1, 10) >= ?');
    values.push(dateFrom);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    conditions.push('SUBSTR(j.opened_at, 1, 10) <= ?');
    values.push(dateTo);
  }
  if (query) {
    const like = `%${query}%`;
    conditions.push(`(
      j.work_order LIKE ? COLLATE NOCASE OR
      COALESCE(d.customer_name, c.name) LIKE ? COLLATE NOCASE OR
      COALESCE(d.customer_phone, c.phone) LIKE ? COLLATE NOCASE OR
      COALESCE(d.machine_description, cm.display_name, mm.model_name) LIKE ? COLLATE NOCASE OR
      COALESCE(d.serial_number, j.serial_number, cm.serial_number) LIKE ? COLLATE NOCASE OR
      COALESCE(d.complaint, j.reported_problem) LIKE ? COLLATE NOCASE
    )`);
    values.push(like, like, like, like, like, like);
  }
  values.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await env.DB.prepare(
    `SELECT j.id, j.work_order, j.branch_id, b.code AS branch_code, b.name AS branch_name,
      j.customer_id, c.record_kind, c.customer_code,
      COALESCE(d.customer_name, CASE WHEN c.record_kind = 'customer' THEN c.name END) AS customer_name,
      COALESCE(d.customer_phone, CASE WHEN c.record_kind = 'customer' THEN c.phone END) AS customer_phone,
      COALESCE(d.customer_place, CASE WHEN c.record_kind = 'customer' THEN c.address END) AS customer_place,
      j.customer_machine_id, d.machine_model_id, mm.model_name, mk.name AS make_name,
      COALESCE(d.machine_description, cm.display_name,
        TRIM(COALESCE(mk.name || ' ', '') || COALESCE(mm.model_name, ''))) AS machine_description,
      COALESCE(d.serial_number, j.serial_number, cm.serial_number) AS serial_number,
      COALESCE(d.complaint, j.reported_problem) AS complaint,
      d.observation, d.work_done, d.assigned_to, assigned.name AS assigned_to_name,
      d.billing_subtotal, d.billing_tax, d.billing_total, d.billing_note,
      d.accessories_json, j.opened_by, opener.name AS opened_by_name,
      j.opened_at, j.updated_at,
      je.event_type AS latest_event_type
     FROM repair_jobs j
     JOIN branches b ON b.id = j.branch_id
     JOIN customers c ON c.id = j.customer_id
     LEFT JOIN work_order_details d ON d.job_id = j.id
     LEFT JOIN customer_machines cm ON cm.id = j.customer_machine_id
     LEFT JOIN machine_models mm ON mm.id = COALESCE(d.machine_model_id, j.machine_model_id, cm.machine_model_id)
     LEFT JOIN machine_makes mk ON mk.id = mm.make_id
     LEFT JOIN staff assigned ON assigned.id = d.assigned_to
     JOIN staff opener ON opener.id = j.opened_by
     LEFT JOIN job_events je ON je.id = (
       SELECT e.id FROM job_events e WHERE e.job_id = j.id AND e.event_type <> 'note_added'
       ORDER BY e.created_at DESC, e.id DESC LIMIT 1
     )
     ${where}
     ORDER BY j.updated_at DESC LIMIT ?`
  ).bind(...values).all();
  let workOrders = (result.results || []).map(row => publicVanillaWorkOrder(row));
  if (statusFilter && statusFilter !== 'all') {
    workOrders = workOrders.filter(order => order.status === statusFilter);
  }
  return json({ ok: true, workOrders });
}

async function createWorkOrder(request, env, session) {
  const body = await readJson(request);
  return createWorkOrderFromBody(body, env, session);
}

async function createWorkOrderFromBody(body, env, session, intakeDraft = null) {
  const input = workOrderInput(body);
  const validation = validateWorkOrderInput(input);
  if (validation) return json({ ok: false, error: validation }, 400);
  const contactVerification = cleanText(body.contactVerification, 30).toLowerCase();
  const contactVerificationNote = cleanText(body.contactVerificationNote, 500) || null;
  if (intakeDraft) {
    const completionError = validateIntakeCompletion(input, contactVerification);
    if (completionError) return json({ ok: false, error: completionError }, 400);
  }
  const branch = await resolveWorkOrderBranch(env, session, body.branchId);
  if (!branch) return json({ ok: false, error: 'Branch not found.' }, 404);

  const now = new Date().toISOString();
  const statements = [];
  let customerId = input.customerId;
  if (customerId) {
    const customer = await env.DB.prepare(
      `SELECT id FROM customers WHERE id = ? AND active = 1 AND record_kind = 'customer'`
    ).bind(customerId).first();
    if (!customer) return json({ ok: false, error: 'Customer not found.' }, 404);
  } else if (input.customerName) {
    const existing = input.customerPhone
      ? await env.DB.prepare(
          `SELECT id FROM customers
           WHERE phone = ? AND active = 1 AND record_kind = 'customer' LIMIT 1`
        ).bind(input.customerPhone).first()
      : null;
    if (existing) {
      customerId = existing.id;
    } else {
      customerId = makeId('customer');
      statements.push(env.DB.prepare(
        `INSERT INTO customers
          (id, customer_code, name, phone, alternate_phone, email, address, tax_id,
           notes, created_at, updated_at, created_branch_id, created_by, active, record_kind)
         VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, ?, ?, ?, ?, 1, 'customer')`
      ).bind(
        customerId, makeCustomerCode(), input.customerName, input.customerPhone,
        input.customerPlace, now, now, branch.id, session.id
      ));
      if (input.customerPhone) {
        statements.push(env.DB.prepare(
          `INSERT INTO customer_identity_keys
            (identity_type, identity_value, customer_id, created_at)
           VALUES ('phone', ?, ?, ?)`
        ).bind(input.customerPhone, customerId, now));
      }
    }
  } else {
    customerId = pendingCustomerId(branch.id);
    statements.push(env.DB.prepare(
      `INSERT OR IGNORE INTO customers
        (id, customer_code, name, phone, alternate_phone, email, address, tax_id,
         notes, created_at, updated_at, created_branch_id, created_by, active, record_kind)
       VALUES (?, ?, 'Details pending', NULL, NULL, NULL, NULL, NULL,
         'System record for incomplete work orders', ?, ?, ?, ?, 1, 'system_pending')`
    ).bind(customerId, `PENDING-${branch.code}`, now, now, branch.id, session.id));
  }

  if (input.machineModelId) {
    const model = await env.DB.prepare(
      'SELECT id FROM machine_models WHERE id = ? AND active = 1'
    ).bind(input.machineModelId).first();
    if (!model) return json({ ok: false, error: 'Machine model not found.' }, 404);
  }
  if (input.assignedTo) {
    const assignee = await env.DB.prepare(
      'SELECT id, branch_id FROM staff WHERE id = ? AND active = 1'
    ).bind(input.assignedTo).first();
    if (!assignee || (!hasRole(session, 'owner') && assignee.branch_id !== branch.id)) {
      return json({ ok: false, error: 'Assigned staff member is not available for this branch.' }, 400);
    }
  }

  let customerMachineId = null;
  if (intakeDraft && (input.serialNumber || input.machineDescription || input.machineModelId)) {
    const existingMachine = input.serialNumber
      ? await env.DB.prepare(
          `SELECT id, customer_id FROM customer_machines
           WHERE UPPER(serial_number) = ? AND active = 1 LIMIT 1`
        ).bind(input.serialNumber).first()
      : null;
    if (existingMachine && existingMachine.customer_id !== customerId) {
      return json({
        ok: false,
        error: 'This serial number belongs to another customer. Transfer ownership before completing intake.'
      }, 409);
    }
    if (existingMachine) {
      customerMachineId = existingMachine.id;
      statements.push(
        env.DB.prepare(
          `UPDATE customer_machines SET
            last_seen_at = ?, updated_at = ?,
            machine_model_id = COALESCE(machine_model_id, ?),
            display_name = CASE WHEN display_name = '' THEN ? ELSE display_name END
           WHERE id = ?`
        ).bind(now, now, input.machineModelId, input.machineDescription || input.serialNumber, customerMachineId)
      );
    } else {
      customerMachineId = makeId('customer_machine');
      const displayName = input.machineDescription || `Machine ${input.serialNumber || ''}`.trim();
      statements.push(
        env.DB.prepare(
          `INSERT INTO customer_machines
            (id, customer_id, machine_model_id, display_name, serial_number, notes,
             provisional, active, first_seen_at, last_seen_at, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, ?, ?, ?)`
        ).bind(
          customerMachineId, customerId, input.machineModelId, displayName,
          input.serialNumber, input.machineModelId ? 0 : 1,
          now, now, session.id, now, now
        ),
        env.DB.prepare(
          `INSERT INTO machine_ownership_history
            (id, machine_id, customer_id, started_at, ended_at, transferred_by, note, created_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`
        ).bind(
          makeId('ownership'), customerMachineId, customerId, now,
          session.id, 'Machine received through intake', now
        )
      );
    }
  }

  const jobId = makeId('job');
  const workOrder = makeWorkOrder(branch.code);
  const eventData = JSON.stringify({
    urgency: 'normal',
    accessories: input.accessories,
    intakeNotes: null,
    contactVerification: contactVerification || null,
    contactVerificationNote,
    vanilla: true
  });
  statements.push(
    env.DB.prepare(
      `INSERT INTO repair_jobs
       (id, work_order, branch_id, customer_id, machine_model_id, serial_number,
         reported_problem, opened_by, opened_at, updated_at, customer_machine_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      jobId, workOrder, branch.id, customerId, input.machineModelId,
      input.serialNumber, input.complaint || '', session.id, now, now, customerMachineId
    ),
    env.DB.prepare(
      `INSERT INTO work_order_details
        (job_id, customer_name, customer_phone, customer_place, machine_description,
         machine_model_id, serial_number, accessories_json, complaint, observation,
         work_done, assigned_to, billing_subtotal, billing_tax, billing_total,
         billing_note, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      jobId, input.customerName, input.customerPhone, input.customerPlace,
      input.machineDescription, input.machineModelId, input.serialNumber,
      JSON.stringify(input.accessories), input.complaint, input.observation,
      input.workDone, input.assignedTo, input.billingSubtotal, input.billingTax,
      input.billingTotal, input.billingNote, now, now, session.id
    ),
    env.DB.prepare(
      `INSERT INTO job_events
        (id, job_id, event_type, event_data_json, created_by, created_at, server_received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(makeId('event'), jobId, intakeDraft ? 'job_received' : 'machine_received', eventData, session.id, now, now),
    ...vanillaPartStatements(env, jobId, input.parts, now)
  );
  if (intakeDraft) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO intake_draft_completions
          (draft_id, job_id, completed_by, completed_at)
         VALUES (?, ?, ?, ?)`
      ).bind(intakeDraft.id, jobId, session.id, now),
      env.DB.prepare(
        `UPDATE intake_drafts
         SET status = 'completed', job_id = ?, customer_id = ?, customer_name = ?,
           customer_phone = ?, customer_place = ?, machine_model_id = ?,
           machine_description = ?, serial_number = ?, complaint = ?,
           contact_verification = ?, contact_verification_note = ?,
           contact_verified_by = ?, contact_verified_at = ?,
           accessories_json = ?, updated_at = ?
         WHERE id = ? AND job_id IS NULL`
      ).bind(
        jobId, customerId, input.customerName, input.customerPhone,
        input.customerPlace, input.machineModelId, input.machineDescription,
        input.serialNumber, input.complaint, contactVerification,
        contactVerificationNote, session.id, now, JSON.stringify(input.accessories),
        now, intakeDraft.id
      )
    );
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (intakeDraft) {
      const completed = await env.DB.prepare(
        'SELECT job_id FROM intake_draft_completions WHERE draft_id = ?'
      ).bind(intakeDraft.id).first();
      if (completed?.job_id) return getWorkOrder(env, session, completed.job_id);
    }
    throw error;
  }
  return getWorkOrder(env, session, jobId, 201);
}

async function getWorkOrder(env, session, id, successStatus = 200) {
  const jobId = cleanText(id, 80);
  const row = await env.DB.prepare(
    `SELECT j.id, j.work_order, j.branch_id, b.code AS branch_code, b.name AS branch_name,
      j.customer_id, c.record_kind, c.customer_code,
      COALESCE(d.customer_name, CASE WHEN c.record_kind = 'customer' THEN c.name END) AS customer_name,
      COALESCE(d.customer_phone, CASE WHEN c.record_kind = 'customer' THEN c.phone END) AS customer_phone,
      COALESCE(d.customer_place, CASE WHEN c.record_kind = 'customer' THEN c.address END) AS customer_place,
      j.customer_machine_id, d.machine_model_id, mm.model_name, mk.name AS make_name,
      COALESCE(d.machine_description, cm.display_name,
        TRIM(COALESCE(mk.name || ' ', '') || COALESCE(mm.model_name, ''))) AS machine_description,
      COALESCE(d.serial_number, j.serial_number, cm.serial_number) AS serial_number,
      COALESCE(d.complaint, j.reported_problem) AS complaint,
      d.observation, d.work_done, d.assigned_to, assigned.name AS assigned_to_name,
      d.billing_subtotal, d.billing_tax, d.billing_total, d.billing_note,
      d.accessories_json, j.opened_by, opener.name AS opened_by_name,
      j.opened_at, j.updated_at,
      je.event_type AS latest_event_type
     FROM repair_jobs j
     JOIN branches b ON b.id = j.branch_id
     JOIN customers c ON c.id = j.customer_id
     LEFT JOIN work_order_details d ON d.job_id = j.id
     LEFT JOIN customer_machines cm ON cm.id = j.customer_machine_id
     LEFT JOIN machine_models mm ON mm.id = COALESCE(d.machine_model_id, j.machine_model_id, cm.machine_model_id)
     LEFT JOIN machine_makes mk ON mk.id = mm.make_id
     LEFT JOIN staff assigned ON assigned.id = d.assigned_to
     JOIN staff opener ON opener.id = j.opened_by
     LEFT JOIN job_events je ON je.id = (
       SELECT e.id FROM job_events e WHERE e.job_id = j.id AND e.event_type <> 'note_added'
       ORDER BY e.created_at DESC, e.id DESC LIMIT 1
     )
     WHERE j.id = ?`
  ).bind(jobId).first();
  if (!row) return json({ ok: false, error: 'Work order not found.' }, 404);
  if (!hasRole(session, 'owner') && row.branch_id !== session.branch_id) {
    return json({ ok: false, error: 'This work order belongs to another branch.' }, 403);
  }
  const partsResult = await env.DB.prepare(
    `SELECT id, line_number, part_number, item_name, quantity, unit_price,
      hsn_sac, gst_rate, notes, source
     FROM work_order_parts WHERE job_id = ? ORDER BY line_number`
  ).bind(jobId).all();
  const eventsResult = await env.DB.prepare(
    `SELECT e.id, e.event_type, e.event_data_json, e.created_at,
      s.name AS created_by_name
     FROM job_events e JOIN staff s ON s.id = e.created_by
     WHERE e.job_id = ? ORDER BY e.created_at, e.id`
  ).bind(jobId).all();
  const intakeDraft = await env.DB.prepare(
    `SELECT id, extraction_status, created_at, updated_at
     FROM intake_drafts WHERE job_id = ?`
  ).bind(jobId).first();
  let intake = null;
  if (intakeDraft) {
    const intakePhotos = await env.DB.prepare(
      `SELECT id, draft_id, original_filename, photo_type, content_type, size_bytes,
        checksum_sha256, uploaded_by, created_at
       FROM intake_photos WHERE draft_id = ? ORDER BY created_at, id`
    ).bind(intakeDraft.id).all();
    intake = {
      id: intakeDraft.id,
      extractionStatus: intakeDraft.extraction_status,
      createdAt: intakeDraft.created_at,
      updatedAt: intakeDraft.updated_at,
      photos: (intakePhotos.results || []).map(photo => publicIntakePhoto(photo, intakeDraft.id))
    };
  }
  return json({
    ok: true,
    workOrder: {
      ...publicVanillaWorkOrder(row),
      parts: partsResult.results || [],
      events: (eventsResult.results || []).map(publicJobEvent),
      intake
    }
  }, successStatus);
}

async function updateWorkOrder(request, env, session, id) {
  const jobId = cleanText(id, 80);
  const current = await env.DB.prepare(
    `SELECT j.id, j.branch_id, j.customer_id, c.record_kind,
      (SELECT e.event_type FROM job_events e
       WHERE e.job_id = j.id AND e.event_type <> 'note_added'
       ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS latest_event_type
     FROM repair_jobs j JOIN customers c ON c.id = j.customer_id WHERE j.id = ?`
  ).bind(jobId).first();
  if (!current) return json({ ok: false, error: 'Work order not found.' }, 404);
  if (!hasRole(session, 'owner') && current.branch_id !== session.branch_id) {
    return json({ ok: false, error: 'This work order belongs to another branch.' }, 403);
  }
  if (['returned', 'cancelled'].includes(jobStatus(current.latest_event_type))) {
    return json({ ok: false, error: 'This work order is closed and cannot be changed.' }, 409);
  }
  const input = workOrderInput(await readJson(request));
  const validation = validateWorkOrderInput(input);
  if (validation) return json({ ok: false, error: validation }, 400);
  if (input.machineModelId) {
    const model = await env.DB.prepare(
      'SELECT id FROM machine_models WHERE id = ? AND active = 1'
    ).bind(input.machineModelId).first();
    if (!model) return json({ ok: false, error: 'Machine model not found.' }, 404);
  }
  if (input.assignedTo) {
    const assignee = await env.DB.prepare(
      'SELECT id, branch_id FROM staff WHERE id = ? AND active = 1'
    ).bind(input.assignedTo).first();
    if (!assignee || (!hasRole(session, 'owner') && assignee.branch_id !== current.branch_id)) {
      return json({ ok: false, error: 'Assigned staff member is not available for this branch.' }, 400);
    }
  }

  const now = new Date().toISOString();
  const statements = [];
  let customerId = current.customer_id;
  if (input.customerId) {
    const selected = await env.DB.prepare(
      `SELECT id FROM customers WHERE id = ? AND active = 1 AND record_kind = 'customer'`
    ).bind(input.customerId).first();
    if (!selected) return json({ ok: false, error: 'Customer not found.' }, 404);
    customerId = selected.id;
  } else if (current.record_kind === 'system_pending' && input.customerName) {
    const existing = input.customerPhone
      ? await env.DB.prepare(
          `SELECT id FROM customers
           WHERE phone = ? AND active = 1 AND record_kind = 'customer' LIMIT 1`
        ).bind(input.customerPhone).first()
      : null;
    if (existing) {
      customerId = existing.id;
    } else {
      customerId = makeId('customer');
      statements.push(env.DB.prepare(
        `INSERT INTO customers
          (id, customer_code, name, phone, alternate_phone, email, address, tax_id,
           notes, created_at, updated_at, created_branch_id, created_by, active, record_kind)
         VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, ?, ?, ?, ?, 1, 'customer')`
      ).bind(
        customerId, makeCustomerCode(), input.customerName, input.customerPhone,
        input.customerPlace, now, now, current.branch_id, session.id
      ));
      if (input.customerPhone) {
        statements.push(env.DB.prepare(
          `INSERT INTO customer_identity_keys
            (identity_type, identity_value, customer_id, created_at)
           VALUES ('phone', ?, ?, ?)`
        ).bind(input.customerPhone, customerId, now));
      }
    }
  }

  statements.push(
    env.DB.prepare(
      `INSERT INTO work_order_details
        (job_id, customer_name, customer_phone, customer_place, machine_description,
         machine_model_id, serial_number, accessories_json, complaint, observation,
         work_done, assigned_to, billing_subtotal, billing_tax, billing_total,
         billing_note, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(job_id) DO UPDATE SET
         customer_name = excluded.customer_name,
         customer_phone = excluded.customer_phone,
         customer_place = excluded.customer_place,
         machine_description = excluded.machine_description,
         machine_model_id = excluded.machine_model_id,
         serial_number = excluded.serial_number,
         accessories_json = excluded.accessories_json,
         complaint = excluded.complaint,
         observation = excluded.observation,
         work_done = excluded.work_done,
         assigned_to = excluded.assigned_to,
         billing_subtotal = excluded.billing_subtotal,
         billing_tax = excluded.billing_tax,
         billing_total = excluded.billing_total,
         billing_note = excluded.billing_note,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`
    ).bind(
      jobId, input.customerName, input.customerPhone, input.customerPlace,
      input.machineDescription, input.machineModelId, input.serialNumber,
      JSON.stringify(input.accessories), input.complaint, input.observation,
      input.workDone, input.assignedTo, input.billingSubtotal, input.billingTax,
      input.billingTotal, input.billingNote, now, now, session.id
    ),
    env.DB.prepare(
      `UPDATE repair_jobs SET customer_id = ?, machine_model_id = ?, serial_number = ?,
        reported_problem = ?, updated_at = ? WHERE id = ?`
    ).bind(
      customerId, input.machineModelId, input.serialNumber,
      input.complaint || '', now, jobId
    ),
    env.DB.prepare('DELETE FROM work_order_parts WHERE job_id = ?').bind(jobId),
    ...vanillaPartStatements(env, jobId, input.parts, now)
  );
  await env.DB.batch(statements);
  return getWorkOrder(env, session, jobId);
}

function vanillaPartStatements(env, jobId, parts, now) {
  return parts.map((part, index) => env.DB.prepare(
    `INSERT INTO work_order_parts
      (id, job_id, line_number, part_number, item_name, quantity, unit_price,
       hsn_sac, gst_rate, notes, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    makeId('work_part'), jobId, index + 1, part.partNumber, part.itemName,
    part.quantity, part.unitPrice, part.hsnSac, part.gstRate, part.notes,
    part.source, now
  ));
}

function publicVanillaWorkOrder(row) {
  const status = jobStatus(row.latest_event_type);
  return {
    id: row.id,
    workOrder: row.work_order,
    branchId: row.branch_id,
    branchCode: row.branch_code,
    branchName: row.branch_name,
    customerId: row.record_kind === 'customer' ? row.customer_id : null,
    customerCode: row.record_kind === 'customer' ? row.customer_code : null,
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    customerPlace: row.customer_place || '',
    customerMachineId: row.customer_machine_id || null,
    machineModelId: row.machine_model_id || null,
    modelName: row.model_name || '',
    makeName: row.make_name || '',
    machineDescription: row.machine_description || '',
    serialNumber: row.serial_number || '',
    accessories: parseJsonArray(row.accessories_json),
    complaint: row.complaint || '',
    observation: row.observation || '',
    workDone: row.work_done || '',
    assignedTo: row.assigned_to || null,
    assignedToName: row.assigned_to_name || '',
    billingSubtotal: row.billing_subtotal,
    billingTax: row.billing_tax,
    billingTotal: row.billing_total,
    billingNote: row.billing_note || '',
    openedBy: row.opened_by,
    openedByName: row.opened_by_name,
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
    status,
    statusLabel: JOB_STATUS_LABELS[status] || status
  };
}

async function listRepairJobs(env, session, url) {
  const query = cleanText(url.searchParams.get('query'), 120);
  const requestedStatus = cleanText(url.searchParams.get('status'), 40).toLowerCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 80, 1), 200);
  const conditions = [];
  const values = [];
  if (!hasRole(session, 'owner')) {
    conditions.push('j.branch_id = ?');
    values.push(session.branch_id);
  }
  if (query) {
    conditions.push('(j.work_order LIKE ? COLLATE NOCASE OR c.name LIKE ? COLLATE NOCASE OR c.phone LIKE ? OR j.serial_number LIKE ? COLLATE NOCASE)');
    const like = `%${query}%`;
    values.push(like, like, like, like);
  }
  if (requestedStatus && requestedStatus !== 'all' && JOB_STATUS_EVENTS[requestedStatus]) {
    const events = JOB_STATUS_EVENTS[requestedStatus];
    conditions.push(`je.event_type IN (${events.map(() => '?').join(', ')})`);
    values.push(...events);
  }
  values.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await env.DB.prepare(
    `SELECT j.id, j.work_order, j.branch_id, b.code AS branch_code, b.name AS branch_name,
      j.customer_id, c.customer_code, c.name AS customer_name, c.phone AS customer_phone,
      j.customer_machine_id, cm.display_name AS customer_machine_name,
      j.machine_model_id, mm.model_name, mk.name AS make_name, mm.machine_type,
      COALESCE(j.serial_number, cm.serial_number) AS serial_number,
      j.reported_problem, j.opened_at, j.updated_at,
      je.event_type AS latest_event_type, je.event_data_json AS latest_event_data,
      intake.event_data_json AS intake_event_data
     FROM repair_jobs j
     JOIN branches b ON b.id = j.branch_id
     JOIN customers c ON c.id = j.customer_id
     LEFT JOIN customer_machines cm ON cm.id = j.customer_machine_id
     LEFT JOIN machine_models mm ON mm.id = COALESCE(j.machine_model_id, cm.machine_model_id)
     LEFT JOIN machine_makes mk ON mk.id = mm.make_id
     LEFT JOIN job_events je ON je.id = (
       SELECT e.id FROM job_events e WHERE e.job_id = j.id AND e.event_type <> 'note_added'
       ORDER BY e.created_at DESC, e.id DESC LIMIT 1
     )
     LEFT JOIN job_events intake ON intake.id = (
       SELECT e.id FROM job_events e
       WHERE e.job_id = j.id AND e.event_type IN ('job_received', 'machine_received')
       ORDER BY e.created_at, e.id LIMIT 1
     )
     ${where}
     ORDER BY j.updated_at DESC LIMIT ?`
  ).bind(...values).all();
  return json({ ok: true, jobs: (result.results || []).map(publicRepairJob) });
}

async function getRepairJob(env, session, id) {
  const jobId = cleanText(id, 80);
  const job = await env.DB.prepare(
    `SELECT j.id, j.work_order, j.branch_id, b.code AS branch_code, b.name AS branch_name,
      j.customer_id, c.customer_code, c.name AS customer_name, c.phone AS customer_phone,
      c.alternate_phone AS customer_alternate_phone, c.address AS customer_address,
      j.customer_machine_id, cm.display_name AS customer_machine_name,
      j.machine_model_id, mm.model_name, mk.name AS make_name, mm.machine_type,
      COALESCE(j.serial_number, cm.serial_number) AS serial_number,
      j.reported_problem, j.opened_at, j.updated_at,
      je.event_type AS latest_event_type, je.event_data_json AS latest_event_data,
      intake.event_data_json AS intake_event_data
     FROM repair_jobs j
     JOIN branches b ON b.id = j.branch_id
     JOIN customers c ON c.id = j.customer_id
     LEFT JOIN customer_machines cm ON cm.id = j.customer_machine_id
     LEFT JOIN machine_models mm ON mm.id = COALESCE(j.machine_model_id, cm.machine_model_id)
     LEFT JOIN machine_makes mk ON mk.id = mm.make_id
     LEFT JOIN job_events je ON je.id = (
       SELECT e.id FROM job_events e WHERE e.job_id = j.id AND e.event_type <> 'note_added'
       ORDER BY e.created_at DESC, e.id DESC LIMIT 1
     )
     LEFT JOIN job_events intake ON intake.id = (
       SELECT e.id FROM job_events e
       WHERE e.job_id = j.id AND e.event_type IN ('job_received', 'machine_received')
       ORDER BY e.created_at, e.id LIMIT 1
     )
     WHERE j.id = ?`
  ).bind(jobId).first();
  if (!job) return json({ ok: false, error: 'Repair job not found.' }, 404);
  if (!hasRole(session, 'owner') && job.branch_id !== session.branch_id) {
    return json({ ok: false, error: 'This repair job belongs to another branch.' }, 403);
  }
  const result = await env.DB.prepare(
    `SELECT e.id, e.event_type, e.event_data_json, e.created_at, e.server_received_at,
      s.id AS created_by, s.name AS created_by_name
     FROM job_events e JOIN staff s ON s.id = e.created_by
     WHERE e.job_id = ? ORDER BY e.created_at, e.id`
  ).bind(jobId).all();
  const events = (result.results || []).map(publicJobEvent);
  return json({ ok: true, job: { ...publicRepairJob(job), events } });
}

async function createRepairJob(request, env, session) {
  const body = await readJson(request);
  const customerId = cleanText(body.customerId, 80);
  const requestedMachineId = cleanText(body.customerMachineId, 80) || null;
  let modelId = cleanText(body.machineModelId, 80) || null;
  let serialNumber = cleanText(body.serialNumber, 120).toUpperCase() || null;
  let machineDescription = cleanText(body.machineDescription, 160) || null;
  const reportedProblem = cleanText(body.reportedProblem, 2000);
  const urgency = cleanText(body.urgency, 20).toLowerCase() || 'normal';
  const accessories = cleanStringList(body.accessories, 20, 100);
  const intakeNotes = cleanText(body.intakeNotes, 1000) || null;
  if (!customerId || !reportedProblem) {
    return json({ ok: false, error: 'Customer and reported problem are required.' }, 400);
  }
  if (!['normal', 'high', 'urgent'].includes(urgency)) {
    return json({ ok: false, error: 'Select a valid urgency.' }, 400);
  }
  const customer = await env.DB.prepare('SELECT id FROM customers WHERE id = ? AND active = 1').bind(customerId).first();
  if (!customer) return json({ ok: false, error: 'Customer not found.' }, 404);
  let customerMachine = null;
  if (requestedMachineId) {
    customerMachine = await env.DB.prepare(
      `SELECT id, customer_id, machine_model_id, display_name, serial_number
       FROM customer_machines WHERE id = ? AND customer_id = ? AND active = 1`
    ).bind(requestedMachineId, customerId).first();
    if (!customerMachine) return json({ ok: false, error: 'Saved machine not found for this customer.' }, 404);
    modelId = customerMachine.machine_model_id || modelId;
    serialNumber = customerMachine.serial_number || serialNumber;
    machineDescription = customerMachine.display_name || machineDescription;
  } else if (serialNumber) {
    customerMachine = await env.DB.prepare(
      `SELECT id, customer_id, machine_model_id, display_name, serial_number
       FROM customer_machines
       WHERE customer_id = ? AND serial_number = ? AND active = 1 LIMIT 1`
    ).bind(customerId, serialNumber).first();
    if (customerMachine) {
      modelId = customerMachine.machine_model_id || modelId;
      machineDescription = customerMachine.display_name || machineDescription;
    }
  }
  let model = null;
  if (modelId) {
    model = await env.DB.prepare(
      `SELECT mm.id, mm.model_name, mm.machine_type, mk.name AS make_name
       FROM machine_models mm JOIN machine_makes mk ON mk.id = mm.make_id
       WHERE mm.id = ? AND mm.active = 1`
    ).bind(modelId).first();
    if (!model) return json({ ok: false, error: 'Machine model not found.' }, 404);
  }
  if (!customerMachine && !model && !machineDescription && !serialNumber) {
    return json({ ok: false, error: 'Select a saved machine, choose a model, or briefly describe the machine.' }, 400);
  }
  let branchId = session.branch_id;
  if (hasRole(session, 'owner') && body.branchId) branchId = cleanText(body.branchId, 80);
  const branch = await env.DB.prepare('SELECT id, code FROM branches WHERE id = ? AND active = 1').bind(branchId).first();
  if (!branch) return json({ ok: false, error: 'Branch not found.' }, 404);

  const now = new Date().toISOString();
  const jobId = makeId('job');
  const workOrder = makeWorkOrder(branch.code);
  const eventData = JSON.stringify({ urgency, accessories, intakeNotes });
  const customerMachineId = customerMachine?.id || makeId('customer_machine');
  const displayName = machineDescription ||
    [model?.make_name, model?.model_name].filter(Boolean).join(' ') ||
    `Machine ${serialNumber || ''}`.trim();
  const statements = [];
  if (customerMachine) {
    statements.push(
      env.DB.prepare(
        `UPDATE customer_machines SET last_seen_at = ?, updated_at = ?,
          machine_model_id = COALESCE(machine_model_id, ?),
          serial_number = COALESCE(serial_number, ?)
         WHERE id = ?`
      ).bind(now, now, modelId, serialNumber, customerMachineId)
    );
  } else {
    statements.push(
      env.DB.prepare(
        `INSERT INTO customer_machines
          (id, customer_id, machine_model_id, display_name, serial_number, notes,
           provisional, active, first_seen_at, last_seen_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, ?, ?, ?)`
      ).bind(
        customerMachineId, customerId, modelId, displayName, serialNumber,
        model ? 0 : 1, now, now, session.id, now, now
      )
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO repair_jobs
        (id, work_order, branch_id, customer_id, customer_machine_id, machine_model_id,
         serial_number, reported_problem, opened_by, opened_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      jobId, workOrder, branchId, customerId, customerMachineId, modelId,
      serialNumber, reportedProblem, session.id, now, now
    ),
    env.DB.prepare(
      `INSERT INTO job_events
        (id, job_id, event_type, event_data_json, created_by, created_at, server_received_at)
       VALUES (?, ?, 'machine_received', ?, ?, ?, ?)`
    ).bind(makeId('event'), jobId, eventData, session.id, now, now)
  );
  await env.DB.batch(statements);
  return getRepairJob(env, session, jobId).then(async response => {
    const payload = await response.json();
    return json(payload, 201);
  });
}

async function addRepairJobEvent(request, env, session, id) {
  const jobId = cleanText(id, 80);
  const body = await readJson(request);
  const eventType = cleanText(body.eventType, 50).toLowerCase();
  const note = cleanText(body.note, 1500) || null;
  const job = await env.DB.prepare(
    `SELECT j.id, j.branch_id, d.assigned_to
     FROM repair_jobs j
     LEFT JOIN work_order_details d ON d.job_id = j.id
     WHERE j.id = ?`
  ).bind(jobId).first();
  if (!job) return json({ ok: false, error: 'Repair job not found.' }, 404);
  if (!hasRole(session, 'owner') && job.branch_id !== session.branch_id) {
    return json({ ok: false, error: 'This repair job belongs to another branch.' }, 403);
  }
  const latest = await env.DB.prepare(
    `SELECT event_type, event_data_json FROM job_events
     WHERE job_id = ? AND event_type <> 'note_added'
     ORDER BY created_at DESC, id DESC LIMIT 1`
  ).bind(jobId).first();
  const currentStatus = jobStatus(latest?.event_type);
  if (eventType !== 'note_added' && !JOB_TRANSITIONS[currentStatus]?.has(eventType)) {
    return json({ ok: false, error: `That action is not available while this job is ${JOB_STATUS_LABELS[currentStatus] || currentStatus}.` }, 409);
  }
  if (['note_added', 'inspection_observed'].includes(eventType) && !note) {
    return json({ ok: false, error: 'Enter a workshop note first.' }, 400);
  }
  if (eventType === 'job_taken' && job.assigned_to && job.assigned_to !== session.id && !hasRole(session, 'manager', 'owner')) {
    return json({ ok: false, error: 'This job is already assigned to another technician.' }, 409);
  }
  const pauseReason = cleanText(body.pauseReason, 40);
  if (eventType === 'job_paused' && !JOB_PAUSE_REASONS.has(pauseReason)) {
    return json({ ok: false, error: 'Select why this job is paused.' }, 400);
  }
  const latestData = parseJsonObject(latest?.event_data_json);
  const eventData = {
    note,
    pauseReason: eventType === 'job_paused' ? pauseReason : null,
    resumedFromReason: eventType === 'job_resumed'
      ? (latestData.pauseReason || latestData.reason || latestData.note || null)
      : null,
    estimateAmount: optionalNumber(body.estimateAmount),
    serviceTypeIds: cleanStringList(body.serviceTypeIds, 30, 80)
  };
  let formalEstimate = null;
  if (['estimate_created', 'inspection_completed', 'estimate_approved'].includes(eventType)) {
    formalEstimate = await env.DB.prepare(
      'SELECT id, estimate_number, grand_total FROM job_estimates WHERE job_id = ?'
    ).bind(jobId).first();
    if (!formalEstimate) {
      return json({ ok: false, error: 'Prepare and save the itemised estimate first.' }, 409);
    }
    eventData.estimateId = formalEstimate.id;
    eventData.estimateNumber = formalEstimate.estimate_number;
    eventData.estimateAmount = Number(formalEstimate.grand_total);
  }
  if (eventData.estimateAmount !== null && (!Number.isFinite(eventData.estimateAmount) || eventData.estimateAmount < 0)) {
    return json({ ok: false, error: 'Estimate amount must be a positive number or blank.' }, 400);
  }
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare(
      `INSERT INTO job_events
        (id, job_id, event_type, event_data_json, created_by, created_at, server_received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(makeId('event'), jobId, eventType, JSON.stringify(eventData), session.id, now, now),
    env.DB.prepare('UPDATE repair_jobs SET updated_at = ? WHERE id = ?').bind(now, jobId)
  ];
  if (eventType === 'job_taken') {
    statements.push(
      env.DB.prepare(
        `INSERT INTO work_order_details
          (job_id, assigned_to, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           assigned_to = excluded.assigned_to,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`
      ).bind(jobId, session.id, now, now, session.id)
    );
  }
  if (eventType === 'inspection_observed') {
    statements.push(
      env.DB.prepare(
        `INSERT INTO work_order_details
          (job_id, observation, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(job_id) DO UPDATE SET
           observation = CASE
             WHEN TRIM(COALESCE(work_order_details.observation, '')) = '' THEN excluded.observation
             ELSE work_order_details.observation || CHAR(10) || excluded.observation
           END,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`
      ).bind(jobId, note, now, now, session.id)
    );
  }
  if (eventType === 'estimate_approved') {
    statements.push(
      env.DB.prepare(
        "UPDATE job_estimates SET status = 'approved', updated_by = ?, updated_at = ? WHERE job_id = ?"
      ).bind(session.id, now, jobId)
    );
  } else if (eventType === 'estimate_created' || eventType === 'inspection_completed') {
    statements.push(
      env.DB.prepare(
        "UPDATE job_estimates SET status = 'sent', updated_by = ?, updated_at = ? WHERE job_id = ?"
      ).bind(session.id, now, jobId)
    );
  }
  await env.DB.batch(statements);
  return getRepairJob(env, session, jobId);
}

async function getJobEstimate(env, session, id) {
  const jobId = cleanText(id, 80);
  const job = await env.DB.prepare(
    `SELECT j.id, j.branch_id, j.work_order, b.code AS branch_code,
      (SELECT e.event_type FROM job_events e
       WHERE e.job_id = j.id AND e.event_type <> 'note_added'
       ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS latest_event_type
     FROM repair_jobs j JOIN branches b ON b.id = j.branch_id WHERE j.id = ?`
  ).bind(jobId).first();
  if (!job) return json({ ok: false, error: 'Repair job not found.' }, 404);
  if (!hasRole(session, 'owner') && job.branch_id !== session.branch_id) {
    return json({ ok: false, error: 'This repair job belongs to another branch.' }, 403);
  }
  const estimate = await env.DB.prepare(
    `SELECT e.id, e.job_id, e.estimate_number, e.status, e.notes, e.subtotal,
      e.tax_total, e.grand_total, e.created_at, e.updated_at,
      creator.name AS created_by_name, updater.name AS updated_by_name
     FROM job_estimates e
     JOIN staff creator ON creator.id = e.created_by
     JOIN staff updater ON updater.id = e.updated_by
     WHERE e.job_id = ?`
  ).bind(jobId).first();
  if (!estimate) return json({ ok: true, estimate: null, job });
  const result = await env.DB.prepare(
    `SELECT id, line_number, item_type, part_number, description, hsn_sac,
      gst_rate, quantity, unit_price, taxable_amount, tax_amount, line_total, source
     FROM job_estimate_items WHERE estimate_id = ? ORDER BY line_number`
  ).bind(estimate.id).all();
  return json({ ok: true, estimate: { ...estimate, items: result.results || [] }, job });
}

async function saveJobEstimate(request, env, session, id) {
  const jobId = cleanText(id, 80);
  const job = await env.DB.prepare(
    `SELECT j.id, j.branch_id, j.work_order, b.code AS branch_code,
      (SELECT e.event_type FROM job_events e
       WHERE e.job_id = j.id AND e.event_type <> 'note_added'
       ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS latest_event_type
     FROM repair_jobs j JOIN branches b ON b.id = j.branch_id WHERE j.id = ?`
  ).bind(jobId).first();
  if (!job) return json({ ok: false, error: 'Repair job not found.' }, 404);
  if (!hasRole(session, 'owner') && job.branch_id !== session.branch_id) {
    return json({ ok: false, error: 'This repair job belongs to another branch.' }, 403);
  }
  if (['returned', 'cancelled'].includes(jobStatus(job.latest_event_type))) {
    return json({ ok: false, error: 'This repair job is closed and its estimate cannot be changed.' }, 409);
  }

  const body = await readJson(request);
  const inputItems = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
  if (!inputItems.length) return json({ ok: false, error: 'Add at least one estimate item.' }, 400);
  const items = [];
  for (let index = 0; index < inputItems.length; index += 1) {
    const input = inputItems[index] || {};
    const itemType = cleanText(input.itemType, 20).toLowerCase() || 'part';
    const partNumber = cleanText(input.partNumber, 100).toUpperCase() || null;
    const description = cleanText(input.description, 300);
    const hsnSac = cleanText(input.hsnSac, 30).toUpperCase();
    const gstRate = Number(input.gstRate);
    const quantity = Number(input.quantity);
    const unitPrice = Number(input.unitPrice);
    if (!['part', 'service', 'other'].includes(itemType)) {
      return json({ ok: false, error: `Estimate row ${index + 1} has an invalid item type.` }, 400);
    }
    if (!description || !hsnSac || !Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100 ||
        !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      return json({ ok: false, error: `Complete description, HSN/SAC, GST, quantity and rate for estimate row ${index + 1}.` }, 400);
    }
    if (itemType === 'part' && !partNumber) {
      return json({ ok: false, error: `Part number is required for estimate row ${index + 1}.` }, 400);
    }
    const taxableAmount = roundMoney(quantity * unitPrice);
    const taxAmount = roundMoney(taxableAmount * gstRate / 100);
    items.push({
      itemType,
      partNumber,
      description,
      hsnSac,
      gstRate,
      quantity,
      unitPrice: roundMoney(unitPrice),
      taxableAmount,
      taxAmount,
      lineTotal: roundMoney(taxableAmount + taxAmount),
      source: cleanText(input.source, 80) || 'manual'
    });
  }

  const subtotal = roundMoney(items.reduce((total, item) => total + item.taxableAmount, 0));
  const taxTotal = roundMoney(items.reduce((total, item) => total + item.taxAmount, 0));
  const grandTotal = roundMoney(subtotal + taxTotal);
  const notes = cleanText(body.notes, 1500) || null;
  const existing = await env.DB.prepare(
    'SELECT id, estimate_number FROM job_estimates WHERE job_id = ?'
  ).bind(jobId).first();
  const estimateId = existing?.id || makeId('estimate');
  const estimateNumber = existing?.estimate_number || makeEstimateNumber(job.branch_code);
  const now = new Date().toISOString();
  const statements = [];
  if (existing) {
    statements.push(
      env.DB.prepare(
        `UPDATE job_estimates SET status = 'draft', notes = ?, subtotal = ?, tax_total = ?,
          grand_total = ?, updated_by = ?, updated_at = ? WHERE id = ?`
      ).bind(notes, subtotal, taxTotal, grandTotal, session.id, now, estimateId)
    );
  } else {
    statements.push(
      env.DB.prepare(
        `INSERT INTO job_estimates
          (id, job_id, estimate_number, status, notes, subtotal, tax_total, grand_total,
           created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        estimateId, jobId, estimateNumber, notes, subtotal, taxTotal, grandTotal,
        session.id, session.id, now, now
      )
    );
  }
  statements.push(
    env.DB.prepare('DELETE FROM job_estimate_items WHERE estimate_id = ?').bind(estimateId)
  );
  items.forEach((item, index) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO job_estimate_items
          (id, estimate_id, line_number, item_type, part_number, description, hsn_sac,
           gst_rate, quantity, unit_price, taxable_amount, tax_amount, line_total, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        makeId('estimate_item'), estimateId, index + 1, item.itemType, item.partNumber,
        item.description, item.hsnSac, item.gstRate, item.quantity, item.unitPrice,
        item.taxableAmount, item.taxAmount, item.lineTotal, item.source
      )
    );
  });
  statements.push(
    env.DB.prepare('UPDATE repair_jobs SET updated_at = ? WHERE id = ?').bind(now, jobId)
  );
  await env.DB.batch(statements);
  return getJobEstimate(env, session, jobId);
}

async function getRepairContext(env, session, id) {
  const jobId = cleanText(id, 80);
  const job = await env.DB.prepare(
    `SELECT j.id, j.branch_id, j.work_order, j.customer_id, j.customer_machine_id,
      j.reported_problem, j.serial_number, b.code AS branch_code, b.name AS branch_name,
      c.customer_code, c.name AS customer_name, c.phone AS customer_phone,
      c.alternate_phone AS customer_alternate_phone, c.address AS customer_address,
      cm.display_name AS customer_machine_name,
      COALESCE(j.serial_number, cm.serial_number) AS machine_serial_number,
      mm.model_name, mm.machine_type, mk.name AS make_name
     FROM repair_jobs j
     JOIN branches b ON b.id = j.branch_id
     JOIN customers c ON c.id = j.customer_id
     LEFT JOIN customer_machines cm ON cm.id = j.customer_machine_id
     LEFT JOIN machine_models mm ON mm.id = COALESCE(j.machine_model_id, cm.machine_model_id)
     LEFT JOIN machine_makes mk ON mk.id = mm.make_id
     WHERE j.id = ?`
  ).bind(jobId).first();
  if (!job) return { error: json({ ok: false, error: 'Repair job not found.' }, 404) };
  if (!hasRole(session, 'owner') && job.branch_id !== session.branch_id) {
    return { error: json({ ok: false, error: 'This repair job belongs to another branch.' }, 403) };
  }
  const latest = await env.DB.prepare(
    "SELECT event_type FROM job_events WHERE job_id = ? AND event_type <> 'note_added' ORDER BY created_at DESC, id DESC LIMIT 1"
  ).bind(jobId).first();
  return { job, status: jobStatus(latest?.event_type) };
}

async function getServiceRecord(env, session, id) {
  const context = await getRepairContext(env, session, id);
  if (context.error) return context.error;
  const record = await env.DB.prepare(
    `SELECT r.id, r.job_id, r.record_number, r.status, r.technician_id,
      r.diagnosis, r.work_performed, r.notes, r.subtotal, r.tax_total,
      r.grand_total, r.completed_at, r.created_at, r.updated_at,
      s.name AS technician_name
     FROM job_service_records r
     JOIN staff s ON s.id = r.technician_id
     WHERE r.job_id = ?`
  ).bind(context.job.id).first();
  if (record) {
    const result = await env.DB.prepare(
      `SELECT id, line_number, item_type, part_number, description, hsn_sac,
        gst_rate, quantity, unit_price, taxable_amount, tax_amount, line_total, source
       FROM job_service_items WHERE service_record_id = ? ORDER BY line_number`
    ).bind(record.id).all();
    const billing = await env.DB.prepare(
      `SELECT id, billing_reference, status, subtotal, tax_total, grand_total, generated_at
       FROM job_billing_materials WHERE job_id = ?`
    ).bind(context.job.id).first();
    return json({
      ok: true,
      serviceRecord: { ...record, items: result.results || [] },
      suggestedItems: [],
      billing: billing || null,
      jobStatus: context.status
    });
  }
  const estimate = await env.DB.prepare(
    `SELECT id, estimate_number, status, notes FROM job_estimates WHERE job_id = ?`
  ).bind(context.job.id).first();
  let suggestedItems = [];
  if (estimate) {
    const result = await env.DB.prepare(
      `SELECT item_type, part_number, description, hsn_sac, gst_rate, quantity,
        unit_price, source FROM job_estimate_items WHERE estimate_id = ? ORDER BY line_number`
    ).bind(estimate.id).all();
    suggestedItems = result.results || [];
  }
  return json({
    ok: true,
    serviceRecord: null,
    suggestedItems,
    estimate: estimate || null,
    billing: null,
    jobStatus: context.status
  });
}

async function prepareServiceRecordInput(body, requireCompletionFields = false) {
  const diagnosis = cleanText(body.diagnosis, 2000) || null;
  const workPerformed = cleanText(body.workPerformed, 3000) || null;
  const notes = cleanText(body.notes, 1500) || null;
  const prepared = prepareCommercialItems(body.items, 'service record', 35);
  if (prepared.error) return prepared;
  if (requireCompletionFields && !diagnosis) {
    return { error: 'Record the diagnosis before completing the work.' };
  }
  if (requireCompletionFields && !workPerformed) {
    return { error: 'Record the work performed before completing the work.' };
  }
  return { diagnosis, workPerformed, notes, ...prepared };
}

function prepareCommercialItems(value, label, maxItems) {
  const inputItems = Array.isArray(value) ? value.slice(0, maxItems) : [];
  if (!inputItems.length) return { error: `Add at least one ${label} item.` };
  const items = [];
  for (let index = 0; index < inputItems.length; index += 1) {
    const input = inputItems[index] || {};
    const itemType = cleanText(input.itemType, 20).toLowerCase() || 'part';
    const partNumber = cleanText(input.partNumber, 100).toUpperCase() || null;
    const description = cleanText(input.description, 300);
    const hsnSac = cleanText(input.hsnSac, 30).toUpperCase();
    const gstRate = Number(input.gstRate);
    const quantity = Number(input.quantity);
    const unitPrice = Number(input.unitPrice);
    if (!['part', 'service', 'other'].includes(itemType)) {
      return { error: `${titleCase(label)} row ${index + 1} has an invalid item type.` };
    }
    if (!description || !hsnSac || !Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100 ||
        !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      return { error: `Complete description, HSN/SAC, GST, quantity and rate for ${label} row ${index + 1}.` };
    }
    if (itemType === 'part' && !partNumber) {
      return { error: `Part number is required for ${label} row ${index + 1}.` };
    }
    const taxableAmount = roundMoney(quantity * unitPrice);
    const taxAmount = roundMoney(taxableAmount * gstRate / 100);
    items.push({
      itemType,
      partNumber,
      description,
      hsnSac,
      gstRate,
      quantity,
      unitPrice: roundMoney(unitPrice),
      taxableAmount,
      taxAmount,
      lineTotal: roundMoney(taxableAmount + taxAmount),
      source: cleanText(input.source, 80) || 'manual'
    });
  }
  const subtotal = roundMoney(items.reduce((total, item) => total + item.taxableAmount, 0));
  const taxTotal = roundMoney(items.reduce((total, item) => total + item.taxAmount, 0));
  return { items, subtotal, taxTotal, grandTotal: roundMoney(subtotal + taxTotal) };
}

function titleCase(value) {
  return String(value || '').replace(/\b\w/g, letter => letter.toUpperCase());
}

function serviceItemStatements(env, recordId, items) {
  return items.map((item, index) => env.DB.prepare(
    `INSERT INTO job_service_items
      (id, service_record_id, line_number, item_type, part_number, description,
       hsn_sac, gst_rate, quantity, unit_price, taxable_amount, tax_amount,
       line_total, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    makeId('service_item'), recordId, index + 1, item.itemType, item.partNumber,
    item.description, item.hsnSac, item.gstRate, item.quantity, item.unitPrice,
    item.taxableAmount, item.taxAmount, item.lineTotal, item.source
  ));
}

async function saveServiceRecord(request, env, session, id) {
  const context = await getRepairContext(env, session, id);
  if (context.error) return context.error;
  if (['returned', 'cancelled'].includes(context.status)) {
    return json({ ok: false, error: 'This repair case is closed.' }, 409);
  }
  const body = await readJson(request);
  const prepared = await prepareServiceRecordInput(body);
  if (prepared.error) return json({ ok: false, error: prepared.error }, 400);
  const existing = await env.DB.prepare(
    'SELECT id, record_number, status FROM job_service_records WHERE job_id = ?'
  ).bind(context.job.id).first();
  if (existing?.status === 'completed') {
    return json({ ok: false, error: 'Completed service records cannot be silently changed.' }, 409);
  }
  const technicianId = cleanText(body.technicianId, 80) || session.id;
  const technician = await env.DB.prepare(
    'SELECT id, branch_id FROM staff WHERE id = ? AND active = 1'
  ).bind(technicianId).first();
  if (!technician || (!hasRole(session, 'owner') && technician.branch_id !== context.job.branch_id)) {
    return json({ ok: false, error: 'Select an active technician from this branch.' }, 400);
  }
  const recordId = existing?.id || makeId('service_record');
  const recordNumber = existing?.record_number || makeServiceRecordNumber(context.job.branch_code);
  const now = new Date().toISOString();
  const statements = [];
  if (existing) {
    statements.push(env.DB.prepare(
      `UPDATE job_service_records SET technician_id = ?, diagnosis = ?,
        work_performed = ?, notes = ?, subtotal = ?, tax_total = ?,
        grand_total = ?, updated_by = ?, updated_at = ? WHERE id = ?`
    ).bind(
      technicianId, prepared.diagnosis, prepared.workPerformed, prepared.notes,
      prepared.subtotal, prepared.taxTotal, prepared.grandTotal, session.id, now, recordId
    ));
  } else {
    statements.push(env.DB.prepare(
      `INSERT INTO job_service_records
        (id, job_id, record_number, status, technician_id, diagnosis, work_performed,
         notes, subtotal, tax_total, grand_total, completed_at, created_by,
         updated_by, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
    ).bind(
      recordId, context.job.id, recordNumber, technicianId, prepared.diagnosis,
      prepared.workPerformed, prepared.notes, prepared.subtotal, prepared.taxTotal,
      prepared.grandTotal, session.id, session.id, now, now
    ));
  }
  statements.push(
    env.DB.prepare('DELETE FROM job_service_items WHERE service_record_id = ?').bind(recordId),
    ...serviceItemStatements(env, recordId, prepared.items),
    env.DB.prepare('UPDATE repair_jobs SET updated_at = ? WHERE id = ?').bind(now, context.job.id)
  );
  await env.DB.batch(statements);
  return getServiceRecord(env, session, context.job.id);
}

async function completeServiceRecord(request, env, session, id) {
  const context = await getRepairContext(env, session, id);
  if (context.error) return context.error;
  if (context.status === 'ready') {
    const existingBilling = await env.DB.prepare(
      'SELECT id FROM job_billing_materials WHERE job_id = ?'
    ).bind(context.job.id).first();
    if (existingBilling) return getBillingMaterial(env, session, context.job.id);
  }
  if (context.status !== 'repairing') {
    return json({ ok: false, error: 'Start or resume the repair before completing the service record.' }, 409);
  }
  const body = await readJson(request);
  const prepared = await prepareServiceRecordInput(body, true);
  if (prepared.error) return json({ ok: false, error: prepared.error }, 400);
  const existing = await env.DB.prepare(
    'SELECT id, record_number, status FROM job_service_records WHERE job_id = ?'
  ).bind(context.job.id).first();
  if (existing?.status === 'completed') {
    return json({ ok: false, error: 'This work has already been completed.' }, 409);
  }
  const technicianId = cleanText(body.technicianId, 80) || session.id;
  const technician = await env.DB.prepare(
    'SELECT id, branch_id, name FROM staff WHERE id = ? AND active = 1'
  ).bind(technicianId).first();
  if (!technician || (!hasRole(session, 'owner') && technician.branch_id !== context.job.branch_id)) {
    return json({ ok: false, error: 'Select an active technician from this branch.' }, 400);
  }

  const now = new Date().toISOString();
  const recordId = existing?.id || makeId('service_record');
  const recordNumber = existing?.record_number || makeServiceRecordNumber(context.job.branch_code);
  const previousBilling = await env.DB.prepare(
    'SELECT id, billing_reference FROM job_billing_materials WHERE job_id = ?'
  ).bind(context.job.id).first();
  const billingId = previousBilling?.id || makeId('billing_material');
  const billingReference = previousBilling?.billing_reference || makeBillingReference(context.job.branch_code);
  const customerSnapshot = JSON.stringify({
    id: context.job.customer_id,
    code: context.job.customer_code,
    name: context.job.customer_name,
    phone: context.job.customer_phone,
    alternatePhone: context.job.customer_alternate_phone,
    address: context.job.customer_address
  });
  const machineSnapshot = JSON.stringify({
    id: context.job.customer_machine_id,
    name: context.job.customer_machine_name ||
      [context.job.make_name, context.job.model_name].filter(Boolean).join(' ') ||
      'Machine',
    make: context.job.make_name,
    model: context.job.model_name,
    type: context.job.machine_type,
    serialNumber: context.job.machine_serial_number
  });
  const statements = [];
  if (existing) {
    statements.push(env.DB.prepare(
      `UPDATE job_service_records SET status = 'completed', technician_id = ?,
        diagnosis = ?, work_performed = ?, notes = ?, subtotal = ?, tax_total = ?,
        grand_total = ?, completed_at = ?, updated_by = ?, updated_at = ? WHERE id = ?`
    ).bind(
      technicianId, prepared.diagnosis, prepared.workPerformed, prepared.notes,
      prepared.subtotal, prepared.taxTotal, prepared.grandTotal, now, session.id, now, recordId
    ));
  } else {
    statements.push(env.DB.prepare(
      `INSERT INTO job_service_records
        (id, job_id, record_number, status, technician_id, diagnosis, work_performed,
         notes, subtotal, tax_total, grand_total, completed_at, created_by,
         updated_by, created_at, updated_at)
       VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      recordId, context.job.id, recordNumber, technicianId, prepared.diagnosis,
      prepared.workPerformed, prepared.notes, prepared.subtotal, prepared.taxTotal,
      prepared.grandTotal, now, session.id, session.id, now, now
    ));
  }
  statements.push(
    env.DB.prepare('DELETE FROM job_service_items WHERE service_record_id = ?').bind(recordId),
    ...serviceItemStatements(env, recordId, prepared.items)
  );
  if (previousBilling) {
    statements.push(env.DB.prepare(
      `UPDATE job_billing_materials SET service_record_id = ?, status = 'ready',
        customer_snapshot_json = ?, machine_snapshot_json = ?, subtotal = ?,
        tax_total = ?, grand_total = ?, generated_by = ?, generated_at = ?,
        updated_at = ? WHERE id = ?`
    ).bind(
      recordId, customerSnapshot, machineSnapshot, prepared.subtotal, prepared.taxTotal,
      prepared.grandTotal, session.id, now, now, billingId
    ));
  } else {
    statements.push(env.DB.prepare(
      `INSERT INTO job_billing_materials
        (id, job_id, service_record_id, billing_reference, status,
         customer_snapshot_json, machine_snapshot_json, subtotal, tax_total,
         grand_total, generated_by, generated_at, updated_at)
       VALUES (?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      billingId, context.job.id, recordId, billingReference, customerSnapshot,
      machineSnapshot, prepared.subtotal, prepared.taxTotal, prepared.grandTotal,
      session.id, now, now
    ));
  }
  statements.push(
    env.DB.prepare('DELETE FROM job_billing_items WHERE billing_material_id = ?').bind(billingId)
  );
  prepared.items.forEach((item, index) => statements.push(env.DB.prepare(
    `INSERT INTO job_billing_items
      (id, billing_material_id, line_number, item_type, part_number, description,
       hsn_sac, gst_rate, quantity, unit_price, taxable_amount, tax_amount, line_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    makeId('billing_item'), billingId, index + 1, item.itemType, item.partNumber,
    item.description, item.hsnSac, item.gstRate, item.quantity, item.unitPrice,
    item.taxableAmount, item.taxAmount, item.lineTotal
  )));
  const eventData = JSON.stringify({
    serviceRecordId: recordId,
    serviceRecordNumber: recordNumber,
    billingReference,
    technicianId,
    technicianName: technician.name,
    grandTotal: prepared.grandTotal,
    note: prepared.workPerformed
  });
  statements.push(
    env.DB.prepare(
      `INSERT INTO job_events
        (id, job_id, event_type, event_data_json, created_by, created_at, server_received_at)
       VALUES (?, ?, 'repair_completed', ?, ?, ?, ?)`
    ).bind(makeId('event'), context.job.id, eventData, session.id, now, now),
    env.DB.prepare('UPDATE repair_jobs SET updated_at = ? WHERE id = ?').bind(now, context.job.id)
  );
  await env.DB.batch(statements);
  return getBillingMaterial(env, session, context.job.id);
}

async function getBillingMaterial(env, session, id) {
  const context = await getRepairContext(env, session, id);
  if (context.error) return context.error;
  const billing = await env.DB.prepare(
    `SELECT b.id, b.job_id, b.service_record_id, b.billing_reference, b.status,
      b.customer_snapshot_json, b.machine_snapshot_json, b.subtotal, b.tax_total,
      b.grand_total, b.generated_at, b.updated_at,
      r.record_number AS service_record_number, r.diagnosis, r.work_performed,
      s.name AS technician_name
     FROM job_billing_materials b
     JOIN job_service_records r ON r.id = b.service_record_id
     JOIN staff s ON s.id = r.technician_id
     WHERE b.job_id = ?`
  ).bind(context.job.id).first();
  if (!billing) return json({ ok: true, billing: null });
  const result = await env.DB.prepare(
    `SELECT id, line_number, item_type, part_number, description, hsn_sac,
      gst_rate, quantity, unit_price, taxable_amount, tax_amount, line_total
     FROM job_billing_items WHERE billing_material_id = ? ORDER BY line_number`
  ).bind(billing.id).all();
  return json({
    ok: true,
    billing: {
      ...billing,
      customer: parseJsonObject(billing.customer_snapshot_json),
      machine: parseJsonObject(billing.machine_snapshot_json),
      customer_snapshot_json: undefined,
      machine_snapshot_json: undefined,
      items: result.results || []
    }
  });
}

function publicRepairJob(row) {
  const intake = parseJsonObject(row.intake_event_data || row.latest_event_data);
  const status = jobStatus(row.latest_event_type);
  return {
    ...row,
    status,
    status_label: JOB_STATUS_LABELS[status] || status,
    urgency: intake.urgency || null,
    accessories: Array.isArray(intake.accessories) ? intake.accessories : [],
    latest_event_data: undefined,
    intake_event_data: undefined
  };
}

function publicJobEvent(row) {
  return { ...row, data: parseJsonObject(row.event_data_json), event_data_json: undefined };
}

function jobStatus(eventType) {
  return JOB_EVENT_STATUS[eventType] || 'received';
}

function makeWorkOrder(branchCode) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `WO-${date}-${cleanText(branchCode, 12).toUpperCase()}-${suffix}`;
}

function makeEstimateNumber(branchCode) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `EST-${date}-${cleanText(branchCode, 12).toUpperCase()}-${suffix}`;
}

function makeServiceRecordNumber(branchCode) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `SR-${date}-${cleanText(branchCode, 12).toUpperCase()}-${suffix}`;
}

function makeBillingReference(branchCode) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `BILL-${date}-${cleanText(branchCode, 12).toUpperCase()}-${suffix}`;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function cleanStringList(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const STAFF_ROLES = new Set(['staff', 'manager', 'owner']);

async function listStaff(env, session) {
  let result;
  if (hasRole(session, 'owner')) {
    result = await env.DB.prepare(
      `SELECT s.id, s.branch_id, b.code AS branch_code, b.name AS branch_name, s.employee_code,
        s.name, s.phone, s.email, s.role, s.active,
        CASE WHEN s.pin_hash IS NOT NULL THEN 1 ELSE 0 END AS has_pin,
        s.created_at, s.updated_at
       FROM staff s JOIN branches b ON b.id = s.branch_id
       ORDER BY s.active DESC, b.name, s.name`
    ).all();
  } else {
    result = await env.DB.prepare(
      `SELECT s.id, s.branch_id, b.code AS branch_code, b.name AS branch_name, s.employee_code,
        s.name, s.phone, s.email, s.role, s.active,
        CASE WHEN s.pin_hash IS NOT NULL THEN 1 ELSE 0 END AS has_pin,
        s.created_at, s.updated_at
       FROM staff s JOIN branches b ON b.id = s.branch_id
       WHERE s.branch_id = ? ORDER BY s.active DESC, s.name`
    ).bind(session.branch_id).all();
  }
  return json({ ok: true, staff: result.results || [] });
}

async function createStaff(request, env, session) {
  const body = await readJson(request);
  const input = staffInput(body);
  const pin = String(body.pin || '');
  if (!hasRole(session, 'owner')) {
    input.branch_id = session.branch_id;
    input.role = 'staff';
  }
  const validation = validateStaff(input, pin, true);
  if (validation) return json({ ok: false, error: validation }, 400);
  const branch = await env.DB.prepare('SELECT id, code FROM branches WHERE id = ? AND active = 1').bind(input.branch_id).first();
  if (!branch) return json({ ok: false, error: 'Active branch not found.' }, 404);
  const employeeCode = input.employee_code || makeEmployeeCode(branch.code);
  const duplicate = await env.DB.prepare(
    'SELECT id FROM staff WHERE employee_code = ? COLLATE NOCASE LIMIT 1'
  ).bind(employeeCode).first();
  if (duplicate) return json({ ok: false, error: 'That employee code already exists.' }, 409);
  if (input.email) {
    const emailDuplicate = await env.DB.prepare(
      'SELECT id FROM staff WHERE email = ? COLLATE NOCASE LIMIT 1'
    ).bind(input.email).first();
    if (emailDuplicate) return json({ ok: false, error: 'That email address already belongs to another staff account.' }, 409);
  }
  const salt = randomToken(16);
  const pinHash = await hashPin(pin, salt);
  const now = new Date().toISOString();
  const staff = {
    id: makeId('staff'), ...input, employee_code: employeeCode, active: 1,
    branch_code: branch.code, has_pin: 1, created_at: now, updated_at: now
  };
  await env.DB.prepare(
    `INSERT INTO staff
      (id, branch_id, employee_code, name, phone, email, role, pin_salt, pin_hash, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).bind(
    staff.id, staff.branch_id, staff.employee_code, staff.name, staff.phone, staff.email,
    staff.role, salt, pinHash, now, now
  ).run();
  const created = await getStaffRecord(env, staff.id);
  return json({ ok: true, staff: created }, 201);
}

async function updateStaff(request, env, session, id) {
  const staffId = cleanText(id, 80);
  const existing = await env.DB.prepare(
    `SELECT id, branch_id, employee_code, name, phone, email, role, active
     FROM staff WHERE id = ?`
  ).bind(staffId).first();
  if (!existing) return json({ ok: false, error: 'Staff account not found.' }, 404);
  if (!hasRole(session, 'owner') && (existing.branch_id !== session.branch_id || existing.role !== 'staff')) {
    return json({ ok: false, error: 'Managers can update staff accounts in their own branch only.' }, 403);
  }

  const body = await readJson(request);
  const input = staffInput(body);
  const pin = String(body.pin || '');
  if (!hasRole(session, 'owner')) {
    input.branch_id = session.branch_id;
    input.role = 'staff';
  }
  let active = body.active === false ? 0 : 1;
  if (staffId === session.id) {
    input.branch_id = existing.branch_id;
    input.role = existing.role;
    active = existing.active;
  }
  const validation = validateStaff(input, pin, false);
  if (validation) return json({ ok: false, error: validation }, 400);
  const branch = await env.DB.prepare('SELECT id FROM branches WHERE id = ? AND active = 1').bind(input.branch_id).first();
  if (!branch) return json({ ok: false, error: 'Active branch not found.' }, 404);
  const employeeCode = input.employee_code || existing.employee_code || makeEmployeeCode('EMP');
  const duplicate = await env.DB.prepare(
    'SELECT id FROM staff WHERE employee_code = ? COLLATE NOCASE AND id <> ? LIMIT 1'
  ).bind(employeeCode, staffId).first();
  if (duplicate) return json({ ok: false, error: 'That employee code already exists.' }, 409);
  if (input.email) {
    const emailDuplicate = await env.DB.prepare(
      'SELECT id FROM staff WHERE email = ? COLLATE NOCASE AND id <> ? LIMIT 1'
    ).bind(input.email, staffId).first();
    if (emailDuplicate) return json({ ok: false, error: 'That email address already belongs to another staff account.' }, 409);
  }
  if (existing.role === 'owner' && existing.active && (input.role !== 'owner' || !active)) {
    const owners = await env.DB.prepare("SELECT COUNT(*) AS total FROM staff WHERE role = 'owner' AND active = 1").first();
    if (Number(owners?.total || 0) <= 1) {
      return json({ ok: false, error: 'The final active owner cannot be deactivated or changed to another role.' }, 409);
    }
  }

  const now = new Date().toISOString();
  const statements = [];
  if (pin) {
    const salt = randomToken(16);
    const pinHash = await hashPin(pin, salt);
    statements.push(env.DB.prepare(
      `UPDATE staff SET branch_id = ?, employee_code = ?, name = ?, phone = ?, email = ?, role = ?,
        pin_salt = ?, pin_hash = ?, active = ?, updated_at = ? WHERE id = ?`
    ).bind(
      input.branch_id, employeeCode, input.name, input.phone, input.email, input.role,
      salt, pinHash, active, now, staffId
    ));
    if (staffId === session.id) {
      statements.push(env.DB.prepare('DELETE FROM sessions WHERE staff_id = ? AND id <> ?').bind(staffId, session.session_id));
    } else {
      statements.push(env.DB.prepare('DELETE FROM sessions WHERE staff_id = ?').bind(staffId));
    }
    statements.push(env.DB.prepare('DELETE FROM auth_attempts WHERE staff_id = ?').bind(staffId));
  } else {
    statements.push(env.DB.prepare(
      `UPDATE staff SET branch_id = ?, employee_code = ?, name = ?, phone = ?, email = ?,
        role = ?, active = ?, updated_at = ? WHERE id = ?`
    ).bind(input.branch_id, employeeCode, input.name, input.phone, input.email, input.role, active, now, staffId));
  }
  if (!active) {
    statements.push(env.DB.prepare('DELETE FROM sessions WHERE staff_id = ?').bind(staffId));
    statements.push(env.DB.prepare('DELETE FROM auth_attempts WHERE staff_id = ?').bind(staffId));
  }
  await env.DB.batch(statements);
  return json({ ok: true, staff: await getStaffRecord(env, staffId) });
}

async function getStaffRecord(env, id) {
  return env.DB.prepare(
    `SELECT s.id, s.branch_id, b.code AS branch_code, b.name AS branch_name, s.employee_code,
      s.name, s.phone, s.email, s.role, s.active,
      CASE WHEN s.pin_hash IS NOT NULL THEN 1 ELSE 0 END AS has_pin,
      s.created_at, s.updated_at
     FROM staff s JOIN branches b ON b.id = s.branch_id WHERE s.id = ?`
  ).bind(id).first();
}

function staffInput(body) {
  return {
    branch_id: cleanText(body.branchId, 80),
    employee_code: cleanText(body.employeeCode, 40).toUpperCase() || null,
    name: cleanText(body.name, 120),
    phone: cleanPhone(body.phone),
    email: cleanText(body.email, 180).toLowerCase() || null,
    role: cleanText(body.role, 20).toLowerCase()
  };
}

function validateStaff(staff, pin, creating) {
  if (!staff.branch_id) return 'Branch is required.';
  if (!staff.name) return 'Staff name is required.';
  if (!STAFF_ROLES.has(staff.role)) return 'Select a valid staff role.';
  if (staff.phone && staff.phone.length < 10) return 'Enter a valid phone number or leave it blank.';
  if (staff.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staff.email)) return 'Enter a valid email address or leave it blank.';
  if ((creating || pin) && !/^\d{4,8}$/.test(pin)) return 'Enter a 4–8 digit PIN.';
  return null;
}

function makeEmployeeCode(branchCode) {
  const prefix = cleanText(branchCode, 8).replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'EMP';
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase()}`;
}

async function reportOverview(env, session, url) {
  const daysValue = cleanText(url.searchParams.get('days'), 10).toLowerCase() || '30';
  const days = daysValue === 'all' ? null : Number(daysValue);
  if (days !== null && ![7, 30, 90, 365].includes(days)) {
    return json({ ok: false, error: 'Select a valid reporting period.' }, 400);
  }
  let branchId = session.branch_id;
  let branch = { id: session.branch_id, code: session.branch, name: session.branch_name };
  if (hasRole(session, 'owner')) {
    const requested = cleanText(url.searchParams.get('branchId'), 80);
    if (!requested || requested === 'all') {
      branchId = null;
      branch = null;
    } else {
      branch = await env.DB.prepare('SELECT id, code, name FROM branches WHERE id = ? AND active = 1').bind(requested).first();
      if (!branch) return json({ ok: false, error: 'Active branch not found.' }, 404);
      branchId = branch.id;
    }
  }
  const periodStart = days === null ? null : new Date(Date.now() - days * 86400000).toISOString();
  const branchWhere = branchId ? 'WHERE j.branch_id = ?' : '';
  const branchValues = branchId ? [branchId] : [];
  const statusResult = await bindValues(env.DB.prepare(
    `SELECT latest_event_type, COUNT(*) AS total FROM (
       SELECT COALESCE((
         SELECT e.event_type FROM job_events e
         WHERE e.job_id = j.id AND e.event_type <> 'note_added'
         ORDER BY e.created_at DESC, e.id DESC LIMIT 1
       ), 'machine_received') AS latest_event_type
       FROM repair_jobs j ${branchWhere}
     ) GROUP BY latest_event_type`
  ), branchValues).all();
  const statuses = {};
  for (const row of statusResult.results || []) {
    const status = jobStatus(row.latest_event_type);
    statuses[status] = (statuses[status] || 0) + Number(row.total || 0);
  }

  const openedConditions = [];
  const openedValues = [];
  if (branchId) {
    openedConditions.push('branch_id = ?');
    openedValues.push(branchId);
  }
  if (periodStart) {
    openedConditions.push('opened_at >= ?');
    openedValues.push(periodStart);
  }
  const openedWhere = openedConditions.length ? `WHERE ${openedConditions.join(' AND ')}` : '';
  const opened = await bindValues(
    env.DB.prepare(`SELECT COUNT(*) AS total FROM repair_jobs ${openedWhere}`),
    openedValues
  ).first();

  const customerConditions = [];
  const customerValues = [];
  if (branchId) {
    customerConditions.push('created_branch_id = ?');
    customerValues.push(branchId);
  }
  if (periodStart) {
    customerConditions.push('created_at >= ?');
    customerValues.push(periodStart);
  }
  customerConditions.push('active = 1');
  const customers = await bindValues(env.DB.prepare(
    `SELECT COUNT(*) AS total FROM customers WHERE ${customerConditions.join(' AND ')}`
  ), customerValues).first();

  let activeStaff;
  if (branchId) {
    activeStaff = await env.DB.prepare('SELECT COUNT(*) AS total FROM staff WHERE branch_id = ? AND active = 1').bind(branchId).first();
  } else {
    activeStaff = await env.DB.prepare('SELECT COUNT(*) AS total FROM staff WHERE active = 1').first();
  }
  const review = await env.DB.prepare('SELECT COUNT(*) AS total FROM catalog_items WHERE active = 1 AND review_required = 1').first();

  const recentConditions = [];
  const recentValues = [];
  if (branchId) {
    recentConditions.push('j.branch_id = ?');
    recentValues.push(branchId);
  }
  if (periodStart) {
    recentConditions.push('j.opened_at >= ?');
    recentValues.push(periodStart);
  }
  const recentWhere = recentConditions.length ? `WHERE ${recentConditions.join(' AND ')}` : '';
  const recentJobsResult = await bindValues(env.DB.prepare(
    `SELECT j.id, j.work_order, j.opened_at, j.updated_at, b.code AS branch_code,
      c.name AS customer_name, c.phone AS customer_phone, j.serial_number,
      mm.model_name, mk.name AS make_name,
      COALESCE((
        SELECT e.event_type FROM job_events e
        WHERE e.job_id = j.id AND e.event_type <> 'note_added'
        ORDER BY e.created_at DESC, e.id DESC LIMIT 1
      ), 'machine_received') AS latest_event_type
     FROM repair_jobs j
     JOIN branches b ON b.id = j.branch_id
     JOIN customers c ON c.id = j.customer_id
     LEFT JOIN machine_models mm ON mm.id = j.machine_model_id
     LEFT JOIN machine_makes mk ON mk.id = mm.make_id
     ${recentWhere} ORDER BY j.updated_at DESC LIMIT 8`
  ), recentValues).all();
  const recentJobs = (recentJobsResult.results || []).map(row => {
    const status = jobStatus(row.latest_event_type);
    return { ...row, status, status_label: JOB_STATUS_LABELS[status] || status, latest_event_type: undefined };
  });
  const reviewResult = await env.DB.prepare(
    `SELECT id, part_number, item_name, item_type, hsn_sac, gst_rate, updated_at
     FROM catalog_items WHERE active = 1 AND review_required = 1
     ORDER BY updated_at DESC LIMIT 8`
  ).all();
  const openStatuses = ['received', 'inspecting', 'awaiting_approval', 'repairing', 'paused', 'waiting_parts'];
  const openJobs = openStatuses.reduce((total, status) => total + Number(statuses[status] || 0), 0);
  return json({
    ok: true,
    scope: {
      branchId: branch?.id || null,
      branchCode: branch?.code || null,
      branchName: branch?.name || 'All branches',
      days: days === null ? 'all' : days,
      periodStart
    },
    metrics: {
      jobsOpened: Number(opened?.total || 0),
      openJobs,
      readyForDelivery: Number(statuses.ready || 0),
      returned: Number(statuses.returned || 0),
      customersCreated: Number(customers?.total || 0),
      activeStaff: Number(activeStaff?.total || 0),
      reviewItems: Number(review?.total || 0)
    },
    statuses,
    statusLabels: JOB_STATUS_LABELS,
    recentJobs,
    reviewItems: reviewResult.results || [],
    generatedAt: new Date().toISOString()
  });
}

function bindValues(statement, values) {
  return values.length ? statement.bind(...values) : statement;
}

const PURCHASE_ORDER_STATUSES = new Set(['draft', 'ready', 'exported', 'cancelled']);
const PURCHASE_ORDER_NAMING = new Set(['tagro', 'stihl']);

async function listPurchaseOrders(env, session, url) {
  const status = cleanText(url.searchParams.get('status'), 20).toLowerCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 80, 1), 200);
  const conditions = [];
  const values = [];
  if (!hasRole(session, 'owner')) {
    conditions.push('p.branch_id = ?');
    values.push(session.branch_id);
  }
  if (status && PURCHASE_ORDER_STATUSES.has(status)) {
    conditions.push('p.status = ?');
    values.push(status);
  }
  values.push(limit);
  const result = await env.DB.prepare(
    `SELECT p.id, p.po_number, p.branch_id, b.code AS branch_code, b.name AS branch_name,
      p.status, p.naming_preference, p.supplier_name, p.notes, p.created_at, p.updated_at,
      s.name AS created_by_name, COUNT(i.id) AS item_count,
      COALESCE(SUM(i.quantity * COALESCE(i.retail_price, 0)), 0) AS estimated_value
     FROM purchase_orders p
     JOIN branches b ON b.id = p.branch_id
     JOIN staff s ON s.id = p.created_by
     LEFT JOIN purchase_order_items i ON i.purchase_order_id = p.id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     GROUP BY p.id
     ORDER BY p.updated_at DESC LIMIT ?`
  ).bind(...values).all();
  return json({ ok: true, purchaseOrders: result.results || [] });
}

async function createPurchaseOrder(request, env, session) {
  const body = await readJson(request);
  const input = purchaseOrderInput(body);
  const validation = validatePurchaseOrderInput(input);
  if (validation) return json({ ok: false, error: validation }, 400);
  const branchId = hasRole(session, 'owner') && cleanText(body.branchId, 80)
    ? cleanText(body.branchId, 80)
    : session.branch_id;
  const branch = await env.DB.prepare(
    'SELECT id, code, name FROM branches WHERE id = ? AND active = 1'
  ).bind(branchId).first();
  if (!branch) return json({ ok: false, error: 'Active branch not found.' }, 404);

  const now = new Date().toISOString();
  const id = makeId('po');
  let poNumber = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    poNumber = makePurchaseOrderNumber(branch.code);
    const exists = await env.DB.prepare('SELECT id FROM purchase_orders WHERE po_number = ?').bind(poNumber).first();
    if (!exists) break;
  }
  const statements = [
    env.DB.prepare(
      `INSERT INTO purchase_orders
        (id, po_number, branch_id, status, naming_preference, supplier_name, notes,
         created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'STIHL', ?, ?, ?, ?, ?)`
    ).bind(
      id, poNumber, branch.id, input.status, input.namingPreference, input.notes,
      session.id, session.id, now, now
    ),
    ...purchaseOrderItemStatements(env, id, input.items)
  ];
  await env.DB.batch(statements);
  console.log(JSON.stringify({
    event: 'purchase_order.created', purchaseOrderId: id, poNumber,
    branchId: branch.id, itemCount: input.items.length, staffId: session.id
  }));
  return json({ ok: true, purchaseOrder: await purchaseOrderRecord(env, id) }, 201);
}

async function getPurchaseOrder(env, session, id) {
  const order = await purchaseOrderRecord(env, cleanText(id, 100));
  if (!order) return json({ ok: false, error: 'Purchase order not found.' }, 404);
  if (!hasRole(session, 'owner') && order.branch_id !== session.branch_id) {
    return json({ ok: false, error: 'This purchase order belongs to another branch.' }, 403);
  }
  return json({ ok: true, purchaseOrder: order });
}

async function updatePurchaseOrder(request, env, session, id) {
  const purchaseOrderId = cleanText(id, 100);
  const existing = await env.DB.prepare(
    'SELECT id, branch_id, status FROM purchase_orders WHERE id = ?'
  ).bind(purchaseOrderId).first();
  if (!existing) return json({ ok: false, error: 'Purchase order not found.' }, 404);
  if (!hasRole(session, 'owner') && existing.branch_id !== session.branch_id) {
    return json({ ok: false, error: 'This purchase order belongs to another branch.' }, 403);
  }
  if (existing.status === 'cancelled') {
    return json({ ok: false, error: 'A cancelled purchase order cannot be changed.' }, 409);
  }

  const input = purchaseOrderInput(await readJson(request));
  const validation = validatePurchaseOrderInput(input);
  if (validation) return json({ ok: false, error: validation }, 400);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE purchase_orders
       SET status = ?, naming_preference = ?, notes = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`
    ).bind(input.status, input.namingPreference, input.notes, session.id, now, purchaseOrderId),
    env.DB.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?').bind(purchaseOrderId),
    ...purchaseOrderItemStatements(env, purchaseOrderId, input.items)
  ]);
  console.log(JSON.stringify({
    event: 'purchase_order.updated', purchaseOrderId,
    status: input.status, itemCount: input.items.length, staffId: session.id
  }));
  return json({ ok: true, purchaseOrder: await purchaseOrderRecord(env, purchaseOrderId) });
}

function purchaseOrderInput(body) {
  const bodyItems = Array.isArray(body.items) ? body.items : [];
  const rawItems = bodyItems.slice(0, 500);
  return {
    status: cleanText(body.status, 20).toLowerCase() || 'draft',
    namingPreference: cleanText(body.namingPreference, 20).toLowerCase() || 'tagro',
    notes: cleanText(body.notes, 1500) || null,
    tooManyItems: bodyItems.length > 500,
    items: rawItems.map((item, index) => ({
      lineNumber: index + 1,
      partNumber: normalizePartNumber(item.partNumber),
      tagroName: cleanText(item.tagroName, 240) || null,
      stihlName: cleanText(item.stihlName, 240),
      quantity: optionalNumber(item.quantity),
      unit: cleanText(item.unit, 20) || 'Nos',
      retailPrice: optionalNumber(item.retailPrice),
      mrp: optionalNumber(item.mrp),
      hsnSac: cleanText(item.hsn, 30).toUpperCase() || null,
      gstRate: optionalNumber(item.gst),
      effectiveDate: cleanText(item.effectiveDate, 20) || null,
      source: cleanText(item.source, 80) || 'master_price_list',
      notes: cleanText(item.notes, 500) || null
    }))
  };
}

function validatePurchaseOrderInput(input) {
  if (!PURCHASE_ORDER_STATUSES.has(input.status) || input.status === 'exported') {
    return 'Status must be Draft, Ready or Cancelled. Exported status is set automatically.';
  }
  if (!PURCHASE_ORDER_NAMING.has(input.namingPreference)) return 'Select TAGRO or STIHL naming.';
  if (!input.items.length) return 'Add at least one part to the purchase order.';
  if (input.tooManyItems) return 'A purchase order can contain at most 500 lines.';
  const seen = new Set();
  for (const item of input.items) {
    if (!/^\d{4,15}$/.test(item.partNumber)) {
      return `Line ${item.lineNumber}: enter a numeric STIHL part number (4–15 digits).`;
    }
    if (!item.stihlName) return `Line ${item.lineNumber}: official STIHL name is required.`;
    if (item.quantity === null || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1000000) {
      return `Line ${item.lineNumber}: quantity must be greater than zero.`;
    }
    if (seen.has(item.partNumber)) return `Part ${item.partNumber} appears more than once. Combine its quantities.`;
    seen.add(item.partNumber);
    for (const [label, value] of [['retail price', item.retailPrice], ['MRP', item.mrp], ['GST', item.gstRate]]) {
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        return `Line ${item.lineNumber}: ${label} must be zero or greater.`;
      }
    }
    if (item.gstRate !== null && item.gstRate > 100) return `Line ${item.lineNumber}: GST cannot exceed 100%.`;
  }
  return null;
}

function purchaseOrderItemStatements(env, purchaseOrderId, items) {
  return items.map(item => env.DB.prepare(
    `INSERT INTO purchase_order_items
      (id, purchase_order_id, line_number, canonical_part_number, tagro_name, stihl_name,
       quantity, unit, retail_price, mrp, hsn_sac, gst_rate, effective_date, source, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    makeId('poi'), purchaseOrderId, item.lineNumber, item.partNumber, item.tagroName,
    item.stihlName, item.quantity, item.unit, item.retailPrice, item.mrp, item.hsnSac,
    item.gstRate, item.effectiveDate, item.source, item.notes
  ));
}

async function purchaseOrderRecord(env, id) {
  const order = await env.DB.prepare(
    `SELECT p.id, p.po_number, p.branch_id, b.code AS branch_code, b.name AS branch_name,
      p.status, p.naming_preference, p.supplier_name, p.notes, p.created_by, p.updated_by,
      p.created_at, p.updated_at, s.name AS created_by_name
     FROM purchase_orders p
     JOIN branches b ON b.id = p.branch_id
     JOIN staff s ON s.id = p.created_by
     WHERE p.id = ?`
  ).bind(id).first();
  if (!order) return null;
  const [items, exports] = await Promise.all([
    env.DB.prepare(
      `SELECT id, line_number, canonical_part_number, tagro_name, stihl_name, quantity,
        unit, retail_price, mrp, hsn_sac, gst_rate, effective_date, source, notes
       FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY line_number`
    ).bind(id).all(),
    env.DB.prepare(
      `SELECT id, export_format, file_name, item_count, exported_at
       FROM purchase_order_exports WHERE purchase_order_id = ? ORDER BY exported_at DESC`
    ).bind(id).all()
  ]);
  return { ...order, items: items.results || [], exports: exports.results || [] };
}

function makePurchaseOrderNumber(branchCode) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomToken(5).replace(/[^A-Z0-9]/gi, '').slice(0, 7).toUpperCase();
  return `PO-${cleanText(branchCode, 12).toUpperCase()}-${stamp}-${suffix}`;
}

async function exportPurchaseOrder(env, session, id, url) {
  const format = cleanText(url.searchParams.get('format'), 20).toLowerCase();
  if (!PURCHASE_ORDER_NAMING.has(format)) {
    return json({ ok: false, error: 'Export format must be tagro or stihl.' }, 400);
  }
  const order = await purchaseOrderRecord(env, cleanText(id, 100));
  if (!order) return json({ ok: false, error: 'Purchase order not found.' }, 404);
  if (!hasRole(session, 'owner') && order.branch_id !== session.branch_id) {
    return json({ ok: false, error: 'This purchase order belongs to another branch.' }, 403);
  }
  if (order.status === 'cancelled') return json({ ok: false, error: 'Cancelled purchase orders cannot be exported.' }, 409);
  if (!order.items.length) return json({ ok: false, error: 'Add at least one part before exporting.' }, 409);

  const workbook = format === 'stihl'
    ? buildStihlErpWorkbook(order)
    : buildTagroWorkingWorkbook(order);
  const bytes = await workbook.xlsx.writeBuffer();
  const fileName = format === 'stihl'
    ? `${safeFilename(order.po_number)}-STIHL-ERP.xlsx`
    : `${safeFilename(order.po_number)}-TAGRO.xlsx`;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO purchase_order_exports
        (id, purchase_order_id, export_format, file_name, item_count, exported_by, exported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(makeId('poexport'), order.id, format, fileName, order.items.length, session.id, now),
    env.DB.prepare(
      `UPDATE purchase_orders SET status = 'exported', updated_by = ?, updated_at = ? WHERE id = ?`
    ).bind(session.id, now, order.id)
  ]);
  console.log(JSON.stringify({
    event: 'purchase_order.exported', purchaseOrderId: order.id, poNumber: order.po_number,
    format, fileName, itemCount: order.items.length, staffId: session.id
  }));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function buildStihlErpWorkbook(order) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TAGRO OS';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Template');
  sheet.columns = [
    { header: 'Material', key: 'material', width: 18 },
    { header: 'RequestedQuantity', key: 'quantity', width: 22 }
  ];
  for (const item of order.items) {
    sheet.addRow({ material: Number(item.canonical_part_number), quantity: Number(item.quantity) });
  }
  return workbook;
}

function buildTagroWorkingWorkbook(order) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TAGRO OS';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('TAGRO Purchase Order', {
    views: [{ state: 'frozen', ySplit: 6 }]
  });
  sheet.columns = [
    { key: 'line', width: 7 }, { key: 'part', width: 18 }, { key: 'tagro', width: 34 },
    { key: 'stihl', width: 34 }, { key: 'qty', width: 11 }, { key: 'unit', width: 10 },
    { key: 'retail', width: 14 }, { key: 'mrp', width: 14 }, { key: 'hsn', width: 15 },
    { key: 'gst', width: 10 }, { key: 'value', width: 16 }, { key: 'notes', width: 28 }
  ];
  sheet.mergeCells('A1:L1');
  sheet.getCell('A1').value = 'TAGRO PURCHASE ORDER — WORKING COPY';
  sheet.getCell('A1').font = { bold: true, size: 17, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE85D04' } };
  sheet.getCell('A1').alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 30;
  sheet.mergeCells('A2:F2');
  sheet.getCell('A2').value = `PO: ${order.po_number}`;
  sheet.mergeCells('G2:L2');
  sheet.getCell('G2').value = `Branch: ${order.branch_name} (${order.branch_code})`;
  sheet.mergeCells('A3:F3');
  sheet.getCell('A3').value = `Supplier: ${order.supplier_name}`;
  sheet.mergeCells('G3:L3');
  sheet.getCell('G3').value = `Created: ${String(order.created_at).slice(0, 10)} by ${order.created_by_name}`;
  sheet.mergeCells('A4:L4');
  sheet.getCell('A4').value = `Notes: ${order.notes || '—'}`;
  sheet.getRow(5).height = 8;
  const headers = [
    'Line', 'STIHL Part Number', 'TAGRO Familiar Name', 'STIHL Official Name',
    'Qty', 'Unit', 'Retail Price', 'MRP', 'HSN', 'GST %', 'Estimated Value', 'Line Notes'
  ];
  sheet.getRow(6).values = headers;
  sheet.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF44403C' } };
  sheet.getRow(6).alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(6).height = 30;
  order.items.forEach((item, index) => {
    const row = sheet.addRow([
      index + 1, item.canonical_part_number, item.tagro_name || '—', item.stihl_name,
      Number(item.quantity), item.unit, item.retail_price, item.mrp, item.hsn_sac,
      item.gst_rate, item.retail_price === null ? null : Number(item.quantity) * Number(item.retail_price),
      item.notes
    ]);
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell(2).numFmt = '@';
    [7, 8, 11].forEach(column => { row.getCell(column).numFmt = '₹#,##0.00'; });
    if (index % 2) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
  });
  sheet.autoFilter = { from: 'A6', to: 'L6' };
  sheet.getColumn(5).numFmt = '0.00';
  sheet.getColumn(10).numFmt = '0.00';
  sheet.eachRow((row, number) => {
    if (number >= 6) row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE7E5E4' } },
        left: { style: 'thin', color: { argb: 'FFE7E5E4' } },
        bottom: { style: 'thin', color: { argb: 'FFE7E5E4' } },
        right: { style: 'thin', color: { argb: 'FFE7E5E4' } }
      };
    });
  });
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return workbook;
}

async function requestCatalogTagroName(request, env, session) {
  const body = await readJson(request);
  const partNumber = normalizePartNumber(body.partNumber);
  const model = normalizeModelKey(body.model);
  const stihlName = cleanText(body.stihlName, 240);
  if (!partNumber || !model || !stihlName) {
    return json({ ok: false, error: 'Model, STIHL part number and STIHL name are required.' }, 400);
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO catalog_name_suggestions
      (id, canonical_part_number, model_key, stihl_name, suggested_tagro_name,
       rationale, confidence, status, created_by, created_at)
     VALUES (?, ?, ?, ?, '', ?, 0, 'suggested', ?, ?)`
  ).bind(
    makeId('namerequest'), partNumber, model, stihlName,
    'Workshop user marked this part as needing a TAGRO name.', session.id, now
  ).run();
  return json({ ok: true, partNumber, model, message: 'Marked for TAGRO naming.' });
}

async function createCatalogNameSuggestions(request, env, session) {
  return json({
    ok: false,
    error: 'Model-specific catalog naming is parked in this release.'
  }, 410);
}

function suggestFamiliarPartName(value) {
  const replacements = new Map([
    ['ASSY', 'Assembly'], ['ASS.', 'Assembly'], ['COMP.', 'Complete'],
    ['CPL.', 'Complete'], ['W.', 'With'], ['W/O', 'Without'],
    ['BRG', 'Bearing'], ['GSKT', 'Gasket'], ['CYL.', 'Cylinder']
  ]);
  return String(value || '')
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => replacements.get(word.toUpperCase()) ||
      (word.length <= 3 && /^[A-Z0-9-]+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');
}

async function listKnowledgeModels(env) {
  return json({
    ok: true,
    models: [],
    parked: true,
    sources: {
      structuredModels: 0,
      pricedModels: 0,
      masterPriceList: Boolean(env.TAGRO_DATA),
      manuals: Boolean(env.MANUALS)
    }
  });
}

async function searchKnowledgeParts(env, url) {
  if (!env.TAGRO_DATA) return json({ ok: false, error: 'TAGRO parts are not connected.' }, 503);
  const query = cleanText(url.searchParams.get('query'), 120).toLowerCase();
  const modelKey = normalizeModelKey(url.searchParams.get('model'));
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 80, 1), 500);
  if (query.length < 2) {
    return json({ ok: false, error: 'Enter at least two search characters.' }, 400);
  }

  const master = await env.TAGRO_DATA.get('parts:master', { type: 'json' });
  if (!Array.isArray(master)) {
    return json({ ok: false, error: 'TAGRO parts list is unavailable.' }, 503);
  }
  const results = [];
  for (const part of master) {
    const partNumber = cleanText(part?.no || part?.partNumber || part?.id, 100).toUpperCase();
    const tagroName = cleanText(part?.tagroName || part?.name, 240);
    const stihlName = cleanText(part?.stihlName, 240);
    const aliases = Array.isArray(part?.aliases)
      ? cleanStringList(part.aliases, 20, 240)
      : cleanStringList(String(part?.alias || '').split(','), 20, 240);
    if (!partNumber || !tagroName) continue;
    const modelKeys = knowledgePartModelKeys({
      tagroName, stihlName, aliases,
      modelGroup: part?.modelGroup, models: part?.models
    });
    if (modelKey && modelKeys.size && !modelKeys.has(modelKey)) continue;
    let score = flexiblePartScore(query, {
      partNumber, tagroName, stihlName, aliases,
      modelGroup: part?.modelGroup, models: part?.models
    });
    if (score < 0) continue;
    if (modelKey && modelKeys.has(modelKey)) score += 50;
    results.push({
      partNumber,
      name: tagroName,
      tagroName,
      stihlName: stihlName || null,
      aliases,
      hsn: cleanText(part?.hsn, 30).toUpperCase() || null,
      gst: optionalNumber(part?.gst),
      retailPrice: optionalNumber(part?.retail ?? part?.price),
      mrp: optionalNumber(part?.mrp),
      modelGroup: cleanText(part?.modelGroup, 100) || null,
      models: Array.isArray(part?.models) ? cleanStringList(part.models, 30, 100) : [],
      sources: ['tagro_parts_master'],
      mappingStatus: 'tagro_master',
      _score: score
    });
  }
  const totalMatches = results.length;
  const parts = results
    .sort((a, b) => b._score - a._score || a.tagroName.localeCompare(b.tagroName))
    .slice(0, limit)
    .map(part => {
      const { _score, ...publicPart } = part;
      return publicPart;
    });
  return json({
    ok: true,
    model: modelKey ? formatModelKey(modelKey) : null,
    query,
    parts,
    totalMatches,
    truncated: totalMatches > limit,
    source: {
      binding: 'TAGRO_DATA',
      key: 'parts:master',
      masterPrices: true
    }
  });
}

async function listKnowledgeAssets(env, url) {
  if (!env.MANUALS) return json({ ok: false, error: 'Manual library is not connected.' }, 503);
  const modelKey = normalizeModelKey(url.searchParams.get('model'));
  if (!modelKey) return json({ ok: false, error: 'Select a model first.' }, 400);
  const compactKey = modelKey.toLowerCase();
  const dashedKey = modelKey.replace(/^([A-Z]+)(\d.*)$/, '$1-$2').toLowerCase();
  const variants = [...new Set([
    compactKey,
    dashedKey,
    `${compactKey}repairmanual`,
    `${compactKey}repairmanual2025`,
    modelKey,
    modelKey.replace(/^([A-Z]+)(\d.*)$/, '$1-$2')
  ])];
  const objects = [];
  for (const variant of variants) {
    let cursor;
    do {
      const listed = await env.MANUALS.list({ prefix: `stihl/${variant}/`, limit: 1000, cursor });
      objects.push(...listed.objects);
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }
  const unique = new Map();
  for (const object of objects) {
    if (object.key.endsWith('/')) continue;
    const extension = object.key.split('.').pop()?.toLowerCase() || '';
    const type = ['png', 'jpg', 'jpeg', 'webp'].includes(extension) ? 'image'
      : extension === 'pdf' ? 'manual'
      : extension === 'json' ? 'parts_data'
      : 'file';
    unique.set(object.key, {
      key: object.key,
      name: object.key.split('/').pop(),
      type,
      size: object.size,
      uploaded: object.uploaded,
      url: `/api/knowledge/file?key=${encodeURIComponent(object.key)}`
    });
  }
  return json({ ok: true, model: modelKey, assets: [...unique.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)) });
}

async function serveKnowledgeFile(env, url) {
  if (!env.MANUALS) return json({ ok: false, error: 'Manual library is not connected.' }, 503);
  const key = cleanText(url.searchParams.get('key'), 500);
  if (!key.startsWith('stihl/') || key.includes('..')) return json({ ok: false, error: 'Invalid library file.' }, 400);
  const object = await env.MANUALS.get(key);
  if (!object) return json({ ok: false, error: 'Library file not found.' }, 404);
  const extension = key.split('.').pop()?.toLowerCase();
  const contentTypes = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    json: 'application/json; charset=utf-8'
  };
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', contentTypes[extension] || 'application/octet-stream');
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('Content-Disposition', `inline; filename="${safeFilename(key.split('/').pop())}"`);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}

async function listKvNames(namespace, prefix) {
  const names = [];
  let cursor;
  do {
    const result = await namespace.list({ prefix, limit: 1000, cursor });
    names.push(...result.keys.map(key => key.name));
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  return names;
}

function normalizeModelKey(value) {
  return cleanText(value, 80).toUpperCase().replace(/[^A-Z0-9+]/g, '');
}

function normalizePartNumber(value) {
  return cleanText(value, 100).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function knowledgePartModelKeys(part) {
  const keys = new Set();
  const values = [
    part?.tagroName, part?.stihlName, part?.modelGroup,
    ...(Array.isArray(part?.aliases) ? part.aliases : []),
    ...(Array.isArray(part?.models) ? part.models : [])
  ];
  for (const value of values) {
    const text = String(value || '').toUpperCase();
    for (const match of text.matchAll(/\b(?:MS|FS|BR|SR)\s*-?\s*\d{2,4}\b/g)) {
      const key = normalizeModelKey(match[0]);
      if (key) keys.add(key);
    }
  }
  return keys;
}

function flexiblePartScore(query, part) {
  if (!query) return 0;
  const text = value => String(value || '').toLowerCase();
  const compact = value => text(value).replace(/[^a-z0-9]/g, '');
  const partNumber = compact(part.partNumber);
  const tagroName = text(part.tagroName);
  const stihlName = text(part.stihlName);
  const aliases = Array.isArray(part.aliases) ? part.aliases.map(text) : [];
  const models = Array.isArray(part.models) ? part.models.map(text) : [];
  const fields = [
    partNumber, tagroName, stihlName, ...aliases, text(part.section),
    text(part.modelGroup), ...models
  ];
  const haystack = fields.join(' ');
  const compactHaystack = compact(haystack);
  const compactQuery = compact(query);
  const tokens = text(query).split(/[^a-z0-9]+/).filter(Boolean);
  if (partNumber && compactQuery === partNumber) return 120;
  if (compactQuery.length >= 2 && compact(tagroName).includes(compactQuery)) return 90;
  if (compactQuery.length >= 2 && aliases.some(alias => compact(alias).includes(compactQuery))) return 80;
  if (tokens.length && tokens.every(token => haystack.includes(token))) {
    let score = 45;
    score += tokens.filter(token => tagroName.includes(token)).length * 8;
    score += tokens.filter(token => stihlName.includes(token)).length * 3;
    return score;
  }
  if (compactQuery.length >= 2 && compactHaystack.includes(compactQuery)) return 35;
  return -1;
}

function formatModelKey(value) {
  return String(value || '').replace(/^([A-Z]+)(\d)/, '$1 $2');
}

function safeFilename(value) {
  return String(value || 'file').replace(/["\r\n\\]/g, '_').slice(0, 180);
}

async function serveAsset(request, env, url) {
  if (!env.ASSETS) return new Response('Static assets are not configured.', { status: 503 });
  const legacyRoutes = {
    '/queue.html': '/app-jobs.html',
    '/job.html': '/work.html',
    '/quick.html': '/receive.html',
    '/estimate.html': '/work.html',
    '/approval.html': '/work.html',
    '/hold.html': '/work.html',
    '/test.html': '/work.html',
    '/ready.html': '/work.html',
    '/daily.html': '/app-reports.html',
    '/exceptions.html': '/app-reports.html',
    '/handbook.html': '/manage.html',
    '/more.html': '/manage.html',
    '/setup.html': '/manage.html',
    '/scan.html': '/receive.html',
    '/purchase.html': '/app-purchase-orders.html',
    '/reports.html': '/app-reports.html',
    '/parts.html': '/app-catalog.html',
    '/config.html': '/manage.html',
    '/links.html': '/manage.html',
    '/review.html': '/app-reports.html',
    '/tech.html': '/manage.html',
    '/root-index.html': '/index.html'
  };
  if (legacyRoutes[url.pathname]) {
    const target = new URL(request.url);
    target.pathname = legacyRoutes[url.pathname];
    return Response.redirect(target.toString(), 302);
  }
  let assetRequest = request;
  if (url.pathname === '/') {
    const target = new URL(request.url);
    target.pathname = '/index.html';
    assetRequest = new Request(target, request);
  }
  const response = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function readJson(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) throw new Error('JSON body required');
  return request.json();
}

function cleanText(value, max) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function makeId(prefix) {
  return prefix + '_' + crypto.randomUUID();
}

function randomToken(bytes) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PIN_ITERATIONS }, key, 256);
  return hex(new Uint8Array(bits));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(left, right) {
  const a = String(left);
  const b = String(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function readCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  for (const item of cookies.split(';')) {
    const index = item.indexOf('=');
    if (index < 0) continue;
    if (item.slice(0, index).trim() === name) return decodeURIComponent(item.slice(index + 1).trim());
  }
  return null;
}

function sessionCookie(token, env) {
  const secure = env.ENVIRONMENT === 'production' ? '; Secure' : '';
  return SESSION_COOKIE + '=' + encodeURIComponent(token) + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + (SESSION_HOURS * 3600) + secure;
}

function expiredSessionCookie(env) {
  const secure = env.ENVIRONMENT === 'production' ? '; Secure' : '';
  return SESSION_COOKIE + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' + secure;
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }
  });
}

function catalogCorsResponse(request, response) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set([
    'https://service.tagro.in',
    'https://tagro.in',
    'https://www.tagro.in'
  ]);
  const headers = new Headers(response.headers);
  if (allowed.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
