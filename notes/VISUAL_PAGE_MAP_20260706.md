# TAGRO OS staging visual page map

Audit date: 2026-07-06
Staging origin: `https://tagro-os-core-staging.icy-fire-d2ac.workers.dev`
Viewport: 390 × 844 CSS pixels
Repository checkpoint audited: `52debca`

## Scope and method

- Audited every HTML file in the repository: 18 current `tagros/` files and 9 legacy `public/` files.
- Opened every current staging route in the authenticated owner session and measured visible headings, controls, fixed/sticky elements, page width, page height, and empty/data states.
- Inspected source-defined dialogs and conditional states that were not safe or practical to activate during a read-only audit.
- No form was submitted, no data was edited, no code was fixed, and nothing was deployed or pushed.
- Current staging serves `tagros/` as its asset directory. The `public/` pages are legacy iframe-shell files and are not part of the current staging build.
- The authenticated session redirects `/login` to `/`; the unauthenticated Login state below is therefore documented from the actual `login.html` source and existing CSS rather than by signing out.

## Manifest and route summary

All twelve registered apps are enabled and marked ready. No manifest entry is registered as a placeholder.

| App | File | Staging route | Access | Manifest/navigation state |
|---|---|---|---|---|
| My Space | `index.html` | `/` | All signed-in staff | Registered; desktop/mobile/drawer |
| My Bench | `bench.html` | `/bench` → `/app-jobs?mine=1` | All signed-in staff | Registered |
| Repair Jobs | `app-jobs.html` | `/app-jobs` | All signed-in staff | Registered |
| Receive | `receive.html` | `/receive` | All signed-in staff | Registered |
| Customers | `app-customers.html` | `/app-customers` | All signed-in staff | Registered |
| Branches | `app-branches.html` | `/app-branches` | Manager, owner | Registered |
| Machines | `app-machines.html` | `/app-machines` | All signed-in staff | Registered |
| Items & Parts | `app-catalog.html` | `/app-catalog` | All signed-in staff | Registered |
| Purchase Orders | `app-purchase-orders.html` | `/app-purchase-orders` | All signed-in staff | Registered |
| Service Rates | `app-services.html` | `/app-services` | Manager, owner | Registered |
| Staff | `app-staff.html` | `/app-staff` | Manager, owner | Registered |
| Reports | `app-reports.html` | `/app-reports` | Manager, owner | Registered |

Unregistered current files are Login, Workbench, Machine History, Manage launcher, Tracker redirect, and the older Advanced Jobs screen. They remain directly addressable as described below.

---

## Page: Staff Login

**File:** `tagros/login.html` | **URL:** `/login` | **Access:** signed-out staff

### Layout (top to bottom)

- Desktop uses a two-panel composition: TAGRO brand/story at left and a login card at right. Mobile collapses to the login card with brand content above.
- Brand panel: logo; “Workshop operating system”; “Clear work. Honest records.”; explanatory paragraph; values footer.
- Login card: “Staff login”, “Welcome back”, a three-step instruction, login form, live status message, and “Secure cloud session”.
- No application navigation is visible before authentication.

### Inputs

| Field | Label | Type | Required | Placeholder/state |
|---|---|---|---|---|
| `branch` | Business branch | Select | Yes | Initially “Loading branches…” |
| `staff` | Staff member | Select | Yes | Disabled until a branch is selected |
| `pin` | PIN | Password/numeric | Yes | Four bullets; accepts 4–8 digits |

### Actions

| Button/Link | Position | Action | Destination |
|---|---|---|---|
| Show/Hide | Beside PIN | Toggles PIN visibility | Same page |
| Enter TAGRO OS | Form bottom | Creates authenticated session | `/` |

### Empty/error states

- “No branches are configured.”
- “No active staff accounts for this branch.”
- “Cloud unavailable” and API error message.
- Invalid PIN text: “Enter your 4–8 digit PIN.”
- An already authenticated session immediately redirects to My Space.
- PIN is the only implemented sign-in method. SMS fallback and biometric/passkey login are not present on this screen.

### Mobile issues found

- The live authenticated audit could not render this state without destroying the current session.
- Source CSS uses the shared control/button system; a fresh signed-out mobile measurement is still required before production promotion.

### Flow

- Arrives from: unauthenticated route protection or sign out.
- Can go to: My Space after valid branch, staff, and PIN.
- Back behavior: browser back only; no in-app back control.

---

## Page: My Space / Home

**File:** `tagros/index.html` | **URL:** `/` | **Access:** all signed-in staff

### Layout (top to bottom)

- Sticky header: menu button, TAGRO identity/branch context, profile initials.
- Hero: date/greeting, “My Space”, staff/branch context, Personalize button.
- My Bench summary card with counts and “View Bench”.
- Branch Queue summary card with counts and “View Queue”.
- Resume work card.
- Parked work card.
- Communication card.
- My Shortcuts card with Customize.
- Personal shortcuts: WhatsApp, Gmail, Spotify, YouTube, Instagram, Call.
- Frequently used app shortcuts: Parts Picker, Repair Manual, Estimates, My Pick List.
- Fixed bottom navigation: My Space, My Bench, Repair Jobs, Items & Parts, More.
- Fixed “Find customer” button above the lower navigation.
- Personalization dialog and navigation drawer are hidden until opened.

### Inputs

| Field | Label | Type | Required | Placeholder |
|---|---|---|---|---|
| `global-query` | Global search | Search | No | Jobs, customers or machines |
| `compact-mode` | Compact mode | Checkbox | No | — |
| shortcut visibility controls | Show/hide shortcut | Checkbox group | No | — |
| `custom-name` | Name | Text | No | “Example: Parts supplier” |
| `custom-url` | Link | URL-like text | No | `https://`, `tel:`, `mailto:` |

### Actions

| Button/Link | Position | Action | Destination |
|---|---|---|---|
| Menu | Header left | Opens app drawer | Overlay |
| Profile | Header right | Opens account menu | Overlay |
| Personalize | Hero | Opens personalization dialog | Dialog |
| View Bench | Bench card | Assigned jobs | `/app-jobs?mine=1` |
| View Queue | Queue card | Branch jobs | `/app-jobs` |
| Customize | Shortcuts card | Opens personalization | Dialog |
| Six personal shortcuts | Shortcut grid | External/deep links | Configured service |
| Four frequent shortcuts | Lower grid | Current app functions | Catalog/manual/estimate/pick-list targets |
| More | Bottom navigation | Opens app drawer | Overlay |
| Find customer | Fixed lower-right | Opens global customer search | Dialog |
| Add | Personalization dialog | Adds custom shortcut draft | Same dialog |
| Save changes / Cancel | Dialog footer | Saves or abandons local preferences | Same page |
| Sign out | Drawer | Clears session | `/login` |

### Empty states

- Bench, queue, resume, parked, and communication areas show zero/quiet states when no matching work exists.
- Global customer search asks for at least two characters.
- The current live page showed no page-level failure or blank section.

