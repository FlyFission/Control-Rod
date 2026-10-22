# ADR 0016: Flows and Capital Projects typicals

- Status: Accepted
- Date: 2026-10-22

## Decision
Capital Projects mode ships a flow engine: versioned graphs of deliverable templates whose edges are controlled interfaces with deadbands. Packages draft automatically when inputs are ready, and changes propagate forward only past deadbands. The default library follows FlyFission's typical industrial project phase map (FEL-1 through start up) with a status ladder of preliminary, IFE, IFB, IFD and ready for IFC. Control Rod never issues IFC; a licensed person does, through the customer's document control.
