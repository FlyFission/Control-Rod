# ADR 0016: Flows and Capital Projects typicals

- Status: Accepted
- Date: 2026-10-22

## Decision
Capital Projects mode ships a flow engine: versioned graphs of deliverable templates whose edges are controlled interfaces with deadbands. Packages draft automatically when inputs are ready, and changes propagate forward only past deadbands. The default library follows FlyFission's typical industrial project phase map (FEL-1 through start up) with a status ladder of preliminary, IFE, IFB, IFD and ready for IFC. Control Rod never issues IFC; a licensed person does, through the customer's document control.

## Reuse
Most of the engine already exists as permissive open source. Staleness and its cause tree follow Dagster's model (Apache-2.0), and the record of which input versions each output used becomes a consumption table; each deadband is checked against the value the consumer actually used, so small changes cannot creep past it. Graph selection uses dbt's syntax (`+X`, `X+`, `@X`). The canvas is React Flow with dagre (MIT). Run events use the OpenLineage schema. Auto-drafting follows Dagster's eager rule as an idempotent DBOS workflow. The Gantt view draws with SVAR React Gantt (MIT); critical path is a small engine of our own because both candidate Gantt libraries lock it behind paid editions. P6 import and export uses MPXJ (LGPL-2.1) in a separate process, which also gives independent evidence for our scheduler. Storage is plain Postgres tables; a 10,000-node test graph walked upstream in 153 ms.

## Conditions
1. Edges live only in the Flow record. Work packages reference them; they do not repeat them. Deadbands are typed (`mode`, `value`, `unit`), never free strings.
2. Nodes are deliverables at a maturity (PFD at IFE, PFD at IFD), which turns most design loops into chains. A remaining loop blocks approval of the flow version until it is declared with a tear edge backed by an Assumption record, and it converges to its deadband.
3. Licenses: tldraw (paid key), n8n (Sustainable Use), xerparser (GPL-3) and pgRouting (GPL-2) are excluded; elkjs (EPL-2.0) stays optional; DHTMLX is pinned to 10 or later.