### Mobile issues found

- No horizontal overflow: 375 px document width for a 375 px content viewport.
- Body/action text is 15–16 px; H1 is 27 px; section labels are 14 px.
- Bottom navigation labels are 15 px and targets are 75 px high.
- Menu and profile targets are 44 px high but only 34 px wide, failing the 44 × 44 target criterion.
- The fixed customer-search control is 44 px high; current placement clears the fixed bottom navigation.

### Flow

- Arrives from: login, logo/home links, bottom navigation.
- Can go to: every manifest-authorized app, assigned work, branch queue, external shortcuts, customer search.
- Back behavior: browser history; Home is the shell root.

---

## Page: Receive / Intake

**File:** `tagros/receive.html` | **URL:** `/receive` | **Access:** all signed-in staff

### Layout (top to bottom)

- Shared sticky service header and desktop app navigation.
- Heading row: “← My Space”, “New Intake”, “Intake inbox 0”.
- Three-step progress indicator: Photos → Review → Create.
- Add intake photos card:
  - Take photos.
  - Upload gallery.
  - Admin add, visible only to authorized users.
  - Photo preview strip and Add more action.
  - Save draft & leave and Review details.
- Review details card:
  - Existing-customer search/results.
  - Customer fields.
  - Machine fields.
  - Complaint quick-choice controls and editable complaint.
  - Contact-verification choice and note.
  - Items received checklist.
- Sticky “Confirm & create job” submit bar.
- Fixed mobile navigation: My Space, My Bench, Repair Jobs, Receive, Items & Parts.
- Hidden complaint-choice configuration dialog, intake-inbox dialog, toast, and global customer-search dialog.

### Inputs

| Field | Label | Type | Required | Placeholder |
|---|---|---|---|---|
| `camera-input` | Camera photo | File/camera | No | JPEG/PNG/WebP |
| `gallery-input` | Gallery photos | Multiple file | No | JPEG/PNG/WebP |
| `customer-search` | Find existing customer | Text | No | “Phone, name or place” |
| `customer-name` | Name | Text | Yes | — |
| `customer-phone` | Phone | Telephone text | Yes | — |
| `customer-place` | Address / Place | Text | No | “Village, town or address” |
| `machine-description` | Machine | Text | No | “Brand, model and machine type” |
| `machine-serial` | Serial number | Text | No | “If visible” |
| `complaint` | Customer’s words | Textarea | Yes | Quick choice or exact customer words |
| contact verification | Customer confirmation | Radio | One path required by validation | WhatsApp/message or staff no-contact sign-off |
| `contact-verification-note` | Contact note | Text | No | “Optional context” |
| received items | Guide bar, Chain, Fuel present, Loose parts, Battery, Charger, Other | Checkbox group | No | — |
| `new-complaint` | New complaint choice | Text | No | “New complaint choice” |

### Actions

| Button/Link | Position | Action | Destination |
|---|---|---|---|
| My Space | Heading | Returns home | `/` |
| Intake inbox | Heading right | Opens saved-draft list | Dialog |
| Take photos | Photos card | Opens camera chooser | Same page |
| Upload gallery | Photos card | Opens file chooser | Same page |
| Admin add | Photos card | Authorized manual/admin intake path | Same page |
| Add more | Preview area | Adds more photos | Same page |
| Save draft & leave | Photos card | Persists unfinished intake | Home/previous workflow |
| Review details | Photos card | Advances to form | Same page |
| Configure quick choices | Complaint header | Opens complaint settings | Dialog |
| Won’t Start / No Power / Chain Problem / Fuel Leak / Engine Noise / Service / Other | Complaint area | Writes the selected wording into complaint | Same page |
| Confirm & create job | Sticky footer | Creates customer/machine/job after validation | Workbench/job route |
| Add / Restore defaults / Save choices | Complaint dialog | Maintains this staff/device’s quick choices | Same page |
| Resume draft | Inbox results | Loads saved intake | Same page |

### Empty states

- Photo area explains that a service sheet plus machine/serial/damage photos may be added.
- Review warns: “Nothing is accepted silently. Correct or remove anything before creating the job.”
- Intake inbox shows no drafts when empty.
- Customer result area remains quiet until at least a useful query is entered.

### Mobile issues found

- No horizontal overflow; document width matched viewport.
- H1 27 px; card headings and body/buttons 16 px; mobile nav 15 px.
- Visible text inputs are 48 px high and buttons are 44–96 px high.
- Native checkbox/radio glyphs are 13–18 px, but their enclosing labels are the intended tap surface; those labels need a separate target-box verification.
- Sticky submit and fixed bottom nav coexist. Current page has bottom clearance, but this is a long 2,741 px form and should be retested with the keyboard open.

### Flow

- Arrives from: Home, My Bench/Repair Jobs “Receive”, desktop/mobile navigation.
- Can go to: intake draft, created Workbench, Home, Bench, Jobs, Catalog.
- Back behavior: explicit My Space link plus browser history; saved draft prevents loss when used.

---

## Page: My Bench redirect

**File:** `tagros/bench.html` | **URL:** `/bench` | **Access:** all signed-in staff

### Layout (top to bottom)

- No durable UI of its own.
- Immediately replaces the location with `/app-jobs?mine=1`.

### Inputs

None.

### Actions

None before redirect.

### Empty states

None in the redirect file; the destination shows “Nothing matches this search.”

### Mobile issues found

- No independent layout to audit.

### Flow

- Arrives from: My Space, bottom navigation, manifest links.
- Can go to: filtered Repair Jobs list.
- Back behavior: `location.replace` removes the redirect page from history; back returns to the page before My Bench.

---

## Page: Repair Jobs / My Bench list

**File:** `tagros/app-jobs.html` | **URL:** `/app-jobs`; My Bench uses `/app-jobs?mine=1` | **Access:** all signed-in staff

### Layout (top to bottom)

- Sticky shared service header.
- Screen bar: back arrow, “All jobs” or “My bench”, result count, Receive button.
- Filter panel: job search, status, date range, and manager/owner mechanic filter.
- Jobs grouped by status in this order: Received, Inspecting, Awaiting approval, Repairing, Paused, Waiting for parts, Ready, Returned, Cancelled.
- Each job card shows machine/customer/complaint context, timing, assignment, work order, and status; tapping opens Workbench.
- Fixed global customer-search button.

### Inputs

| Field | Label | Type | Required | Placeholder/options |
|---|---|---|---|---|
| `job-search` | Job search | Search | No | Customer, phone, machine, serial or work order |
| `status-filter` | Status | Select | No | Active, all history, and each lifecycle status |
| `date-from` | From date | Date | No | — |
| `date-to` | To date | Date | No | — |
| `mechanic-filter` | Mechanic | Select | No | Owner/manager only; “Every mechanic” default |

### Actions

