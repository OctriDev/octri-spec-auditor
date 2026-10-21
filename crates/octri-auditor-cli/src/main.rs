//! Explicit host I/O, protected outputs, structured stdout and documented exits.

use octri_auditor::{
    AuditError, AuditRequest, Config, Input, MAX_ENVELOPE_BYTES, Result, audit, export, fixes, wire,
};
use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    path::Path,
    process::ExitCode,
    sync::mpsc,
    thread,
    time::Duration,
};

const HELP: &str = r#"Octri Spec Auditor

Commands:
  audit <file|-> [--file URI=PATH] [--config FILE] [--profile NAME]
        [--baseline FILE] [--fail-on-new] [--fail-on high|medium|advice]
        [--as-of YYYY-MM-DD] [--format json|html|sarif|annotations|baseline]
        [--output FILE] [--force]
  fix <file|-> --select FINDING_KEY [--select ...] [--file URI=PATH]
        [--config FILE] [--inputs FILE] [--output FILE] [--force]
  bundle <file|-> [--file URI=PATH] [--config FILE] [--output FILE] [--force]
  compare <before.json> <after.json> [--output FILE] [--force]
  rules [--output FILE] [--force]
  execute   Read one ABI-v1 JSON envelope from stdin; emit Ok/Err JSON.

Global prefix: --timeout-ms N (1..30000, default 30000).
Wall-clock deadline includes input reads and output writes.

Offline only. References never authorize filesystem or network retrieval.
Supply dependencies with --file. Relative names resolve against the input's
absolute file URI, or memory://audit/openapi.yaml when reading stdin.
Fix output contains original, revised, edits and revalidated report.
--inputs supplies authored descriptions/schemas keyed by selected finding key.
bundle emits a portable specification without changing its OpenAPI dialect.
Outputs cannot overwrite inputs; existing outputs require explicit --force.
Exit 0: policy passed; 1: findings/policy threshold; 2: blocked or processing failure.
"#;

#[derive(Default)]
struct Arguments {
    command: String,
    paths: Vec<String>,
    files: BTreeMap<String, String>,
    config: Option<String>,
    profiles: Vec<String>,
    baseline: Option<String>,
    fail_on_new: bool,
    fail_on: Option<String>,
    format: String,
    output: Option<String>,
    force: bool,
    selected: Vec<String>,
    inputs: Option<String>,
    as_of: Option<String>,
    dependency_paths: Vec<String>,
}

/// Host watchdog also bounds blocked stdin and stdout. The pure engine has no clock.
struct Deadline {
    cancel: Option<mpsc::Sender<()>>,
    worker: Option<thread::JoinHandle<()>>,
}

impl Deadline {
    fn start(milliseconds: u64) -> Self {
        let (cancel, receiver) = mpsc::channel();
        let worker = thread::spawn(move || {
            if receiver.recv_timeout(Duration::from_millis(milliseconds))
                == Err(mpsc::RecvTimeoutError::Timeout)
            {
                eprintln!("TIMEOUT: Command exceeded {milliseconds} ms wall-clock deadline");
                std::process::exit(2);
            }
        });
        Self {
            cancel: Some(cancel),
            worker: Some(worker),
        }
    }
}

impl Drop for Deadline {
    fn drop(&mut self) {
        if let Some(cancel) = self.cancel.take() {
            let _ = cancel.send(());
        }
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(code) => ExitCode::from(code),
        Err(error) => {
            eprintln!("{}: {}", error.code, error.message);
            ExitCode::from(2)
        }
    }
}

