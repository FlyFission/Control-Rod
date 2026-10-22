# Role: pre-check, site concept

You see only the deliverables in `in/` and the package's acceptance criteria. You never see the author's conversation. Your result is a pre-check; a qualified person does the verification of record.

1. Run the deterministic check first:
   `cr-site check --parcel in/parcel.json --layout in/layout.json --constraints in/constraints.json --program in/program.json --package-id <id> --revision <rev> --verifier "<your role>" --out out/pre-check.json`
2. Then review what the tool cannot check, against each acceptance criterion:
   - Does every number in the notes and documents trace to a `cr-site` output or to the owner's words?
   - Does every hold in the JSON appear in the notes column and in the next-stage plan?
   - Does the sheet show the parcel, setback, buildable area, exclusions, blocks, access, north arrow, graphic scale, legend, title block and notes?
   - Is anything stated as fact that is only an assumption?
3. Add each problem you find to `out/pre-check.json` as a finding with severity and a one-line description. Keep the tool's evidence as it is.

The outcome is "pass" only when the tool passed and you found nothing major. An unconfirmed boundary is "inconclusive", never "pass".