| Button/Link | Position | Action | Destination |
|---|---|---|---|
| Back | Screen bar | Returns Home | `/` |
| Receive | Screen bar | Starts intake | `/receive` |
| Job card | Status group | Opens selected work order | `/work?id=…` |
| Filters | Filter panel | Reloads matching jobs | Same page |
| Find customer | Fixed lower-right | Opens customer search | Dialog |

### Empty states

- Initial: “Loading work orders…”
- During refresh: “Finding work orders…”
- No match: “Nothing matches this search.”
- API errors are rendered in the list card.
- Live My Bench showed the no-match state.
- Live All Jobs showed one Received work order with visible personal/sample-like name “Thomas Crankshaft”. This conflicts with the prior expectation that staging business records were empty and requires a later data audit; no record was altered here.

### Mobile issues found

- No page-level horizontal overflow.
- Visible control text is 16 px; controls are at least 44 px high.
- Back arrow is 35 px wide, below the 44 px target width.
- The search input measured 320 px high on both All Jobs and My Bench, while its width was 347 px. That is a major mobile layout defect in the rendered filter grid.
- Date inputs share one row at 160 px each and fit the viewport.
- Job cards are large, readable targets (live card: 195 px high).

### Flow

- Arrives from: Home queue/bench cards, bottom navigation, Receive completion, Tracker redirect.
- Can go to: Receive or a selected Workbench.
- Back behavior: explicit back to Home; browser back preserves query filters only when browser state does.

---

## Page: Work Order / Workbench

**File:** `tagros/work.html` | **URL:** `/work?id={job-id}` | **Access:** all signed-in staff with job access

### Layout (top to bottom)

- Desktop My Space header/navigation; mobile header with menu, back, global search, and profile.
- Job header:
  - Machine model/name is primary.
  - Work order ID is secondary.
  - Customer/complaint/status/technician context.
  - Previous, Switch job, Next, Park job, Edit details.
- Tab strip: Overview, Parts, Customer, Timeline.
- Overview cards:
  - Machine & customer.
  - Next action.
  - Job progress, locate placeholder, assigned technician.
  - My queue.
  - Find a part.
  - My pinned parts.
  - Parts / estimate.
  - Customer communication.
  - Timeline.
- Fixed mobile bottom navigation and global customer-search button.
- Dialogs:
  - Job details/autosaved record.
  - Switch job.
  - Parts picker, generated by script.
  - Navigation drawer.

### Inputs

| Field | Label | Type | Required | Placeholder |
|---|---|---|---|---|
| `global-query` | Global search | Search | No | “Search jobs or machines” |
| `assigned-to` | Assigned technician | Select | No | Staff list |
| `bench-part-query` | Find a part | Search | No | “TAGRO part name, alias or number” |
| labour description | Work | Text | No | “Labour / service” |
| labour quantity | Qty | Number | No | Default 1 |
| labour rate | Rate | Number | No | — |
| labour SAC | SAC | Text/numeric | No | “SAC” |
| labour GST | GST % | Number | No | — |
| job customer search | Existing customer | Text | No | Phone, name or place |
| customer name | Name | Text | No | “Can be added later” |
| customer phone | Phone | Telephone text | No | “Can be added later” |
| customer place | Place | Text | No | Village, town or address |
| machine description | Machine | Text | No | Brand, model and type |
| machine serial | Serial number | Text | No | If visible |
| complaint | Customer complaint | Textarea | No | Customer’s own words |
| observation | Workshop observation | Textarea | No | Confirmed findings |
| work done | Work done | Textarea | No | Diagnosis and repair work |
| billing subtotal | Subtotal | Number | No | Blank |
| billing tax | GST / tax | Number | No | Blank |
| billing total | Billing total | Number | No | Blank |
| billing note | Billing note | Text | No | Billing staff context |
| part rows | Part number/name/qty/price | Text/number | Conditional | Populated by picker or manual row |

### Actions

| Button/Link | Position | Action | Destination |
|---|---|---|---|
| Previous / Next | Job header | Move among queue jobs | Another `/work?id=…` |
| Switch job | Job header | Opens searchable job switcher | Dialog |
| Park job | Job header | Parks current context without losing work | Home/Parked state |
| Edit details / Edit | Header/card | Opens job-details dialog | Dialog |
| Overview / Parts / Customer / Timeline | Tab bar | Scrolls to section | Same page anchors |
| Locate | Progress card | Present but disabled | None |
| Refresh | Queue card | Reloads queue | Same page |
| View all assigned jobs | Queue card | Opens My Bench | `/app-jobs?mine=1` |
| Find / Search parts | Parts card | Searches `parts:master` | Inline results / picker |
| Add part | Pinned/parts state | Adds selected part and quantity | Same job |
| Create estimate | Estimate card | Creates estimate from current lines | Same page |
| Share on WhatsApp / Share by SMS | Estimate state | Opens external message composition | External app |
| Order / hold these parts | Estimate card | Opens Purchase Orders | `/app-purchase-orders` |
| Add manual part | Estimate card | Adds editable manual line | Same page |
| Message customer / Call | Communication card | Opens WhatsApp/message or telephone | External app |
| Four quick notes | Communication card | Records/sends common progress wording | Same work order |
| Find part | Job-details dialog | Opens parts picker | Dialog |
| Guide bar/Chain/Fuel/Loose parts/Battery/Charger/Other | Job-details dialog | Toggles received accessories | Same dialog |
| Save now | Sticky dialog footer | Persists job details | Same page |
| Sign out | Drawer | Ends session | `/login` |

### Empty states

- Missing `id` redirects to `/app-jobs`; it does not show an error page.
- Machine/customer/phone/serial use pending text when absent.
- Queue, pinned parts, estimate, and timeline each have quiet empty states.
- Parts search shows no-match feedback and does not save raw typed text as a part.
- Machine history and customer history links are data-dependent.

### Mobile issues found

- The no-ID route redirected to Repair Jobs, so the current live job layout could not be re-opened reliably during this audit after the browser connection timed out.
- Last verified staging measurements at this same checkpoint: no horizontal page overflow; machine title 20–24 px; complaint/important context 18 px; tabs 15 px and 44 px high; part names 16 px; references 14 px; action labels 16 px; communication controls 50–74 px high.
- Source still contains a 35 px-wide mobile back control, below the 44 px target width.
- Current CSS targets a two-column mobile communication grid and bottom clearance above fixed navigation.

### Flow

- Arrives from: Repair Jobs, My Bench, machine/customer histories, next/previous/switch-job actions.
- Can go to: another job, My Bench, Parts, Purchase Orders, external communication, customer/machine history.
- Back behavior: explicit back to Jobs plus queue navigation; unsaved form state is protected by the autosave/save workflow, not browser history alone.

---

## Screen state: Workbench Parts Search / Picker

**File:** generated from `tagros/work.html` + `tagros/work-space.js` | **URL:** `/work?id=…` | **Access:** same as Workbench

### Layout (top to bottom)

- Inline “Find a part” card with TAGRO query and Find button.
- Search results show TAGRO familiar name first, part number/secondary data, current price, quantity, and Add.
- “Search parts” opens the larger picker/modal when required.
- Added parts appear immediately in Parts / estimate; repeated adds merge quantity rather than create arbitrary typed rows.

