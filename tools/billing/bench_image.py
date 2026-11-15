"""Package the unmodified official serving benchmark and an offline tokenizer."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request
import zipfile


def fetch(url):
    """Read public build inputs with an explicit timeout."""
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def package_benchmark(version, architecture, destination):
    """Verify the official wheel before extracting its benchmark executable."""
    metadata = json.loads(fetch(f"https://pypi.org/pypi/vllm/{version}/json"))
    machine = {"amd64": "x86_64", "arm64": "aarch64"}[architecture]
    matches = [entry for entry in metadata["urls"]
        if entry["filename"].endswith(f"manylinux_2_28_{machine}.whl")]
    if len(matches) != 1:
        raise ValueError("expected exactly one official wheel for the target architecture")
    wheel = matches[0]
    archive = destination / "vllm.whl"
    with urllib.request.urlopen(wheel["url"], timeout=120) as source, archive.open("wb") as target:
        shutil.copyfileobj(source, target)
    with archive.open("rb") as downloaded:
        digest = hashlib.file_digest(downloaded, "sha256").hexdigest()
    if digest != wheel["digests"]["sha256"]:
        raise ValueError("official vLLM wheel digest mismatch")
    with zipfile.ZipFile(archive) as source:
        executable = destination / "vllm-rs"
        executable.write_bytes(source.read("vllm/vllm-rs"))
        executable.chmod(0o755)
    archive.unlink()
    return {"vllm_version": version, "wheel_url": wheel["url"], "wheel_sha256": digest}


def package_tokenizer(model, revision, destination):
    """Freeze the public tokenizer revision; load no model weights or remote code."""
    destination.mkdir()
    for name in ["tokenizer.json", "tokenizer_config.json", "config.json"]:
        (destination / name).write_bytes(fetch(f"https://huggingface.co/{model}/resolve/{revision}/{name}"))
    return {"tokenizer": model, "tokenizer_revision": revision}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True)
    parser.add_argument("--architecture", choices=["amd64", "arm64"], required=True)
    parser.add_argument("--tokenizer", required=True)
    parser.add_argument("--tokenizer-revision", required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args()
    options.output.mkdir(parents=True)
    provenance = package_benchmark(options.version, options.architecture, options.output)
    provenance.update(package_tokenizer(options.tokenizer, options.tokenizer_revision, options.output / "tokenizer"))
    (options.output / "provenance.json").write_text(json.dumps(provenance, indent=2))


if __name__ == "__main__":
    main()