fn run() -> Result<u8> {
    let mut raw: Vec<_> = std::env::args_os()
        .skip(1)
        .map(|value| {
            value
                .into_string()
                .map_err(|_| error("Command-line paths and arguments must be UTF-8"))
        })
        .collect::<Result<_>>()?;
    if raw.is_empty() || raw.iter().any(|arg| arg == "--help" || arg == "-h") {
        print!("{HELP}");
        return Ok(0);
    }
    if raw == ["--version"] {
        println!("octri-spec-audit {}", octri_auditor::ENGINE_VERSION);
        return Ok(0);
    }
    let milliseconds = if raw.first().is_some_and(|arg| arg == "--timeout-ms") {
        let value = raw
            .get(1)
            .and_then(|arg| arg.parse::<u64>().ok())
            .filter(|value| (1..=30_000).contains(value))
            .ok_or_else(|| error("--timeout-ms requires an integer from 1 to 30000"))?;
        raw.drain(..2);
        value
    } else {
        30_000
    };
    let _deadline = Deadline::start(milliseconds);
    if raw.is_empty() {
        return Err(error("Specify a command after --timeout-ms"));
    }
    if raw[0] == "execute" {
        if raw.len() != 1 {
            return Err(error("execute takes no options"));
        }
        let input = read("-", MAX_ENVELOPE_BYTES)?;
        let output = wire::dispatch(&input);
        io::stdout()
            .write_all(output.as_bytes())
            .map_err(|failure| AuditError::new("OUTPUT_IO", failure.to_string()))?;
        return Ok(if output.starts_with("{\"Err\"") { 2 } else { 0 });
    }
    let args = arguments(raw)?;
    if args.command == "rules" {
        if !args.paths.is_empty() {
            return Err(error("rules takes no input files"));
        }
        let output = pretty(octri_auditor::catalogue::RULES)?;
        write_output(&args, &output)?;
        return Ok(0);
    }
    if args.command == "compare" {
        if args.paths.len() != 2 {
            return Err(error("compare requires two report files"));
        }
        let before = decode(&read(&args.paths[0], MAX_ENVELOPE_BYTES)?)?;
        let after = decode(&read(&args.paths[1], MAX_ENVELOPE_BYTES)?)?;
        write_output(&args, &pretty(export::compare(&before, &after)?)?)?;
        return Ok(0);
    }
    if args.paths.len() != 1 {
        return Err(error("Specify one input file or - for stdin"));
    }
    let config: Config = match &args.config {
        Some(path) => decode(&read(path, 1024 * 1024)?)?,
        None => Config::default(),
    };
    let mut request = AuditRequest {
        input: Input {
            uri: source_uri(&args.paths[0])?,
            content: Some(read(&args.paths[0], 24 * 1024 * 1024)?),
            generated: false,
        },
        files: args.files.clone(),
        config,
    };
    if !args.profiles.is_empty() {
        request.config.profiles = args.profiles.clone();
    }
    if let Some(path) = &args.baseline {
        request.config.baseline = Some(decode(&read(path, MAX_ENVELOPE_BYTES)?)?);
    }
    if args.fail_on_new {
        request.config.fail_on_new = true;
    }
    if let Some(severity) = &args.fail_on {
        request.config.fail_on = decode(&format!("\"{severity}\""))?;
    }
    if let Some(date) = &args.as_of {
        request.config.as_of = Some(date.clone());
    }
    if args.command == "bundle" {
        let bundled = octri_auditor::bundle(&request)?;
        write_output(&args, bundled.input.content.as_deref().unwrap_or(""))?;
        return Ok(0);
    }
    let report = audit(&request)?;
    if args.command == "fix" {
        let result = fixes::apply(&fixes::FixRequest {
            expected_files: fixes::hashes(&report),
            request,
            keys: args.selected.clone(),
            inputs: match &args.inputs {
                Some(path) => decode(&read(path, MAX_ENVELOPE_BYTES)?)?,
                None => BTreeMap::new(),
            },
        })?;
        write_output(&args, &pretty(&result)?)?;
        return Ok(if result.report.policy_passed { 0 } else { 1 });
    }
    let output = match args.format.as_str() {
        "json" => pretty(&report)?,
        "html" => export::html(&report),
        "sarif" => pretty(export::sarif(&report))?,
        "annotations" => export::annotations(&report),
        "baseline" => pretty(octri_auditor::baseline(&report))?,
        _ => return Err(error("Unknown report format")),
    };
    write_output(&args, &output)?;
    Ok(if !report.complete {
        2
    } else if report.policy_passed {
        0
    } else {
        1
    })
}