### Inputs

| Field | Label | Type | Required | Placeholder |
|---|---|---|---|---|
| `bench-part-query` | Part search | Search | No | TAGRO part name, alias or number |
| result quantity | Qty | Number | Yes to add | Default 1 |
| manual part fields | Number, description, qty, price | Text/number | Conditional | Blank/manual |

### Actions

| Button/Link | Position | Action | Destination |
|---|---|---|---|
| Find | Search row | Queries `TAGRO_DATA` `parts:master` | Inline results |
| Add | Result row | Adds validated catalog part | Work order estimate list |
| Search parts | Secondary row | Opens picker | Modal |
| Add manual part | Estimate area | Adds explicit manual row | Same page |

### Empty states

- No matching parts message.
- Empty result before a query.
- Raw misspellings are not accepted as catalog rows unless deliberately added as manual parts.

### Mobile issues found

- The last accepted staging pass measured 16 px result text and ≥44 px quantity/add controls.
- No separate route exists; this state cannot be bookmarked independently.

### Flow

- Arrives from: Workbench Find, Search parts, Find part in Job Details.
- Can go to: added job list or back to the same Workbench context.
- Back behavior: close modal/clear results; job context is retained.

---

## Screen state: Estimate View

**File:** embedded in `tagros/work.html` | **URL:** `/work?id=…#parts-reference` | **Access:** same as Workbench

### Layout (top to bottom)

- Current part lines with name, quantity, rate, tax context, and line totals.
- Optional labour row.
- Subtotal, GST/tax, total, and estimate reference/status.
- Create Estimate, WhatsApp, SMS, Order/Hold, and manual-part actions.

### Inputs

See Workbench labour and manual-part inputs above.

### Actions

| Button/Link | Position | Action | Destination |
|---|---|---|---|
| Create estimate | Card bottom | Persists server-calculated estimate | Same page |
| Share on WhatsApp | Estimate state | Opens message draft | WhatsApp |
| Share by SMS | Estimate state | Opens SMS draft | SMS client |
| Order / hold these parts | Below estimate | Starts procurement/hold path | Purchase Orders |

### Empty states

- No parts/labour: quiet empty estimate list and disabled/inapplicable totals.
- No created estimate: no reference line/share payload.

### Mobile issues found

- Last accepted staging measurement: part line text 16 px, estimate reference 14 px, total prominent, action targets ≥44 px.
- Estimate is not a standalone page; the current design keeps job context.

### Flow

- Arrives from: added parts or Parts tab.
- Can go to: external share, Purchase Orders, same work order.
- Back behavior: tab/anchor navigation retains work order.

---

## Page: Customers

**File:** `tagros/app-customers.html` | **URL:** `/app-customers` | **Access:** all signed-in staff

### Layout (top to bottom)

- Sticky top bar: back, Customers title/environment, TAGRO logo.
- Heading: “Customer data”, “Know the customer.”, New customer.
- Search card.
- Recent customers panel with Refresh.
- Customer details panel:
  - Initial select/create prompt.
  - Customer identity/contact/summary after selection.
  - Machines and work-order history links.
  - Edit form and document/credential areas when opened.
- Fixed toast and global customer-search dialog.

### Inputs

| Field | Label | Type | Required | Placeholder |
|---|---|---|---|---|
| customer search | Search customers | Search | No | Name, phone or customer code |
| customer type | Customer type | Select | Yes | Individual/Business |
| customer name | Customer name | Text | Yes | — |
| phone | Phone | Tel | Yes | — |
| alternate phone | Alternate phone | Tel | No | — |
| email | Email | Email | No | — |
| address | Address | Textarea | No | — |
| tax | GSTIN / Tax ID | Text | No | — |
| notes | Notes | Textarea | No | Preferences, aliases or service context |
| optimize | Prepare image files below 100 KB | Checkbox | No | — |
| documents | Aadhaar, PAN, GST, address proof, bank, land tax, invoice, receipt, handover photo, other | File inputs | No | PDF/image restrictions per field |
| portal | Portal / scheme | Text | Conditional | “Example: SMAM DBT” |
| login | Login ID | Text | Conditional | — |
| password | Password | Password | Conditional | — |

### Actions

| Button/Link | Position | Action | Destination |
|---|---|---|---|
| Back/logo | Top bar | Returns Home | `/` |
| New customer | Heading | Opens blank edit form | Same page |
| Search | Search card | Runs customer search | Same page |
| Refresh | List panel | Reloads recent customers | Same page |
| Customer result | Left/list panel | Opens detail state | Same page |
| Edit customer | Detail panel | Opens edit form | Same page |
| Save customer / Cancel | Form bottom | Persists or abandons edit | Same page |
| Machine row | Detail history | Opens machine history | `/machine-history?id=…` |
| Work-order row | Detail history | Opens Workbench | `/work?id=…` |
| Reveal | Credential row | Reveals protected credential after authorized action | Same page |

### Empty states

- Initial detail: “Select a customer. Choose a result to view it, or create a new customer record.”
- Recent list initially shows “Loading customers”.
- Search can return no customers.
- Machines/jobs/documents/credentials each render their own no-record state.

### Mobile issues found

- No horizontal overflow.
- H1 27 px; section labels 14 px; controls/actions 16 px and 44–52 px high.
- Top back control is a complete 44 × 44 target.
- Long edit form and ten file fields create substantial vertical length; no compact document drawer exists.

### Flow

- Arrives from: manifest navigation, Home drawer, global customer search.
- Can go to: create/edit customer, selected customer detail, machine history, Workbench.
- Back behavior: top back/logo to Home; browser back restores prior route but not guaranteed form draft.

---

## Screen state: Customer Detail / History

**File:** embedded in `tagros/app-customers.html` | **URL:** `/app-customers?id={customer-id}` or selected in-page state | **Access:** all signed-in staff

### Layout (top to bottom)

- Customer name, contact details, type and notes.
- Summary/visit indicators.
- Linked machines.
- Linked work orders/service history.
- Stored documents.
- Optional protected portal credentials.
- Edit customer action.

### Inputs

No inputs until Edit is selected; then the Customers form above is used.

### Actions

- Phone/contact actions when available.
- Machine row → Machine History.
- Work-order row → Workbench.
- Edit → Customer form.
- Reveal → protected credential display.

### Empty states

- No machines, no work orders, no documents, and no credentials are individually represented.

### Mobile issues found

- Shares the Customers page’s no-overflow result and 16 px body/action sizing.
- Detailed history was not populated in the live audit session.

### Flow

- Arrives from: Customers result or global customer search.
- Can go to: Workbench, Machine History, edit state.
- Back behavior: Customers list state or Home via top bar.

---

## Page: Machine History

**File:** `tagros/machine-history.html` | **URL:** `/machine-history?id={machine-id}` | **Access:** all signed-in staff

