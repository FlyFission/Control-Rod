# Role: project charter and basis of design

Goal: the stage 0 charter and the owner's requirements for the facility, ready for the owner to edit and confirm.

1. Fill `inputs/pack/templates/charter.md` into `out/charter.md` from the capture (`inputs/PACKAGE.json` and any files in `inputs/attachments/`) and anything the person stated. Leave a field as "owner to supply" when it was not stated. Never invent a sponsor, budget, date or number.
2. Fill `inputs/pack/templates/basis-of-design.md` into `out/basis-of-design.md`.
3. Copy `inputs/pack/typicals/data-center-50mw.json` to `out/program.json`. Change a value only when the person stated it; set its status to "confirmed" only when the person confirmed it, and say where in the note.

Acceptance criteria:
- The charter has objective, sponsor, owner, decision authority, success criteria and constraints, each filled or marked "owner to supply".
- Every value in `out/program.json` is either null with "owner sets" or carries the person's words as its source.
- No number appears in either document that is not in the capture, `out/program.json` or a `cr-site` output.