fn arguments(raw: Vec<String>) -> Result<Arguments> {
    let mut args = Arguments {
        command: raw[0].clone(),
        format: "json".into(),
        ..Arguments::default()
    };
    if !matches!(
        args.command.as_str(),
        "audit" | "fix" | "compare" | "rules" | "bundle"
    ) {
        return Err(error("Unknown command; use --help"));
    }
    let mut values = raw.into_iter().skip(1);
    while let Some(value) = values.next() {
        if value.starts_with("--") {
            let permitted = match args.command.as_str() {
                "rules" | "compare" => matches!(value.as_str(), "--output" | "--force"),
                "bundle" => matches!(
                    value.as_str(),
                    "--file" | "--config" | "--output" | "--force"
                ),
                "fix" => value != "--format",
                _ => !matches!(value.as_str(), "--select" | "--inputs"),
            };
            if !permitted {
                return Err(error(&format!(
                    "{value} does not apply to {}",
                    args.command
                )));
            }
        }
        match value.as_str() {
            "--force" => args.force = true,
            "--fail-on-new" => args.fail_on_new = true,
            "--config" => args.config = Some(next(&mut values, "--config")?),
            "--output" => args.output = Some(next(&mut values, "--output")?),
            "--format" => args.format = next(&mut values, "--format")?,
            "--profile" => args.profiles.push(next(&mut values, "--profile")?),
            "--baseline" => args.baseline = Some(next(&mut values, "--baseline")?),
            "--fail-on" => args.fail_on = Some(next(&mut values, "--fail-on")?),
            "--select" => args.selected.push(next(&mut values, "--select")?),
            "--inputs" => args.inputs = Some(next(&mut values, "--inputs")?),
            "--as-of" => args.as_of = Some(next(&mut values, "--as-of")?),
            "--file" => {
                let declaration = next(&mut values, "--file")?;
                let (name, path) = declaration
                    .split_once('=')
                    .ok_or_else(|| error("--file requires URI=PATH"))?;
                if args.files.len() >= 99 {
                    return Err(error("At most 99 dependency files are allowed"));
                }
                if args
                    .files
                    .insert(name.into(), read(path, 24 * 1024 * 1024)?)
                    .is_some()
                {
                    return Err(error("Duplicate virtual file name"));
                }
                args.dependency_paths.push(path.into());
            }
            "-" => args.paths.push(value),
            _ if value.starts_with('-') => return Err(error(&format!("Unknown option {value}"))),
            _ => args.paths.push(value),
        }
    }
    if let Some(output) = &args.output
        && args
            .paths
            .iter()
            .chain(args.dependency_paths.iter())
            .chain(args.config.iter())
            .chain(args.baseline.iter())
            .chain(args.inputs.iter())
            .any(|input| same_path(input, output))
    {
        return Err(error(
            "Output must differ from every input; original artifacts are immutable",
        ));
    }
    Ok(args)
}

fn next(values: &mut impl Iterator<Item = String>, flag: &str) -> Result<String> {
    values
        .next()
        .ok_or_else(|| error(&format!("{flag} needs a value")))
}
fn same_path(left: &str, right: &str) -> bool {
    fs::canonicalize(left)
        .ok()
        .zip(fs::canonicalize(right).ok())
        .is_some_and(|(left, right)| left == right)
        || Path::new(left) == Path::new(right)
}
fn source_uri(path: &str) -> Result<String> {
    if path == "-" {
        return Ok("memory://audit/openapi.yaml".into());
    }
    let path = fs::canonicalize(path)
        .map_err(|failure| AuditError::new("INPUT_IO", failure.to_string()))?;
    url::Url::from_file_path(path)
        .map(String::from)
        .map_err(|()| {
            AuditError::new(
                "INPUT_URI",
                "Input path cannot be represented as a file URI",
            )
        })
}
fn read(path: &str, limit: usize) -> Result<String> {
    let mut reader: Box<dyn Read> = if path == "-" {
        Box::new(io::stdin())
    } else {
        Box::new(
            fs::File::open(path)
                .map_err(|failure| AuditError::new("INPUT_IO", failure.to_string()))?,
        )
    };
    let mut bytes = Vec::new();
    reader
        .by_ref()
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|failure| AuditError::new("INPUT_IO", failure.to_string()))?;
    if bytes.len() > limit {
        return Err(AuditError::new(
            "INPUT_LIMIT",
            "Input exceeds the documented byte limit",
        ));
    }
    String::from_utf8(bytes)
        .map_err(|failure| AuditError::new("INPUT_ENCODING", failure.to_string()))
}
fn decode<T: serde::de::DeserializeOwned>(value: &str) -> Result<T> {
    serde_json::from_str(value)
        .map_err(|failure| AuditError::new("INVALID_JSON", failure.to_string()))
}
fn pretty(value: impl serde::Serialize) -> Result<String> {
    serde_json::to_string_pretty(&value)
        .map(|text| text + "\n")
        .map_err(|failure| AuditError::new("OUTPUT_JSON", failure.to_string()))
}
fn write_output(args: &Arguments, value: &str) -> Result<()> {
    if let Some(path) = &args.output {
        atomic_output(Path::new(path), value.as_bytes(), args.force)
            .map_err(|failure| AuditError::new("OUTPUT_IO", failure.to_string()))?;
    } else {
        io::stdout()
            .write_all(value.as_bytes())
            .map_err(|failure| AuditError::new("OUTPUT_IO", failure.to_string()))?;
    }
    Ok(())
}
fn atomic_output(path: &Path, bytes: &[u8], force: bool) -> io::Result<()> {
    let name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "Output must name a file"))?
        .to_string_lossy();
    let temporary = path.with_file_name(format!(".{name}.{}.tmp", std::process::id()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temporary)?;
    let result = (|| {
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        if force {
            fs::rename(&temporary, path)
        } else {
            fs::hard_link(&temporary, path)
        }
    })();
    let _ = fs::remove_file(temporary);
    result
}
fn error(message: &str) -> AuditError {
    AuditError::new("CLI_USAGE", message)
}
