No blocker or major defects found in `0addc73..HEAD` (`70e8c56`).

The fixes are correct by inspection: `readTx` handles connection errors and discards broken clients; live events invalidate preparation queries; retirement removes the relevant references; package keying resets panel state; all four `Lines` uses preserve typing while storing normalized entries; contract validation rejects path escapes and SVG text; unknown layout IDs return problems without routing exceptions.

The rejection rationale also checks out: the bottom row fits, both Unix files are selected by Go 1.24.7, and installed MSW 3.0.3 uses `onUnhandledFrame`. The previously fixed nested-field and seat-clearance answers remain valid.

Validation: **51 targeted web tests passed**, plus direct layout and Go file-selection checks. Test proof is partial: no navigation regression test covers package keying, only one `Lines` use is exercised, and wrong-kind rejection lacks a committed assertion. The database test could not execute because the read-only environment prevents PostgreSQL fixture creation; its regression scenario is appropriate, but I cannot confirm its result here.

MERGE