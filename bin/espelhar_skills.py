#!/usr/bin/env python3
"""espelhar_skills.py — mantém `.agents/skills` igual a `.claude/skills` (D-681).

As skills do projeto servem a dois agentes: o Claude Code lê `.claude/skills` e o
Antigravity lê `.agents/skills`. A fonte é `.claude/skills`; a outra pasta é cópia.
Link simbólico não serve: no Windows pede privilégio e o git o quebra ao clonar.

Uso:
    python bin/espelhar_skills.py            # copia a fonte sobre a cópia
    python bin/espelhar_skills.py --check    # só confere (sai 1 se divergirem)

Edite sempre em `.claude/skills` e rode o espelho; o teste
`backend/tests/test_skills_espelhadas_d681.py` reprova o CI se esquecer.
"""

import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
FONTE = RAIZ / ".claude" / "skills"
COPIA = RAIZ / ".agents" / "skills"


def _arquivos(pasta: Path) -> dict[str, bytes]:
    """Caminho relativo → conteúdo, com CRLF normalizado (o git pode reescrever)."""
    return {
        p.relative_to(pasta).as_posix(): p.read_bytes().replace(b"\r\n", b"\n")
        for p in sorted(pasta.rglob("*"))
        if p.is_file() and "__pycache__" not in p.parts
    }


def diferencas(fonte: Path = FONTE, copia: Path = COPIA) -> list[str]:
    """O que falta, sobra ou difere na cópia em relação à fonte."""
    a, b = _arquivos(fonte), _arquivos(copia)
    faltam = [f"falta na copia: {k}" for k in a.keys() - b.keys()]
    sobram = [f"sobra na copia: {k}" for k in b.keys() - a.keys()]
    diferem = [f"difere: {k}" for k in a.keys() & b.keys() if a[k] != b[k]]
    return sorted(faltam + sobram + diferem)


def espelhar(fonte: Path = FONTE, copia: Path = COPIA) -> None:
    """Copia o que falta ou difere e apaga o que sobra, arquivo por arquivo.

    Nunca apaga a pasta inteira: no OneDrive um `rmtree` falha no meio (pasta
    presa pela sincronização) e deixa a cópia pela metade.
    """
    a, b = _arquivos(fonte), _arquivos(copia)
    for rel in a.keys() - b.keys() | {k for k in a.keys() & b.keys() if a[k] != b[k]}:
        destino = copia / rel
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(fonte / rel, destino)
    for rel in b.keys() - a.keys():
        (copia / rel).unlink()
    for pasta in sorted((p for p in copia.rglob("*") if p.is_dir()), reverse=True):
        if not any(pasta.iterdir()):
            pasta.rmdir()


def main(argv: list[str]) -> int:
    if "--check" in argv:
        problemas = diferencas()
        for linha in problemas:
            print(linha)
        print(
            "OK: copia igual a fonte"
            if not problemas
            else f"{len(problemas)} divergencia(s)"
        )
        return 1 if problemas else 0
    espelhar()
    print(f"OK: {COPIA.relative_to(RAIZ)} espelhada de {FONTE.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
