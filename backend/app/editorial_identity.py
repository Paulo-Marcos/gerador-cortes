"""
Identidade editorial do MASCOTE do canal (provider-agnostic).

Fonte externa, NÃO versionada, que descreve o personagem-mascote do canal para os
prompts de thumbnail/metadados: o NOME pelo qual o mascote é citado nos prompts
(ex.: "Sapo"). Espelha o padrão de `channels.identidade_do_canal_ativo()` /
`channel.yaml` — a identidade real vive em `instance/` (fora do git) e é lida em
runtime; quando ausente, um FALLBACK NEUTRO ("mascote") mantém o backend
funcional para um clone limpo, sem embutir a identidade de nenhum canal no código.

POR QUÊ (E-010, origem D-193 — pré-publicação no GitHub): os prompts embutiam o
nome do mascote do canal atual ("Sapo") direto no código. A camada editorial fica
genérica publicando; a identidade concreta migra para
`instance/channels/<ativo>/editorial/mascote.yaml`, que sobrevive a `git pull`.

Camada: config/loader (I/O de filesystem), fora de `domain/` puro — o mesmo lugar
de `channel_config_loader` e `channel_paths`. Consumido pelos serviços de prompt.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml
from app.channel_paths import editorial_dir

_MASCOTE_YAML = "mascote.yaml"


@dataclass(frozen=True)
class Mascote:
    """Identidade editorial do mascote usada nos prompts.

    `nome` é usado VERBATIM no texto dos prompts (ex.: "identidade do Sapo",
    "ombro do Sapo"). Manter só o essencial: o que precisa sair do código para
    o canal permanecer com a saída idêntica lendo do `instance/`.
    """

    nome: str


# Fallback neutro: sem `instance/editorial/mascote.yaml`, os prompts falam de um
# "mascote" genérico — nunca do personagem de um canal específico. É o padrão
# seguro de um clone recém-publicado.
MASCOTE_NEUTRO = Mascote(nome="mascote")


def _ler_yaml(caminho: Path) -> dict:
    try:
        dados = yaml.safe_load(caminho.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return {}
    return dados if isinstance(dados, dict) else {}


def identidade_do_mascote(editorial_root: Path | None = None) -> Mascote:
    """Identidade do mascote do canal ATIVO, lida de `editorial/mascote.yaml`.

    Resolve a raiz editorial via `channel_paths.editorial_dir()` (canal ativo) e
    lê o campo `nome`. Fallback seguro: se o arquivo/campo não existir, devolve
    `MASCOTE_NEUTRO` — nunca lança no caminho feliz do boot. Este é o accessor de
    runtime que os prompts usam no lugar do nome embutido no código.

    `editorial_root` é opcional apenas para testes (isola do `instance/` real),
    espelhando o parâmetro `instance_root` de `services/channels.py`.
    """
    raiz = Path(editorial_root) if editorial_root is not None else editorial_dir()
    dados = _ler_yaml(raiz / _MASCOTE_YAML)
    nome = str(dados.get("nome") or "").strip()
    return Mascote(nome=nome) if nome else MASCOTE_NEUTRO
