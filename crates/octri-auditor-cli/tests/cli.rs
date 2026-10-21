#![allow(clippy::unwrap_used)]
use serde_json::Value;
use std::{
    fs,
    io::Write,
    process::{Command, Stdio},
};

fn cli(args: &[&str], input: &str) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_octri-spec-audit"))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    child.wait_with_output().unwrap()
}
fn good() -> String {
    fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/pets.yaml"
    ))
    .unwrap()
}

#[test]
fn documented_exits_and_structured_stdout() {
    let clean = cli(&["audit", "-"], &good());
    assert_eq!(clean.status.code(), Some(0));
    assert!(clean.stderr.is_empty());
    assert_eq!(
        serde_json::from_slice::<Value>(&clean.stdout).unwrap()["score"],
        10.0
    );
    let warnings = good().replace("      summary: List pets\n", "");
    let failed = cli(&["audit", "-", "--fail-on", "medium"], &warnings);
    assert_eq!(failed.status.code(), Some(1));
    assert!(
        !serde_json::from_slice::<Value>(&failed.stdout).unwrap()["findings"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let invalid = cli(&["audit", "-"], "{");
    assert_eq!(invalid.status.code(), Some(2));
    assert_eq!(
        serde_json::from_slice::<Value>(&invalid.stdout).unwrap()["complete"],
        false
    );
    assert_eq!(cli(&["rules", "--fail-on-new"], "").status.code(), Some(2));
    assert_eq!(cli(&["audit", "-", "--unknown"], "").status.code(), Some(2));
    assert_eq!(
        cli(&["audit", "-", "--profile", "imaginary"], &good())
            .status
            .code(),
        Some(2)
    );
}

#[test]
fn output_policy_protects_sources_and_existing_outputs() {
    let root = std::env::temp_dir().join(format!("octri-auditor-cli-{}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    let source = root.join("source.yaml");
    let output = root.join("report.json");
    fs::write(&source, good()).unwrap();
    fs::write(&output, "keep me").unwrap();
    let source = source.to_str().unwrap();
    let output = output.to_str().unwrap();
    assert_eq!(
        cli(&["audit", source, "--output", source, "--force"], "")
            .status
            .code(),
        Some(2)
    );
    assert_eq!(fs::read_to_string(source).unwrap(), good());
    assert_eq!(
        cli(&["audit", source, "--output", output], "")
            .status
            .code(),
        Some(2)
    );
    assert_eq!(fs::read_to_string(output).unwrap(), "keep me");
    assert_eq!(
        cli(&["audit", source, "--output", output, "--force"], "")
            .status
            .code(),
        Some(0)
    );
    assert_eq!(
        serde_json::from_str::<Value>(&fs::read_to_string(output).unwrap()).unwrap()["valid"],
        true
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn portable_bundle_is_valid_openapi_and_does_not_change_dialect() {
    let output = cli(&["bundle", "-"], &good());
    assert_eq!(output.status.code(), Some(0));
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["openapi"], "3.1.2");
}

#[test]
fn deadline_terminates_blocked_input_and_rejects_unbounded_configuration() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_octri-spec-audit"))
        .args(["--timeout-ms", "50", "execute"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let held_open = child.stdin.take().unwrap();
    let started = std::time::Instant::now();
    let output = child.wait_with_output().unwrap();
    drop(held_open);
    assert_eq!(output.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&output.stderr).contains("TIMEOUT"));
    assert!(started.elapsed() < std::time::Duration::from_secs(5));
    for value in ["0", "30001", "bad"] {
        assert_eq!(
            cli(&["--timeout-ms", value, "rules"], "").status.code(),
            Some(2)
        );
    }
}
