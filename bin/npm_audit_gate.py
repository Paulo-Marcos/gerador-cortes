"""Portão do `npm audit` com exceções datadas (D-872).

O CI barra alerta alto ou crítico desde a D-808. O `npm audit` não aceita
exceção: um alerta sem versão corrigida reprova todo PR, sem que nada se possa
fazer no PR. Este script roda o `npm audit --json` e barra o mesmo que antes,
menos os GHSA listados em `EXCECOES`, cada um com o motivo e a data para rever.
Exceção vencida volta a barrar: a lista não vira um esquecimento.

Uso (na pasta do pacote): python3 ../bin/npm_audit_gate.py
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import UTC, date, datetime
from typing import NamedTuple

SEVERIDADES_QUE_BARRAM = {"high", "critical"}


class Excecao(NamedTuple):
    motivo: str
    rever_em: date


EXCECOES: dict[str, Excecao] = {
    "GHSA-vfj7-8cjw-p6xm": Excecao(
        motivo=(
            "braces <=3.0.3 (DoS por padrão muito aninhado) não tem versão corrigida. "
            "Entra pelo Tailwind 3 (chokidar, micromatch, fast-glob), que só lê os globs "
            "do próprio config no build, nunca entrada de fora. Sai com o Tailwind 4, "
            "que não usa braces."
        ),
        rever_em=date(2027, 1, 3),
    ),
}


class Alerta(NamedTuple):
    ghsa: str
    pacote: str
    severidade: str
    titulo: str


def alertas_do_relatorio(relatorio: dict) -> list[Alerta]:
    """Os avisos de segurança do relatório, um por GHSA.

    Em `via`, um dict é o aviso; uma string é só o nome da dependência
    vulnerável, cujo aviso já aparece na entrada dela.
    """
    vistos: dict[str, Alerta] = {}
    for pacote in relatorio.get("vulnerabilities", {}).values():
        for via in pacote.get("via", []):
            if not isinstance(via, dict):
                continue
            ghsa = str(via.get("url", "")).rsplit("/", 1)[-1] or str(via.get("source"))
            vistos.setdefault(
                ghsa,
                Alerta(ghsa, via.get("name", "?"), via.get("severity", "?"), via.get("title", "")),
            )
    return sorted(vistos.values())


def separar(
    alertas: list[Alerta], hoje: date, excecoes: dict[str, Excecao] = EXCECOES
) -> tuple[list[Alerta], list[Alerta]]:
    """Divide os alertas que barram em (barram, aceitos por exceção vigente)."""
    barram: list[Alerta] = []
    aceitos: list[Alerta] = []
    for alerta in alertas:
        if alerta.severidade not in SEVERIDADES_QUE_BARRAM:
            continue
        excecao = excecoes.get(alerta.ghsa)
        if excecao and hoje <= excecao.rever_em:
            aceitos.append(alerta)
        else:
            barram.append(alerta)
    return barram, aceitos


def rodar_npm_audit() -> dict:
    npm = shutil.which("npm")
    if npm is None:
        sys.exit("npm não encontrado no PATH.")
    proc = subprocess.run(
        [npm, "audit", "--json"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=300,
        check=False,
    )
    # O npm audit sai com 1 quando acha vulnerabilidade: esperado, o JSON vem igual.
    try:
        relatorio = json.loads(proc.stdout)
    except json.JSONDecodeError:
        print(proc.stdout)
        print(proc.stderr, file=sys.stderr)
        sys.exit("npm audit não devolveu JSON.")
    if "error" in relatorio:
        sys.exit(f"npm audit falhou: {relatorio['error']}")
    return relatorio


def main(hoje: date | None = None) -> int:
    hoje = hoje or datetime.now(UTC).date()
    barram, aceitos = separar(alertas_do_relatorio(rodar_npm_audit()), hoje)
    for alerta in aceitos:
        excecao = EXCECOES[alerta.ghsa]
        print(f"aceito até {excecao.rever_em}: {alerta.ghsa} ({alerta.pacote}) — {excecao.motivo}")
    for alerta in barram:
        vencida = alerta.ghsa in EXCECOES
        motivo = (
            f"exceção vencida em {EXCECOES[alerta.ghsa].rever_em}" if vencida else "sem exceção"
        )
        print(
            f"BARRA: {alerta.ghsa} ({alerta.pacote}, {alerta.severidade}) — {alerta.titulo} [{motivo}]"
        )
    if barram:
        print(f"\n{len(barram)} alerta(s) alto(s) ou crítico(s). Corrija ou reveja a exceção.")
        return 1
    print("\nNenhum alerta alto ou crítico fora das exceções vigentes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
