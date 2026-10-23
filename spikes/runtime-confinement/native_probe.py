"""Offline native startup/tool probe. Never activates a preparation runtime profile."""

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def boundary(binary, output, fixture=None):
    bubblewrap = shutil.which("bwrap")
    if not bubblewrap:
        raise RuntimeError("bubblewrap unavailable; no runtime evidence")
    args = [
        bubblewrap,
        "--unshare-all",
        "--die-with-parent",
        "--new-session",
        "--ro-bind",
        "/usr",
        "/usr",
        "--ro-bind",
        "/lib",
        "/lib",
        "--ro-bind",
        "/lib64",
        "/lib64",
        "--symlink",
        "usr/bin",
        "/bin",
        "--dir",
        "/runtime",
        "--ro-bind",
        str(binary),
        "/runtime/client",
        "--tmpfs",
        "/tmp",
        "--tmpfs",
        "/home",
        "--dir",
        "/home/sandbox",
        "--dir",
        "/home/sandbox/codex",
        "--dir",
        "/home/sandbox/config",
        "--dir",
        "/home/sandbox/cache",
        "--dir",
        "/work",
        "--bind",
        str(output),
        "/out",
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--chdir",
        "/work",
        "--clearenv",
        "--setenv",
        "PATH",
        "/usr/bin:/bin",
        "--setenv",
        "HOME",
        "/home/sandbox",
        "--setenv",
        "CODEX_HOME",
        "/home/sandbox/codex",
        "--setenv",
        "XDG_CONFIG_HOME",
        "/home/sandbox/config",
        "--setenv",
        "XDG_CACHE_HOME",
        "/home/sandbox/cache",
        "--setenv",
        "LANG",
        "C.UTF-8",
    ]
    if fixture:
        args += ["--ro-bind", str(fixture), "/runtime/probe.py"]
    return args


def run(args, directory):
    return subprocess.run(
        args,
        cwd=directory,
        env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"},
        capture_output=True,
        text=True,
        timeout=45,
        check=True,
    )


def probe(claude, codex):
    records = []
    fixture = Path(__file__).with_name("native_tools_fixture.py").resolve()
    with tempfile.TemporaryDirectory(prefix="cr-native-offline-") as directory:
        for name, candidate in [("claude", claude), ("codex", codex)]:
            binary = Path(candidate).resolve(strict=True)
            if not binary.is_file():
                raise RuntimeError("native executable must be a file")
            before = sha256(binary)
            output = Path(directory) / name
            output.mkdir()
            startup = []
            for option in ["--version", "--help"]:
                result = run(
                    boundary(binary, output) + ["/runtime/client", option], directory
                )
                startup.append(
                    {
                        "argument": option,
                        "exit_code": result.returncode,
                        "stdout_sha256": hashlib.sha256(
                            result.stdout.encode()
                        ).hexdigest(),
                        "version": result.stdout.strip()
                        if option == "--version"
                        else None,
                        "stderr": result.stderr,
                    }
                )
            record = {"runtime": name, "binary_sha256": before, "startup": startup}
            if name == "claude":
                run(
                    boundary(binary, output, fixture)
                    + ["/usr/bin/python3", "/runtime/probe.py"],
                    directory,
                )
                tool_report = json.loads(
                    (output / "disabled-tool-report.json").read_text()
                )
                if not all(tool_report["checks"].values()):
                    raise RuntimeError("Claude tool-refusal checks failed")
                record["disabled_builtin_tools"] = tool_report
                control = output / "positive-control"
                control.mkdir()
                run(
                    boundary(binary, control, fixture)
                    + ["/usr/bin/python3", "/runtime/probe.py", "--positive-control"],
                    directory,
                )
                record["positive_control"] = json.loads(
                    (control / "disabled-tool-report.json").read_text()
                )
                if not all(record["positive_control"]["checks"].values()):
                    raise RuntimeError("Claude positive control failed")
            else:
                record["agent_tool_delegation"] = (
                    "unproved; startup is not a tool-boundary test"
                )
            if sha256(binary) != before:
                raise RuntimeError("native executable changed during probe")
            records.append(record)
    return {
        "scope": "actual native executables; offline startup and scripted Claude tool-refusal fixture only",
        "source_sha256": sha256(__file__),
        "fixture_sha256": sha256(fixture),
        "bubblewrap": subprocess.check_output(
            [shutil.which("bwrap"), "--version"], text=True
        ).strip(),
        "runtimes": records,
        "real_provider_called": False,
        "real_credentials_read": False,
        "credential_broker_proved": False,
        "model_egress_policy_proved": False,
        "activation": "HOLD",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--claude", required=True, help="Installed native executable, not a launcher"
    )
    parser.add_argument(
        "--codex",
        required=True,
        help="Installed native executable, not a Node launcher",
    )
    options = parser.parse_args()
    print(json.dumps(probe(options.claude, options.codex), indent=2))
