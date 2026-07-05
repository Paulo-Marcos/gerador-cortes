"""
Registry de canais (épico Multi-canal — Opção X).

Este serviço gerencia os canais que vivem em `instance/channels/<id>/`: listar
quais existem (e qual é o ATIVO), criar um canal novo a partir do template
versionado (`examples/instance.example/`), selecionar o ativo (grava o ponteiro
`instance/active-channel`) e editar a identidade básica (`channel.yaml`).

DECISÃO DE DESIGN — seleção exige restart:
    O banco (`database.py`) é aberto no startup a partir do canal ativo
    (`channel_paths.active_channel_root()`). Trocar o canal ativo em runtime
    trocaria o banco sob os pés da aplicação. Para um app desktop, a forma
    robusta é o `selecionar` apenas GRAVAR o ponteiro e a troca efetivar no
    PRÓXIMO restart — por isso `selecionar_canal` devolve `requer_restart=True`.
    NÃO fazemos hot-swap do engine.

Camada: `services/` — orquestra I/O de filesystem (template, ponteiro, YAML).
As funções aceitam `instance_root`/`exemplo_dir` opcionais para testes; em
produção resolvem a raiz real do repositório.
"""

from __future__ import annotations

import logging
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

import yaml
from app.channel_assets_sync import garantir_mascote_materializado
from app.channel_paths import active_channel_root
from app.services import settings_store

logger = logging.getLogger(__name__)

_APP_DIR = Path(__file__).resolve().parent.parent
# app -> backend -> raiz do repo (mesma ancoragem de channel_paths).
_REPO_ROOT = _APP_DIR.parent.parent

_DIR_CANAIS = "channels"
_PONTEIRO_ATIVO = "active-channel"
_CHANNEL_YAML = "channel.yaml"

# Id de canal = nome de pasta: começa com letra/dígito e usa só [a-z0-9-].
_RE_ID_CANAL = re.compile(r"^[a-z0-9][a-z0-9-]*$")


class ChannelError(RuntimeError):
    """Erro de domínio do registry de canais (base)."""


class IdCanalInvalido(ChannelError):
    """O id informado não é um slug de canal válido."""


class CanalNaoEncontrado(ChannelError):
    """Não existe canal com o id informado."""


class CanalJaExiste(ChannelError):
    """Já existe um canal com o id informado."""


@dataclass(frozen=True)
class Paleta:
    primaria: str = ""
    secundaria: str = ""
    acento: str = ""


@dataclass(frozen=True)
class Canal:
    """Visão de um canal para a API (identidade + se é o ativo)."""

    id: str
    handle: str
    nome: str
    credito: str
    paleta: Paleta
    ativo: bool
    # Canal-FONTE das lives (handle/id/username do YouTube de onde o ranking baixa).
    youtube_channel_id: str = ""


@dataclass(frozen=True)
class ResultadoSelecao:
    """Resultado de selecionar o canal ativo.

    `requer_restart` é sempre True: a troca de banco/assets só efetiva no
    próximo boot (ver docstring do módulo).
    """

    canal_id: str
    requer_restart: bool


def _instance_root(instance_root: Path | None) -> Path:
    return Path(instance_root) if instance_root else _REPO_ROOT / "instance"


def _exemplo_dir(exemplo_dir: Path | None) -> Path:
    return Path(exemplo_dir) if exemplo_dir else _REPO_ROOT / "examples" / "instance.example"


def _canais_dir(instance_root: Path) -> Path:
    return instance_root / _DIR_CANAIS


def _ler_canal_ativo(instance_root: Path) -> str:
    try:
        return (instance_root / _PONTEIRO_ATIVO).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _escrever_canal_ativo(instance_root: Path, canal_id: str) -> None:
    ponteiro = instance_root / _PONTEIRO_ATIVO
    ponteiro.parent.mkdir(parents=True, exist_ok=True)
    ponteiro.write_text(canal_id + "\n", encoding="utf-8")


