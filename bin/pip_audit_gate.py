"""Gate de severidade para pip-audit.

pip-audit nao expõe severidade nativamente (ao contrario do `npm audit`, que
classifica em critical/high/moderate/low). Este script roda o pip-audit,
consulta a severidade de cada vulnerabilidade encontrada na API publica do
OSV (que replica a classificacao do GHSA quando revisado pelo GitHub) e falha
o processo apenas se houver alguma vulnerabilidade CRITICAL. As demais
severidades (high/moderate/low/desconhecida) ficam apenas no log, informativas.

Uso: python bin/pip_audit_gate.py <requirements1.txt> [requirements2.txt ...]
"""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
import urllib.request
from typing import NamedTuple

OSV_URL = "https://api.osv.dev/v1/vulns/{}"


class Finding(NamedTuple):
    package: str
    version: str
    vuln_id: str
    severity: str | None


def run_pip_audit(req_files: list[str]) -> dict:
    cmd = ["pip-audit", "--format=json", "--progress-spinner=off"]
    for req_file in req_files:
        cmd += ["-r", req_file]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    # pip-audit sai com codigo 1 quando encontra vulnerabilidades — esperado, nao e erro do script.
    if proc.returncode not in (0, 1):
        print(proc.stdout)
        print(proc.stderr, file=sys.stderr)
        sys.exit(proc.returncode)
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        print(proc.stdout)
        print(proc.stderr, file=sys.stderr)
        sys.exit(1)


def fetch_severity(vuln_id: str) -> str | None:
    try:
        with urllib.request.urlopen(OSV_URL.format(vuln_id), timeout=10) as resp:
            body = json.load(resp)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"  aviso: falha ao consultar severidade de {vuln_id}: {exc}", file=sys.stderr)
        return None
    return body.get("database_specific", {}).get("severity")


def main() -> None:
    req_files = sys.argv[1:] or ["requirements.txt"]
    data = run_pip_audit(req_files)

    findings: list[Finding] = []
    severity_cache: dict[str, str | None] = {}
    for dep in data.get("dependencies", []):
        for vuln in dep.get("vulns", []):
            vuln_id = vuln["aliases"][0] if vuln.get("aliases") else vuln["id"]
            if vuln_id not in severity_cache:
                severity_cache[vuln_id] = fetch_severity(vuln_id)
            findings.append(Finding(dep["name"], dep["version"], vuln["id"], severity_cache[vuln_id]))

    print(f"pip-audit: {len(findings)} vulnerabilidade(s) encontradas.")
    for f in findings:
        print(f"  - {f.package} {f.version}: {f.vuln_id} (severidade: {f.severity or 'desconhecida'})")

    critical = [f for f in findings if f.severity and f.severity.upper() == "CRITICAL"]
    if critical:
        print(f"\nERRO: {len(critical)} vulnerabilidade(s) CRITICAL encontradas:", file=sys.stderr)
        for f in critical:
            print(f"  - {f.package} {f.version}: {f.vuln_id}", file=sys.stderr)
        sys.exit(1)

    print("\nNenhuma vulnerabilidade CRITICAL encontrada (high/moderate seguem informativos).")


if __name__ == "__main__":
    main()
