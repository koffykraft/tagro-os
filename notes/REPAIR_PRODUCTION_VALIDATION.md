# Machine Repair — Concept Validation and Proof of Production

Status: product validation brief. No implementation is authorised merely by this document.

## 1. Purpose

The repair ecosystem exists to remove dangerous dependence on individual memory, paper, verbal promises, and retrospective explanations.

It should help staff:

1. recognise or quickly record the customer and machine;
2. accept the machine honestly and give it an identity;
3. understand relevant history at the moment it is useful;
4. inspect and prepare an accurate estimate;
5. prepare complete invoicing material for billing;
6. know every machine's current position and responsibility;
7. know required, reserved, consumed, and unavailable inventory;
8. recover cleanly from uncertainty, omissions, and mistakes;
9. build responsible business knowledge without demeaning customers or staff.

The product is successful when staff prefer it to paper because it remembers, reduces typing, prevents repeated work, and gives useful help at the exact junction where it is needed.

## 2. The unit travelling through the ecosystem

The travelling object is a **Repair Case**: a particular machine belonging to a particular customer, received at a particular branch and time for a stated reason.

The physical machine travels through the workshop. Its Repair Case travels virtually through independent junction applications.

Identity chain:

`Customer → Machine → Repair Case → Events → Estimate → Work → Parts → Billing Material → Delivery`

The system never relies on a manually selected status. Status and position are derived from the latest valid timeline events.

## 3. Minimum doorway

Every Repair Case requires:

- customer identity;
- machine identity;
- receiving branch/place;
- receiving staff member;
- received time;
- reported complaint or reason for visit.

This is a minimum identity gate, not a long form.

For a returning customer or machine, the system recalls existing facts and asks only for confirmation or change.

For a new or uncertain case, the system creates a minimal provisional identity in seconds and visibly marks missing information for later reconciliation. It must not force staff to invent facts, and it must not create an intake roadblock.

## 4. Junction applications

Each junction is independently useful and removable from the shell.

| Junction | Responsibility | Facts produced |
|---|---|---|
| Receive | Recognise customer/machine and accept custody | machine received, condition, accessories, complaint |
| Inspect | Record findings and diagnosis | inspection started/completed, findings, recommended work |
| Estimate | Assemble labour, parts, tax and customer decision | estimate prepared/revised/sent/approved/rejected |
| Workbench | Record actual repair activity | repair started/paused/resumed/completed |
| Parts | Find, reserve, issue, consume or return inventory | part requested/reserved/issued/consumed/returned |
| Billing Handoff | Prepare complete invoicing materials | billing material prepared/accepted/corrected |
| Delivery | Notify, collect payment state and return custody | customer notified, delivered, collection exception |

These apps may communicate through versioned events. None owns the kernel.

## 5. Information available at the right moment

When a machine is recognised, authorised staff may see:

- previous repair visits and most recent work;
- repeated symptoms, replaced parts, and unresolved recommendations;
- warranties, previous estimates, invoices, and payment state;
- collection delays and notification history;
- recorded operating conditions, misuse evidence, and maintenance frequency;
- current queue, physical/workshop position, assigned mechanic, and blockers;
- parts availability and expected arrival information.

The interface should show the smallest useful summary first and allow detail on demand. It must not bury the current task under history.

## 6. Customer and machine intelligence

The system may calculate factual indicators such as:

- number and frequency of visits;
- maintenance interval;
- repeated failure category;
- average estimate approval delay;
- unpaid or overdue amount;
- average collection delay after notification;
- previous advice not acted upon;
- usage or damage pattern supported by recorded evidence.

Safeguards:

- no hidden “good/bad customer” score;
- every flag has a reason, source facts, date, owner, and correction route;
- uncertainty is displayed as uncertainty;
- old flags may expire or be resolved;
- staff can record a correction without deleting history;
- sensitive financial information is role-restricted.

Fuzzy intelligence may suggest that a pattern deserves attention. A person remains responsible for interpretation and action.

## 7. Mechanic and workshop intelligence

The system should answer:

- how many machines are in the branch and workshop;
- where each machine is physically and virtually;
- which machines are waiting, being inspected, being repaired, blocked, ready, or overdue;
- which mechanic owns the next action;
- how many active cases are in each mechanic's queue;
- how long each case has spent in working time versus waiting for customer, parts, approval, or information;
- what work was promised and what actually occurred.