### Layout (top to bottom)

- Sticky service header.
- Back arrow.
- Machine identity/header or missing-record message.
- Service visits card.
- Parts used card.
- Complaint history card.
- Ownership card.
- Fixed global customer-search button.

### Inputs

None.

### Actions

| Button/Link | Position | Action | Destination |
|---|---|---|---|
| Back | Top | Returns Customers | `/app-customers` |
| Service visit row | Service visits | Opens work order | `/work?id=…` |
| Complaint row | Complaint history | Opens work order | `/work?id=…` |

### Empty states

- Missing `id`: “Machine record was not specified.”
- No visits: “No service visits recorded.”
- No complaints: “No complaints recorded.”
- Parts and ownership have loading/no-record states.

### Mobile issues found

- No horizontal overflow.
- Section headings 16 px; visible controls 16 px and 44–48 px high.
- Back control is 44 × 44.
- Content scrolls past 1,037 px and clears the lower fixed customer-search control.

### Flow

- Arrives from: Customer Detail machine row.
- Can go to: related Workbench visits/complaints or Customers.
- Back behavior: explicit back to Customers.

---

## Page: Branches

**File:** `tagros/app-branches.html` | **URL:** `/app-branches` | **Access:** manager, owner

### Layout (top to bottom)

- Sticky app top bar.
- Heading: “Every branch, clearly defined.” and New branch.
- Branch Locations panel with Refresh and selectable branch cards.
- Branch Details panel with view/edit form.
- Fixed toast and global customer-search dialog.

### Inputs

| Field | Label | Type | Required | Placeholder |
|---|---|---|---|---|
| branch ID | Internal ID | Hidden | Existing only | — |
| code | Branch code | Text | Yes | — |
| name | Branch name | Text | Yes | — |
| address 1 | Address line 1 | Text | No | — |
| address 2 | Address line 2 | Text | No | — |
| city | City | Text | No | — |
| state | State | Text | No | — |
| postal | Postal code | Text | No | — |
| phone | Phone | Tel/text | No | — |

### Actions

- Back/logo → Home.
- New branch → blank branch form.
- Refresh → reload locations.
- Branch card → branch details.
- Edit branch → editable form.
- Save/Cancel → persist or abandon.

### Empty states

- Detail: “Select a branch. Choose a location to view or update its details.”
- Branch list supports no-locations state.
- Live staging showed one branch: TAGRO Staging, code STG, “Address not recorded”.

### Mobile issues found

- No horizontal overflow.
- H1 27 px; section labels 14 px; actions 16 px and ≥44 px.
- Branch card is a large 83 px target.

### Flow

- Arrives from: manager/owner navigation or Manage launcher.
- Can go to: branch create/edit/detail or Home.
- Back behavior: top back/logo to Home.

---

## Page: Items & Parts

**File:** `tagros/app-catalog.html` | **URL:** `/app-catalog` | **Access:** all signed-in staff; New Item review actions are role-sensitive

### Layout (top to bottom)

- Sticky app top bar: back, Items & Parts, subtitle, logo.
- Heading: “Choose the machine, then recognise the part.”
- Return to bench and Admin: New item.
- Compact model-first row: search, model, destination.
- Assembly controls and result table appear after model/data selection.
- Hidden New Catalog Item dialog.
- Hidden Cloud Parts Library dialog with parts/prices and manuals/images sections.
- Fixed toast and global customer-search.

### Inputs

| Field | Label | Type | Required | Placeholder/options |
|---|---|---|---|---|
| catalog search | Parts search | Search | No | Search name, alias or part number |
| global model | Machine model | Select | For model-first results | Choose model |
| destination | Add selected parts to | Select | Yes to add | HOLD 1 default |
| part number | Part number | Text | Yes in New Item | — |
| item type | Item type | Select | Yes | Machine/Accessory/Part/Service |
| item name | Item name | Text | Yes | — |
| HSN/SAC | HSN / SAC | Text | Yes | — |
| GST | GST % | Number | Yes | 0–100 |
| retail | Retail price | Number | No | Optional |
| MRP | MRP | Number | No | Optional |
| details | Details | Textarea | No | Specifications/compatibility |
| confirm review | Reviewed and verified | Checkbox | Conditional | Manager/owner |
| cloud model | Model | Select | No | All models |
| cloud query | Cloud search | Search | No | Part number or description |

### Actions

- Back/logo → Home.
- Return to bench → prior/default bench destination.
- Admin: New item → item dialog.
- Assembly selector → filters parts table.
- Add → adds a catalog result to the selected destination.
- Needs TAGRO Name → records naming request.
- Save item/Cancel/Close → manage item dialog.
- Suggest from similar items → assisted field suggestions.
- Cloud Search → searches TAGRO data/assets.
- Use → imports a confirmed current part.
- Current number needed → disabled guard when mapping is unresolved.

### Empty states

- Initial page waits for machine/search selection and shows no parts table.
- No matching items/result state.
- Cloud library begins with connecting/loading state.
- Missing current number disables Use.

### Mobile issues found

- No horizontal overflow.
- H1 27 px; actions/controls 16 px and ≥44 px high.
- Search, model, and destination are each only about 103 px wide in one row. They technically fit but labels/placeholders are heavily truncated and the layout is cramped.
- Dialog layouts were source-inspected; closed dialogs were not measured as visible states.

### Flow

- Arrives from: Home, bottom navigation, Workbench, Manage.
- Can go to: selected HOLD/work destination, New Item, cloud reference, Home/Workbench.
- Back behavior: explicit return/back links; modal close preserves current filters.

---

## Page: Purchase Orders

**File:** `tagros/app-purchase-orders.html` | **URL:** `/app-purchase-orders` | **Access:** all signed-in staff

### Layout (top to bottom)

- Sticky top bar with TAGRO and All modules.
- Heading: “Purchase orders”; New purchase order.
- Branch Orders list.
- New Purchase Order editor:
  - Naming mode.
  - Status.
  - Notes.
  - Part search and results.
  - Added parts.
  - Save/export actions.
  - Model-list/name-preparation helper.
- Fixed toast and global customer-search.

### Inputs

| Field | Label | Type | Required | Placeholder/options |
|---|---|---|---|---|
| name mode | Names shown to staff | Select | No | TAGRO familiar / STIHL official |
| PO status | Order status | Select | No | Draft / Ready / Cancelled |
| notes | Order notes | Text | No | Optional branch/order note |
| part search | Find part | Search | No | STIHL number, TAGRO name or STIHL name |
| line quantity | Qty | Number | For added line | — |
| model list | Models | Textarea | No | “Example: MS 250, FS 120” |

### Actions

- TAGRO/All modules → Home/Manage.
- New purchase order → editor.
- Find part → search catalog.
- Add/remove/edit quantity → maintain order lines.
- Save draft → persists draft.
- Save as ready → marks ready.
- Download both workbooks → exports TAGRO and STIHL versions.
- Prepare/suggest names → model/name helper.

### Empty states

