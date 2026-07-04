# TAGRO OS Ecosystem Doctrine

Status: architectural intent to guide the re-engineering. This document does not claim that the current implementation already satisfies the design.

## The idea

TAGRO OS is an enduring structure on screen that can accept, remove, replace, disable, or relocate applications without damaging the operating core or any other application.

The system has five deliberately separate layers:

1. **Kernel** — structure, identity context, permissions, registry, navigation, launch and shared presentation contracts.
2. **Guerrilla apps** — independently useful business applications that own their rules and data.
3. **Event canopy** — optional, versioned inter-app messaging above the kernel.
4. **Mycelium** — a passive observer membrane that witnesses authorised facts without acting on operational work.
5. **Business intelligence** — read-only interpretation built from the Mycelium's memory.

Core provides existence. Apps provide action. Messaging provides connection. Mycelium provides memory. Intelligence provides understanding.

## Non-negotiable invariants

- No business-domain logic belongs in the kernel.
- Apps depend on a stable TAGRO App Contract, never on kernel implementation details.
- Apps never directly import another app or write another app's tables.
- Removing an app cannot prevent another app from operating.
- A missing or unhealthy app produces a calm unavailable state, not a shell failure.
- Messaging is optional. Its failure cannot stop operational work.
- The observer is non-blocking. Its failure may lose an observation but cannot stop operational work.
- The observer never commands, approves, rejects, edits, scores, or triggers an operational action.
- Business intelligence reads observation data; it never becomes an invisible operational authority.
- Engine replacements preserve the App Contract or provide a compatibility adapter.
- Historical facts remain understandable after an app is removed.
- PINs, credentials, secrets, and unnecessary private data never enter the observer membrane.

## What “apps do not report” means

An observer cannot learn from literal silence. Applications therefore record ordinary business facts because those facts occurred, not because they are preparing reports.

The Event Canopy carries versioned facts such as:

- `machine.received`
- `inspection.completed`
- `estimate.prepared`
- `customer.approved_estimate`
- `part.reserved`
- `repair.completed`
- `machine.delivered`
- `payment.recorded`

Mycelium receives a passive copy at the shared boundary. The originating app does not know which reports, models, or future applications may use that copy.

## Human doctrine

- Software supports people; people do not satisfy software.
- Protect attention before collecting more data.
- Make the preferred action the easiest action.
- “I do not know”, “I forgot”, and “I made a mistake” must lead to recovery, not humiliation or dead ends.
- Enjoyment comes from momentum, clarity, recognition, useful memory, forgiving correction, and visible progress—not childish gamification.
- Fuzzy intelligence may suggest, rank, summarise, or draw attention. It must show its evidence and remain correctable.
- The system must never turn incomplete evidence into a hidden judgement about a customer or staff member.

## Cost and continuity doctrine

- Re-engineer in small, reversible phases.
- Keep durable architecture, decision, migration, and checkpoint documents in the repository.
- Use deterministic logic for routine search and workflow; reserve AI for bounded assistance.
- Test locally before consolidated deployments.
- Pause safely when Codex usage is exhausted and resume from written checkpoints.
- Quality and data safety outrank calendar speed.