def _ler_yaml(channel_yaml: Path) -> dict:
    try:
        dados = yaml.safe_load(channel_yaml.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return {}
    return dados if isinstance(dados, dict) else {}


def _db_path(instance_root: Path) -> Path:
    """Banco de settings desta instância (`<instance_root>/settings.db`, D-191)."""
    return instance_root / "settings.db"


def _instance_root_do_ativo() -> Path:
    """Raiz da instância derivada do canal ATIVO (para achar o `settings.db`).

    `active_channel_root()` devolve `instance/channels/<id>` no layout normal (sobe
    2 níveis até `instance/`) ou a própria `instance/` no layout legado.
    """
    raiz = active_channel_root()
    if raiz.parent.name == _DIR_CANAIS:
        return raiz.parent.parent
    return raiz


def _flat_do_yaml(channel_yaml: Path) -> dict:
    """Lê o `channel.yaml` e achata nos campos de identidade do `settings_store`."""
    dados = _ler_yaml(channel_yaml)
    paleta = dados.get("paleta")
    if not isinstance(paleta, dict):
        paleta = {}
    return {
        "handle": str(dados.get("handle") or ""),
        "nome": str(dados.get("nome") or ""),
        "credito": str(dados.get("credito") or ""),
        "youtube_channel_id": str(dados.get("youtube_channel_id") or ""),
        "paleta_primaria": str(paleta.get("primaria") or ""),
        "paleta_secundaria": str(paleta.get("secundaria") or ""),
        "paleta_acento": str(paleta.get("acento") or ""),
    }


def _montar_canal(canal_id: str, channel_yaml: Path, ativo: bool, db_path: Path) -> Canal:
    """Compõe o `Canal` a partir do banco (fonte da verdade), com fallback ao YAML.

    Fallback cobre canais ainda não migrados (sem linha no banco): a identidade é
    lida do `channel.yaml`, preservando o comportamento pré-D-191.
    """
    flat = settings_store.ler_identidade(db_path, canal_id)
    if flat is None:
        flat = _flat_do_yaml(channel_yaml)
    return Canal(
        id=canal_id,
        handle=flat["handle"],
        nome=flat["nome"],
        credito=flat["credito"],
        paleta=Paleta(
            primaria=flat["paleta_primaria"],
            secundaria=flat["paleta_secundaria"],
            acento=flat["paleta_acento"],
        ),
        ativo=ativo,
        youtube_channel_id=flat["youtube_channel_id"],
    )


def _exigir_id_valido(canal_id: str) -> str:
    canal_id = (canal_id or "").strip()
    if not _RE_ID_CANAL.match(canal_id):
        raise IdCanalInvalido(
            f"Id de canal inválido: {canal_id!r}. Use apenas letras minúsculas, "
            "dígitos e hífen, começando por letra ou dígito (ex.: 'meu-canal')."
        )
    return canal_id


def _exigir_canal(instance_root: Path, canal_id: str) -> Path:
    canal_root = _canais_dir(instance_root) / canal_id
    if not canal_root.is_dir():
        raise CanalNaoEncontrado(f"Canal não encontrado: {canal_id!r}.")
    return canal_root


def migrar_identidades_para_banco(instance_root: Path | None = None) -> int:
    """Semeia no banco a identidade dos canais que ainda só existem em `channel.yaml`.

    Migração automática do D-191 rodada no boot: leva para o `settings_store` a
    config de identidade já existente (inclusive a da PROD) sem intervenção manual.
    IDEMPOTENTE — só grava um canal que ainda não tem linha, e nunca semeia um YAML
    todo-vazio. Retorna quantos canais foram semeados.
    """
    root = _instance_root(instance_root)
    canais_dir = _canais_dir(root)
    if not canais_dir.is_dir():
        return 0
    db_path = _db_path(root)
    semeados = 0
    for p in sorted(canais_dir.iterdir(), key=lambda p: p.name):
        if not p.is_dir() or settings_store.ler_identidade(db_path, p.name) is not None:
            continue
        flat = _flat_do_yaml(p / _CHANNEL_YAML)
        if any(flat.values()):
            settings_store.gravar_identidade(db_path, p.name, flat)
            semeados += 1
    return semeados


def listar_canais(instance_root: Path | None = None) -> list[Canal]:
    """Lista os canais em `instance/channels/`, marcando o ativo.

    Ordenado por id para uma resposta estável. Se a pasta `channels/` ainda não
    existir (layout pré-migração), devolve lista vazia — o boot a materializa.
    """
    root = _instance_root(instance_root)
    canais_dir = _canais_dir(root)
    if not canais_dir.is_dir():
        return []
    ativo = _ler_canal_ativo(root)
    db_path = _db_path(root)
    canais = [
        _montar_canal(p.name, p / _CHANNEL_YAML, ativo=(p.name == ativo), db_path=db_path)
        for p in sorted(canais_dir.iterdir(), key=lambda p: p.name)
        if p.is_dir()
    ]
    return canais


def identidade_do_canal_ativo() -> Canal:
    """Identidade do canal ATIVO lida do `channel.yaml` dele (fonte única).

    Resolve a raiz do canal ativo via `channel_paths.active_channel_root()` e
    devolve `handle`, `nome`, `credito` e `youtube_channel_id`. Fallback seguro:
    se o canal/yaml não existir ou o campo estiver vazio, o campo vem como string
    vazia — nunca lança no caminho feliz do boot. Este é o accessor de runtime
    que os consumidores usarão no lugar de `settings.canal_*` (migração futura).
    """
    canal_root = active_channel_root()
    db_path = _db_path(_instance_root_do_ativo())
    return _montar_canal(canal_root.name, canal_root / _CHANNEL_YAML, ativo=True, db_path=db_path)


def criar_canal(
    canal_id: str,
    identidade: dict | None = None,
    instance_root: Path | None = None,
    exemplo_dir: Path | None = None,
) -> Canal:
    """Cria um canal novo a partir do template versionado, sem ativá-lo.

    Copia `examples/instance.example/` para `channels/<id>/` e, se `identidade`
    for informada, aplica os campos no `channel.yaml`. NÃO mexe no ponteiro de
    canal ativo: criar não troca o canal corrente (isso é `selecionar_canal`).
    """
    canal_id = _exigir_id_valido(canal_id)
    root = _instance_root(instance_root)
    semente = _exemplo_dir(exemplo_dir)
    if not semente.is_dir():
        raise ChannelError(f"Template de canal ausente: {semente}.")

    destino = _canais_dir(root) / canal_id
    if destino.exists():
        raise CanalJaExiste(f"Canal já existe: {canal_id!r}.")

    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(semente, destino)
    # README do template não pertence à instância de um canal real.
    readme = destino / "README.md"
    if readme.is_file():
        readme.unlink()

    if identidade:
        _aplicar_identidade(destino / _CHANNEL_YAML, identidade)

    # Semeia o banco (fonte da verdade) a partir do YAML já mesclado.
    db_path = _db_path(root)
    settings_store.gravar_identidade(db_path, canal_id, _flat_do_yaml(destino / _CHANNEL_YAML))

    ativo = _ler_canal_ativo(root)
    return _montar_canal(canal_id, destino / _CHANNEL_YAML, ativo=(canal_id == ativo), db_path=db_path)


def selecionar_canal(canal_id: str, instance_root: Path | None = None) -> ResultadoSelecao:
    """Marca `canal_id` como ativo gravando o ponteiro `active-channel`.

    A troca efetiva (banco/assets) só ocorre no PRÓXIMO restart — por isso
    devolve `requer_restart=True`. Ver docstring do módulo.
    """
    root = _instance_root(instance_root)
    _exigir_canal(root, canal_id)
    _escrever_canal_ativo(root, canal_id)
    _materializar_mascote_do_ativo()
    return ResultadoSelecao(canal_id=canal_id, requer_restart=True)


def _materializar_mascote_do_ativo() -> None:
    """Espelha o mascote do canal recém-marcado como ativo nos `public/mascote` (D-171).

    Chamado logo após gravar o ponteiro `active-channel`: em produção
    `garantir_mascote_materializado()` resolve o canal ATIVO (o que acabamos de
    escrever) e materializa seu mascote, deixando o próximo render/preview já com o
    mascote certo. Best-effort — a seleção não pode falhar por um erro de cópia; e
    NO-OP no layout legado (o move offline ainda não rodou).
    """
    try:
        garantir_mascote_materializado()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Falha ao materializar mascote ao selecionar canal: %s", exc)


def editar_identidade(canal_id: str, identidade: dict, instance_root: Path | None = None) -> Canal:
    """Edita a identidade básica (`channel.yaml`) de um canal existente.

    Só os campos presentes em `identidade` são alterados (merge raso; `paleta`
    funde campo a campo). Devolve o canal já com os valores atualizados.
    """
    root = _instance_root(instance_root)
    canal_root = _exigir_canal(root, canal_id)
    channel_yaml = canal_root / _CHANNEL_YAML
    _aplicar_identidade(channel_yaml, identidade)  # merge + espelho no YAML
    # Banco (fonte da verdade) = identidade completa já mesclada.
    db_path = _db_path(root)
    settings_store.gravar_identidade(db_path, canal_id, _flat_do_yaml(channel_yaml))
    ativo = _ler_canal_ativo(root)
    return _montar_canal(canal_id, channel_yaml, ativo=(canal_id == ativo), db_path=db_path)


# Campos de identidade aceitos no PATCH/criação (escalares de topo).
_CAMPOS_IDENTIDADE = ("handle", "nome", "credito", "youtube_channel_id")
_CAMPOS_PALETA = ("primaria", "secundaria", "acento")


def _aplicar_identidade(channel_yaml: Path, identidade: dict) -> None:
    """Funde `identidade` no `channel.yaml`, preservando o resto (ex.: config_version)."""
    dados = _ler_yaml(channel_yaml)

    for campo in _CAMPOS_IDENTIDADE:
        if identidade.get(campo) is not None:
            dados[campo] = str(identidade[campo])

    paleta_in = identidade.get("paleta")
    if isinstance(paleta_in, dict):
        paleta = dados.get("paleta")
        if not isinstance(paleta, dict):
            paleta = {}
        for campo in _CAMPOS_PALETA:
            if paleta_in.get(campo) is not None:
                paleta[campo] = str(paleta_in[campo])
        dados["paleta"] = paleta

    channel_yaml.parent.mkdir(parents=True, exist_ok=True)
    channel_yaml.write_text(
        yaml.safe_dump(dados, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