- “No purchase orders yet. Create the first order for this branch.”
- “No parts added. Search the cloud catalog and add the required parts.”

### Mobile issues found

- **Horizontal overflow exists:** document width 469 px against a 375 px content viewport.
- All visible text/actions are 16 px and ≥44 px high.
- Part search is 203 px beside a 101 px Find button and is readable.
- Model-list helper is only 84 px wide beside a 190 px action, contributing to the overflow/cramped state.

### Flow

- Arrives from: manifest navigation, Workbench Order/Hold, Manage.
- Can go to: order list/editor, downloads, Home/Manage.
- Back behavior: All modules/Home link; browser back to Workbench retains Workbench server state.

---

## Page: Machines

**File:** `tagros/app-machines.html` | **URL:** `/app-machines` | **Access:** all signed-in staff

### Layout (top to bottom)

- Sticky top bar.
- Heading: “One trusted model list.”
- Search.
- Manufacturer and Model add actions.
- Machine-model result area.
- New Manufacturer modal.
- New Machine Model modal.
- Fixed toast and global customer-search.

### Inputs

| Field | Label | Type | Required | Placeholder |
|---|---|---|---|---|
| machine search | Search | Search | No | Manufacturer, model or machine type |
| make name | Manufacturer name | Text | Yes | — |
| model make | Manufacturer | Select | Yes | Select manufacturer |
| model name | Model name | Text | Yes | — |
| machine type | Machine type | Text/select | Yes | — |
| specification notes | Specification notes | Textarea | No | — |

### Actions

- Back/logo → Home.
- Manufacturer → New Manufacturer modal.
- Model → New Model modal.
- Save/close modal.
- Search result → model detail/edit state when available.

### Empty states

- “No machine models found. Add a manufacturer and its first model.”

### Mobile issues found

- No horizontal overflow.
- H1 27 px; controls 16 px and 44–52 px high.
- Search and create actions use nearly full available width.

### Flow

- Arrives from: manifest navigation/Manage.
- Can go to: add manufacturer/model, select a model, Home.
- Back behavior: top back/logo.

---

## Page: Service Rates

**File:** `tagros/app-services.html` | **URL:** `/app-services` | **Access:** manager, owner

### Layout (top to bottom)

- Sticky top bar.
- Heading: “Consistent rates for good work.”
- New Service Rate.
- Service search.
- Service-rate result list.
- New Service Job modal.
- Fixed toast and global customer-search.

### Inputs

| Field | Label | Type | Required | Placeholder |
|---|---|---|---|---|
| service search | Search | Search | No | Service job names/descriptions |
| service name | Service repair job name | Text | Yes | — |
| description | Description | Textarea | No | — |
| minutes | Standard minutes | Number | No | — |
| price | Default price | Number | No | — |
| SAC | HSN / SAC | Text | Yes | — |
| GST | GST % | Number | Yes | — |

### Actions

- Back/logo → Home.
- New service rate → modal.
- Search → filters services.
- Service row → detail/edit.
- Save/Cancel/Close → modal actions.

### Empty states

- Initial “Loading service jobs…”
- No matching service jobs.

### Mobile issues found

- No horizontal overflow.
- H1 27 px; controls/actions 16 px and ≥44 px.
- Closed modal fields were source-inspected rather than rendered.

### Flow

- Arrives from: manager/owner navigation/Manage.
- Can go to: service create/edit or Home.
- Back behavior: top back/logo.

---

## Page: Staff Admin

**File:** `tagros/app-staff.html` | **URL:** `/app-staff` | **Access:** manager, owner

### Layout (top to bottom)

- Sticky top bar.
- Heading: “The right access, clearly.”
- New Staff Account.
- Search, role filter, active filter.
- Staff Accounts list.
- New/Edit Staff modal with private-access warning.
- Fixed toast and global customer-search.

### Inputs

| Field | Label | Type | Required | Placeholder/options |
|---|---|---|---|---|
| staff search | Search | Search | No | Name, code, phone or branch |
| role filter | Role | Select | No | All/Owners/Managers/Staff |
| active filter | Account state | Select | No | Active/All/Inactive |
| staff ID | Internal ID | Hidden | Existing only | — |
| name | Staff name | Text | Yes | — |
| employee code | Employee code | Text | Yes | — |
| phone | Phone | Tel/text | No | — |
| email | Email | Email | No | — |
| branch | Branch | Select | Yes | — |
| role | Role | Select | Yes | Owner/Manager/Staff |
| PIN | New/reset PIN | Password/numeric | Conditional | Never redisplays old PIN |
| active | Active account | Checkbox | No | — |

### Actions

- Back/logo → Home.
- New Staff Account → modal.
- Filter/search → updates staff list.
- Staff row → detail/edit.
- Save/Cancel/Close → account operation.
- PIN reset/activation controls are part of the modal workflow.

### Empty states

- Loading and no-account states in Staff Accounts.

### Mobile issues found

- No horizontal overflow.
- H1 27 px; visible controls/actions 16 px and ≥44 px.
- Search, role, and active controls are about 97 px each in one row, making search wording highly truncated.
- No biometric/passkey enrollment UI is present.

### Flow

- Arrives from: manager/owner navigation/Manage.
- Can go to: create/edit/reset staff or Home.
- Back behavior: top back/logo.

---

## Page: Reports

**File:** `tagros/app-reports.html` | **URL:** `/app-reports` | **Access:** manager, owner

### Layout (top to bottom)

- Sticky top bar.
- Heading: “See what needs attention.”
- Branch context and reporting-period controls.
- Current Job Status.
- Attention Queue.
- Recent Repair Jobs.
- Items Requiring Review.
- Open Repair Jobs and Open Items & Parts shortcuts.
- Fixed toast and global customer-search.

### Inputs

| Field | Label | Type | Required | Options |
|---|---|---|---|---|
| report branch | Branch | Select | No | Role-permitted branches |
| report days | Period | Select | No | 7/30/90 days, 12 months, all time |

### Actions

- Back/logo → Home.
- Refresh report → reload metrics.
- Open Repair Jobs → `/app-jobs`.
- Open Items & Parts → `/app-catalog`.
- Data cards/rows may deep-link to their source list.

### Empty states

- Zero-count status cards.
- Empty attention queue, recent jobs, and items review lists.

### Mobile issues found

- No horizontal overflow.
- H1 27 px; section labels 14 px; controls/actions 16 px and ≥44 px.
- Two lower shortcuts fit side by side at 150/141 px and 68 px high.

### Flow

- Arrives from: manager/owner navigation/Manage.
- Can go to: Repair Jobs, Items & Parts, Home.
- Back behavior: top back/logo.

---

## Page: Manage / Applications Launcher

**File:** `tagros/manage.html` | **URL:** `/manage` | **Access:** all signed-in staff; cards filtered by manifest role

### Layout (top to bottom)

- Sticky top bar: compact TAGRO home link and profile button.
- Hero: “Good work starts here.”
- Applications grid generated from `TAGRO_MANIFEST`.
- Fixed toast and global customer-search.

