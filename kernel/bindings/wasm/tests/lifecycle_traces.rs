//! Replays the package lifecycle conformance traces (models/traces/package-lifecycle/v1)
//! through the kernel's JSON binding, natively. The API replays the same traces through the
//! compiled WebAssembly (services/api/test/lifecycle-traces.test.ts), so a stale build or a
//! drift between the model and the kernel fails one of the two.
//!
//! Pattern PL2 in docs/patterns/plannotator.md. This file only reads the kernel; it changes
//! no decision function.

use controlrod_kernel_wasm::decide_json;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

const FORMAT: &str = "controlrod-package-lifecycle-trace";

fn traces_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../models/traces/package-lifecycle/v1")
}

fn read(path: &Path) -> Result<Value, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
}

fn list<'a>(value: &'a Value, what: &str) -> Result<&'a Vec<Value>, String> {
    value
        .as_array()
        .ok_or_else(|| format!("{what} is not a list"))
}

#[test]
fn kernel_matches_every_lifecycle_trace() -> Result<(), String> {
    let dir = traces_dir();
    let index = read(&dir.join("index.json"))?;
    assert_eq!(index["format"], FORMAT);
    assert_eq!(index["version"], 1);
    let entries = list(&index["traces"], "index traces")?;
    assert!(!entries.is_empty(), "no traces to replay");

    let mut steps = 0;
    let mut mismatches = Vec::new();
    for entry in entries {
        let file = entry["file"]
            .as_str()
            .ok_or("trace entry without a file name")?;
        let trace = read(&dir.join(file))?;
        assert_eq!(trace["format"], FORMAT, "{file}");
        assert_eq!(trace["version"], 1, "{file}");
        let known = list(&trace["known_violations"], "known_violations")?;
        for (i, step) in list(&trace["steps"], "steps")?.iter().enumerate() {
            steps += 1;
            let answer = decide_json(&step["request"].to_string());
            let got: Value =
                serde_json::from_str(&answer).map_err(|e| format!("{file} step {i}: {e}"))?;
            let violation = known.iter().find(|v| v["step"] == i);
            let want = violation.map_or(&step["expect"], |v| &v["today"]);
            if &got != want {
                mismatches.push(format!(
                    "{file} step {i}: kernel {got}, expected {want}; request {}",
                    step["request"]
                ));
            }
        }
    }
    assert!(steps > 0, "traces hold no steps");
    assert!(
        mismatches.is_empty(),
        "{} of {steps} steps differ from the model:\n{}",
        mismatches.len(),
        mismatches
            .iter()
            .take(20)
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    );
    Ok(())
}
