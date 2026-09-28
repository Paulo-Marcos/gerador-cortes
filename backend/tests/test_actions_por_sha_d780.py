"""Toda action dos workflows é fixada pelo SHA do commit, com a versão ao lado (D-780).

Uma tag como `@v7` é uma etiqueta que o dono da action pode mover para outro
código; o SHA de um commit não se move. Foi por tags reescritas que a
tj-actions/changed-files vazou segredos de milhares de repositórios em março
de 2025. O comentário `# vX.Y.Z` é o que o Dependabot lê para propor a
atualização — ele troca o SHA e o comentário juntos.

Ficam de fora as actions do próprio repositório (`./...`) e as imagens
`docker://`, que se fixam por digest.
"""

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
USO = re.compile(r"^\s*-?\s*uses:\s*(?P<alvo>\S+)(?P<resto>.*)$")
FIXADA = re.compile(r"^[\w.-]+/[\w./-]+@[0-9a-f]{40}$")
VERSAO = re.compile(r"^\s*#\s*v\d+\.\d+\.\d+\s*$")


def _problemas(texto: str) -> list[str]:
    problemas = []
    for numero, linha in enumerate(texto.splitlines(), 1):
        uso = USO.match(linha)
        if not uso or uso["alvo"].startswith(("./", "docker://")):
            continue
        if not FIXADA.match(uso["alvo"]) or not VERSAO.match(uso["resto"]):
            problemas.append(f"linha {numero}: {linha.strip()}")
    return problemas


def test_toda_action_e_fixada_por_sha_com_a_versao():
    workflows = sorted((RAIZ / ".github" / "workflows").glob("*.y*ml"))
    assert workflows, "nenhum workflow encontrado"

    soltas = {
        caminho.name: problemas
        for caminho in workflows
        if (problemas := _problemas(caminho.read_text(encoding="utf-8")))
    }

    assert not soltas, (
        "Fixe pelo SHA do commit, com a versão exata em comentário "
        f"(uses: dono/acao@<sha> # vX.Y.Z): {soltas}"
    )


class TestODetectorVeASolta:
    """Um guarda que nunca acusa não guarda nada."""

    SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1"

    def test_tag_movel_e_acusada(self):
        assert _problemas("      - uses: actions/checkout@v7\n")

    def test_sha_sem_versao_e_acusado(self):
        assert _problemas(f"        uses: actions/checkout@{self.SHA}\n")

    def test_sha_com_versao_passa(self):
        assert _problemas(f"        uses: actions/checkout@{self.SHA} # v7.0.1\n") == []

    def test_action_local_e_docker_ficam_de_fora(self):
        assert _problemas("      - uses: ./.github/actions/minha\n") == []
        assert _problemas("      - uses: docker://alpine@sha256:abc\n") == []