Promptness must be interpreted in context. Time waiting for parts or customer approval must not be presented as mechanic delay. Metrics are aids for load balancing and improvement, not automatic punishment or public ranking.

## 8. Results wanted

### Immediate operational results

- A returning customer and machine can be recognised without retyping known information.
- A new Repair Case can be opened quickly with honest minimum data.
- Staff can see current position, responsibility, blockers, and next useful action.
- Estimates use catalogue aliases, official descriptions, prices, HSN/SAC, GST, labour, and quantities.
- Billing receives complete, traceable invoicing material.
- Parts demand and actual consumption are visible.
- No machine becomes invisible because someone forgot a paper, verbal promise, or status update.

### Management results

- Accurate branch and workshop workload.
- Queue age and bottleneck visibility.
- Estimate conversion, delay, and revision patterns.
- Repair turnaround separated into working and waiting causes.
- Inventory demand and shortage patterns.
- Repeat-failure and maintenance patterns.
- Customer collection and payment behaviour based on evidence.
- Staff workload and process support needs.

### Human results

- Less repeated typing, searching, remembering, and apologising.
- Fewer surprises and confrontations.
- Clear recovery from incomplete information and mistakes.
- Staff confidence that the system helps rather than audits them unfairly.
- Customers receive clearer estimates, updates, and explanations.

## 9. How results are generated

1. Junction apps record small, truthful events during ordinary work.
2. Operational apps retain their own authoritative data.
3. The Event Canopy carries optional versioned facts between interested apps.
4. Mycelium receives a non-blocking, privacy-filtered copy.
5. Read models derive current queues, positions, histories, and totals.
6. Deterministic rules generate reliable facts and calculations.
7. Fuzzy intelligence adds explainable suggestions, similarity, prioritisation, and pattern recognition.
8. Authorised staff confirm consequential decisions.
9. Business intelligence presents trends and exceptions without altering operational history.

## 10. How results are used

- Reception uses memory to reduce intake effort.
- Inspectors use recent history to avoid repeated diagnosis.
- Estimators use aliases and catalogue knowledge for fast, complete estimates.
- Mechanics use queues, blockers, manuals, diagrams, and prior work.
- Parts staff use expected demand, reservations, and consumption.
- Billing uses structured invoicing material instead of reconstructing work.
- Branch managers balance workload and resolve bottlenecks.
- Owners see responsible growth indicators and systemic problems.
- Customer communications use clear facts rather than staff recollection.

## 11. Concept validation

Before broad re-engineering, observe a small number of real repair cases and answer:

- Can staff identify a returning customer and machine with less effort than paper?
- Can a new case be opened without invented data or delay?
- Does each junction record a natural fact rather than satisfy a form?
- Can another staff member understand the case without asking the original receiver?
- Can an estimate be prepared faster and with fewer missing items?
- Can billing use the handoff without retyping or guessing?
- Can the system identify the real blocker without blaming the wrong person?
- Do staff voluntarily return to the system during the next case?

Failed answers require workflow redesign before adding more features.

## 12. Proof of Production

Proof of Production is stronger than a demonstration. The repair path is production-proven only when:

- real staff complete real cases through the intended junctions;
- existing customer, machine, price, job, estimate, and history data are preserved;
- role permissions and sensitive financial visibility are verified;
- duplicate customer and machine identities can be reconciled;
- interruption, retry, accidental duplicate submission, and weak mobile connectivity are handled safely;
- every consequential change has an attributable timeline fact;
- statuses and queues rebuild correctly from events;
- estimates and billing material reconcile arithmetically;
- backups and restoration are tested;
- removing or disabling one junction does not damage the kernel or other apps;
- disabling messaging or Mycelium does not stop operational work;
- staff can correct mistakes without erasing history;
- staff prefer the workflow to paper in repeated use, not only during demonstration.

## 13. Proposed validation measures

Targets must be agreed with staff after observing current reality. Useful measures include:

- time to recognise a returning customer and machine;
- time to open a new Repair Case;
- percentage of estimates complete without billing rework;
- number of unlocated or ownership-unclear machines;
- number of duplicate customer/machine records;
- time spent waiting by cause;
- estimate approval and revision time;
- collection delay after notification;
- missing-part surprises during repair;
- corrections and recovery success;
- voluntary staff usage after the assisted trial period.

The objective is improvement from the current baseline, not impressive numbers chosen before reality is measured.