### Inputs

None.

### Actions

- TAGRO OS home → `/`.
- Profile → account menu.
- Application cards → authorized manifest app.
- Find customer → global customer dialog.

### Empty states

- No special placeholder is registered; a role with no authorized launcher apps would see an empty Applications grid.

### Mobile issues found

- No horizontal overflow.
- H1 31 px; application text follows shared 16 px styling.
- TAGRO OS home target is only 32 px high, below the 44 px criterion.

### Flow

- Arrives from: Home drawer “Manage”, Purchase Orders “All modules”.
- Can go to: any authorized registered app.
- Back behavior: TAGRO OS home link or browser back.

---

## Page: Advanced Repair Jobs (unregistered)

**File:** `tagros/app-jobs-advanced.html` | **URL:** `/app-jobs-advanced` | **Access:** direct authenticated route; not in manifest

### Layout (top to bottom)

- Sticky top bar.
- Heading: “Every machine has a story.”
- Receive Machine.
- Work-order search/status filter and Refresh.
- Work Orders panel.
- Job Details panel.
- Five dialogs:
  - Receive Machine.
  - Update Repair Job.
  - Prepare Estimate.
  - Service Record.
  - Billing Ready.
- Fixed toast and global customer-search.

### Inputs

| State | Inputs |
|---|---|
| Main list | Work order/customer/phone/serial search; status select |
| Receive Machine | Customer, saved/new machine, branch, model, urgency, serial, machine description, reported problem, received accessories/other |
| Update Repair Job | Action type, note, estimate amount |
| Prepare Estimate | Price search, manual part/labour lines, quantities/rates/tax, estimate notes, share options |
| Service Record | Diagnosis, work performed, parts/service search and lines, technician |
| Billing Ready | Billing/settlement fields and handoff state |

### Actions

- New Receive Machine; Refresh.
- Work-order result → Job Details.
- Update status/event.
- Prepare/save/share estimate.
- Save service draft/complete service record.
- Mark billing ready.
- Back/logo → Home.

### Empty states

- “Loading work orders…”
- “Select a work order. Its current status, machine details and complete service timeline will appear here.”

### Mobile issues found

- No horizontal overflow.
- H1 27 px; visible controls/actions 16 px and ≥44 px.
- Search and status share a row at about 151 px each.
- Five large legacy dialogs duplicate current Receive/Workbench functions and were not exercised.

### Flow

- Arrives from: direct URL only.
- Can go to: its own receive/update/estimate/service/billing dialog states.
- Back behavior: top back/logo.

---

## Page: Tracker redirect (unregistered)

**File:** `tagros/tracker.html` | **URL:** `/tracker` | **Access:** signed-in users

### Layout (top to bottom)

- No durable UI.
- Immediately replaces location with `/app-jobs`, preserving query/hash.

### Inputs and actions

None before redirect.

### Empty states

Inherited from Repair Jobs.

### Mobile issues found

- No independent layout.

### Flow

- Arrives from: old/deep links.
- Can go to: Repair Jobs.
- Back behavior: `location.replace` removes Tracker from browser history.

---

## Legacy page: Core iframe shell

**File:** `public/index.html` | **URL on current staging:** not served from current asset root | **Access:** hardcoded legacy demo session

### Layout (top to bottom)

- Full-screen iframe whose initial source is `launcher.html`.
- Fixed top toast.
- No visible header/navigation outside the iframe.

### Inputs

None.

### Actions

- Child pages call `parent.AppLauncher.open(appId, jobId)` to replace iframe source.
- Polls a separate legacy API every ten seconds.

### Empty states

- Silent fetch failure; iframe remains available with local shell.

### Mobile issues found

- Full-screen iframe prevents page scroll and delegates all sizing to child pages.
- This file hardcodes legacy staff name “Thomas Mathew Thumpassery” and branch `TAGRO_ANCL`. It is not deployed by current staging but is a sample-data risk if the `public/` tree is ever served.

### Flow

- Arrives from: legacy standalone root.
- Can go to: Legacy Launcher and its seven iframe modules.
- Back behavior: child navigation replaces iframe source; browser history is not the primary navigation.

---

## Legacy page: Launcher

**File:** `public/launcher.html` | **URL on current staging:** not served | **Access:** legacy demo

### Layout (top to bottom)

- “TAGRO OS Workspace”.
- Staff/branch line.
- Responsive card grid: Jobs Registry, Teardown, Quotations, Authorizations, Workbench, Spare Parts, Cash Desk.

### Inputs

None.

### Actions

Each card opens its legacy iframe module through the parent launcher.

### Empty states

None.

### Mobile issues found

- Uses auto-fill 140 px cards with 16 px gaps.
- Card elements are clickable `div`s, not semantic buttons/links, so keyboard/accessibility behavior is weak.

### Flow

- Arrives from: legacy Core iframe.
- Can go to: all seven legacy modules.
- Back behavior: each module has a Dashboard button.

---

## Legacy page: Jobs Registry

**File:** `public/app-jobs.html` | **URL on current staging:** not served | **Access:** legacy demo

### Layout (top to bottom)

- Intake Machinery Asset card.
- Active Queues card.
- Back to Dashboard.

### Inputs

| Field | Label | Type | Required | Placeholder |
|---|---|---|---|---|
| `cust` | Customer | Text | Enforced in script | Customer Name |
| `mod` | Model | Text | Enforced in script | Machinery Model, e.g. STIHL MS-250 |

### Actions

- Open Folder File → creates random work-order event.
- Active queue row → Teardown.
- Back to Dashboard → Launcher.

### Empty states

- “No entries active.”

### Mobile issues found

- Inputs/buttons use approximately 12–14 px source styles, below the current 16 px workshop target.
- No authenticated branch/customer lookup; free text can create duplicates.

### Flow

- Arrives from: legacy Launcher.
- Can go to: Teardown or Dashboard.
- Back behavior: Dashboard button.

---

## Legacy page: Teardown & Diagnostics

**File:** `public/app-inspection.html` | **URL on current staging:** not served | **Access:** legacy demo

### Layout (top to bottom)

- Work-order card.
- Intake Diagnostics start card.
- Conditional Discovery Chain Log:
  - fixed diagnostic select.
  - add node.
  - chain list.
  - teardown notes.
  - Publish Findings.
- Back and Quotations.

### Inputs

| Field | Label | Type | Required | Options/placeholder |
|---|---|---|---|---|
| failure chain | Diagnostic finding | Select | No | Four hardcoded failures |
| findings | Teardown Notes | Textarea | Required to publish | “Input diagnostics summary…” |

### Actions

- Initialize Physical Teardown.
- Add selected failure node.
- Publish Findings File.
- Back → Jobs; Quotations → Estimate.

### Empty states

- `WO-LOADING` or “No Job Parameter”.
- Completed state replaces start with verified text.

### Mobile issues found

