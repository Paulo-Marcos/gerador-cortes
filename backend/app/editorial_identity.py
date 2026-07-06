"""
Identidade editorial do MASCOTE do canal (provider-agnostic).

Descreve o personagem-mascote do canal para os prompts de thumbnail/metadados: o
NOME pelo qual o mascote é citado nos prompts (ex.: "Sapo").

FONTE DA VERDADE (D-285): o banco de settings (`settings_store`,
`instance/settings.db`), numa linha por canal — o MESMO padrão que a D-191 aplicou
à identidade do canal. O arquivo `editorial/mascote.yaml` continua existindo como
ESPELHO de compatibilidade/backup e serve de FALLBACK+migração: quando o banco
ainda não tem a linha do canal (primeiro acesso após o D-285, ou config trazida da
PROD em arquivo), o accessor lê o yaml e SEMEIA o banco a partir dele (idempotente).
Quando nada existe, um FALLBACK NEUTRO ("mascote") mantém o backend funcional para
um clone limpo, sem embutir a identidade de nenhum canal no código.

POR QUÊ (E-010, origem D-193 — pré-publicação no GitHub): os prompts embutiam o
nome do mascote do canal atual ("Sapo") direto no código. A camada editorial ficou
genérica publicando; a identidade concreta vivia só em
`instance/channels/<ativo>/editorial/mascote.yaml`. A D-285 fecha o vão da D-191
trazendo essa identidade para o banco editável pela UI, deixando o yaml como espelho.

Camada: config/loader (I/O de filesystem + banco de settings), fora de `domain/`
puro — o mesmo lugar de `channel_config_loader` e `channel_paths`. A fachada pública
(`identidade_do_mascote()` → `Mascote`) é preservada: os serviços de prompt não mudam.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml
from app import channel_paths
from app.channel_paths import editorial_dir
from app.services import settings_store

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


def _channel_id_ativo() -> str:
    """Id do canal ATIVO (chave da linha de mascote no `settings_store`).

    Espelha `AppSettingsService._channel_id`: o nome da pasta do canal ativo, ou
    `"instance"` no layout legado plano (fallback de `active_channel_root`)."""
    return channel_paths.active_channel_root().name


def _nome_do_yaml(editorial_root: Path | None) -> str:
    """Nome do mascote no `editorial/mascote.yaml` (espelho/legado), ou "" se ausente."""
    raiz = Path(editorial_root) if editorial_root is not None else editorial_dir()
    dados = _ler_yaml(raiz / _MASCOTE_YAML)
    return str(dados.get("nome") or "").strip()


def _mascote_de(nome: str) -> Mascote:
    """`Mascote(nome)` quando há nome; senão o fallback neutro."""
    return Mascote(nome=nome) if nome else MASCOTE_NEUTRO


def _resolver_db_e_canal(db_path: Path | None, channel_id: str | None) -> tuple[Path, str]:
    """Resolve (banco de settings, id do canal ativo), aceitando overrides de teste."""
    db = db_path if db_path is not None else channel_paths.settings_db_path()
    cid = channel_id if channel_id is not None else _channel_id_ativo()
    return db, cid


def identidade_do_mascote(
    editorial_root: Path | None = None,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
) -> Mascote:
    """Identidade do mascote do canal ATIVO — banco como fonte da verdade (D-285).

    Ordem de resolução (espelha `AppSettingsService._load` da D-191):
      1. BANCO (`settings_store`): se já há linha para o canal, é a fonte da verdade.
      2. Sem linha → MIGRA (idempotente): lê o `editorial/mascote.yaml` legado e
         SEMEIA o banco a partir dele. A partir daí o yaml é só espelho.
      3. Sem nome em lugar nenhum → `MASCOTE_NEUTRO` ("mascote").

    Nunca lança no caminho feliz. A fachada pública é preservada: os prompts seguem
    chamando `identidade_do_mascote().nome`. Os parâmetros keyword `db_path`/
    `channel_id` (e o posicional `editorial_root`) existem só para isolar testes do
    `instance/` real — espelham `instance_root` de `services/channels.py`.
    """
    db, cid = _resolver_db_e_canal(db_path, channel_id)

    linha = settings_store.ler_mascote(db, cid)
    if linha is not None:
        return _mascote_de(str(linha.get("nome") or "").strip())

    # Sem linha no banco → semeia a partir do yaml legado (idempotente) e devolve.
    nome = _nome_do_yaml(editorial_root)
    settings_store.gravar_mascote(db, cid, {"nome": nome})
    return _mascote_de(nome)


def definir_nome_do_mascote(
    nome: str,
    *,
    editorial_root: Path | None = None,
    db_path: Path | None = None,
    channel_id: str | None = None,
) -> Mascote:
    """Define o nome do mascote do canal ATIVO (edição pela UI de Configurações).

    Grava no BANCO (fonte da verdade) e ESPELHA no `editorial/mascote.yaml`,
    preservando as demais chaves do arquivo (ex.: `config_version`) — o mesmo
    banco+espelho de `channels.editar_identidade`. Devolve a identidade resultante
    (neutra quando o nome informado é vazio).
    """
    nome = str(nome or "").strip()
    db, cid = _resolver_db_e_canal(db_path, channel_id)
    settings_store.gravar_mascote(db, cid, {"nome": nome})
    _espelhar_no_yaml(nome, editorial_root)
    return _mascote_de(nome)


def _espelhar_no_yaml(nome: str, editorial_root: Path | None) -> None:
    """Escreve `nome` no `editorial/mascote.yaml`, preservando o resto do arquivo."""
    raiz = Path(editorial_root) if editorial_root is not None else editorial_dir()
    caminho = raiz / _MASCOTE_YAML
    dados = _ler_yaml(caminho)
    dados["nome"] = nome
    raiz.mkdir(parents=True, exist_ok=True)
    caminho.write_text(
        yaml.safe_dump(dados, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