- Node/body text is 13 px and secondary heading 14 px, below current target.
- Hardcoded diagnostic choices impose a funnel and do not reflect the current low-stress Bench Note workflow.

### Flow

- Arrives from: legacy Jobs row.
- Can go to: Quotations or Jobs.
- Back behavior: explicit Back.

---

## Legacy page: Quotations Counter

**File:** `public/app-estimate.html` | **URL on current staging:** not served | **Access:** legacy demo

### Layout (top to bottom)

- Work-order card.
- Inspection warning/finding.
- Pricing Matrix Compiler card.
- Dashboard and Authorizations controls.

### Inputs

None.

### Actions

- Publish Base Quote File (₹2,450.00).
- Dashboard.
- Authorizations.

### Empty states

- Missing inspection warning.
- Existing estimate changes action card to generated-ID confirmation.

### Mobile issues found

- Hardcoded price and hardcoded carburetor part make this a sample/demo page, not a usable production estimate.
- Info text is 13 px.

### Flow

- Arrives from: legacy Teardown.
- Can go to: Authorizations or Dashboard.
- Back behavior: Dashboard.

---

## Legacy page: Authorizations

**File:** `public/app-approval.html` | **URL on current staging:** not served | **Access:** legacy demo

### Layout (top to bottom)

- Customer Authorization card.
- Conditional consent controls.
- Dashboard and Workbench.

### Inputs

None.

### Actions

- Grant Full Consent.
- Decline Context.
- Dashboard.
- Workbench.

### Empty states

- “Awaiting configuration invoice…”
- Approved and declined result states.

### Mobile issues found

- Metadata is 14 px.
- Wording is system-centric and not the current customer-contact workflow.

### Flow

- Arrives from: legacy Estimate.
- Can go to: Workbench or Dashboard.
- Back behavior: Dashboard.

---

## Legacy page: Workbench

**File:** `public/app-work.html` | **URL on current staging:** not served | **Access:** legacy demo

### Layout (top to bottom)

- Active Progress Tracking card.
- Derived stage label.
- One or more conditional workflow buttons.
- Dashboard and Spare Parts.

### Inputs

None.

### Actions

- Start Repair Loop.
- Log Temporary Stall.
- Resume Assembly Tasks.
- Mark Mechanical Completion.
- Dashboard.
- Spare Parts.

### Empty states

- “Reconstructing stage…”
- Awaiting/Active/Stalled/Completed stage variants.

### Mobile issues found

- Status text is 13 px.
- Event payload hardcodes technician “Thomas Mathew Thumpassery”, reason, and note. This is legacy sample behavior and is not deployed by current staging.

### Flow

- Arrives from: legacy Authorization or Launcher.
- Can go to: Spare Parts or Dashboard.
- Back behavior: Dashboard.

---

## Legacy page: Spare Parts

**File:** `public/app-inventory.html` | **URL on current staging:** not served | **Access:** legacy demo

### Layout (top to bottom)

- Logistics Matrix Allocation card.
- Parts/status list.
- Submit Parts Request.
- Confirm Package Arrival.
- Dashboard and Cash Desk.

### Inputs

None.

### Actions

- Submit Parts Request.
- Confirm Package Arrival.
- Dashboard.
- Cash Desk.

### Empty states

- “No components mapped inside query profile.”

### Mobile issues found

- Item text is 13 px.
- Procurement action uses hardcoded part `4130-120-0603`, so this is not a general picker.

### Flow

- Arrives from: legacy Workbench or Launcher.
- Can go to: Cash Desk or Dashboard.
- Back behavior: Dashboard.

---

## Legacy page: Cash Desk

**File:** `public/app-billing.html` | **URL on current staging:** not served | **Access:** legacy demo

### Layout (top to bottom)

- Checkout & Settlement Counter card.
- Ledger status.
- Conditional Process Cash Settlement.
- Back to Dashboard.

### Inputs

None.

### Actions

- Process Cash Settlement (₹2,450.00).
- Back to Dashboard.

### Empty states

- “Reconstructing ledger records…”
- No verified authorization state hides payment.
- Settled state shows receipt and zero balance.

### Mobile issues found

- Ledger text is 14 px.
- Amount, payment method, and settlement amount are hardcoded; the page is demo-only.

### Flow

- Arrives from: legacy Spare Parts or Launcher.
- Can go to: Dashboard.
- Back behavior: Dashboard.

---

## Cross-page findings

### Current staging defects and risks observed

1. Purchase Orders is the only current route with confirmed page-level horizontal overflow at 390 × 844: 469 px document width versus 375 px viewport content width.
2. Repair Jobs/My Bench renders the job-search input at 320 px high. This consumes most of the first mobile screen.
3. The live All Jobs list contains a Received record displaying “Thomas Crankshaft”, even though the earlier staging-cleanup report expected zero customer/machine/job records. This needs a data provenance audit before a pilot.
4. My Space menu/profile and Repair Jobs/Workbench back controls are less than 44 px wide.
5. Catalog and Staff put three controls into one narrow row. They do not overflow, but search wording is truncated and browsing is cramped.
6. Login has PIN only. SMS fallback and biometric/passkey enrollment are not implemented.
7. The fixed global Find Customer control is present on almost every authenticated page. Current audited routes clear it, but every future sticky footer must preserve that clearance.
8. `app-jobs-advanced.html` remains directly reachable and duplicates current Receive/Workbench/Estimate functions without being registered.
9. The nine `public/` legacy files contain hardcoded sample staff, part, price, and workflow values. They are not currently deployed, but should not be mistaken for current OS pages or reintroduced into the asset root.

### Typography and touch summary

- Current deployed pages generally meet the updated readable type scale:
  - Primary headings: 27–31 px.
  - Body/action text: 16 px.
  - Navigation: 15 px.
  - Section labels/reference text: 14 px.
- Visible current controls generally meet the 44 px height criterion.
- Width failures are limited but important: 34 px My Space icon buttons and 35 px Repair Jobs/Workbench back controls.
- Closed dialogs and data-dependent detail states were source-inventoried but not all rendered and measured in the live pass.

### Navigation model

- My Space is the root.
- Manifest-driven navigation controls which registered apps each role sees.
- My Bench and Tracker are redirects to Repair Jobs filters.
- Workbench and Machine History are contextual support routes reached from data cards.
- Manage is a second manifest-driven app launcher.
- Global customer search is a cross-app overlay, not a separate HTML file.
- Parts Search and Estimate are Workbench states, not standalone current pages.

### Registered but empty/placeholder apps

- None. Every manifest entry has `enabled: true` and `ready: true`.
- “Ready” does not mean every state is production-complete: Purchase Orders currently overflows, Catalog begins with a sparse machine-selection state, and several modules have empty staging data.

### Files present but outside the current app map

- Current asset tree, direct/support/redirect: `login.html`, `work.html`, `machine-history.html`, `manage.html`, `tracker.html`, `app-jobs-advanced.html`.
- Legacy asset tree, not served by current staging: all nine `public/*.html` files documented above.
