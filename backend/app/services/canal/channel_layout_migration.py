"""
Migrador de layout de canais (épico Multi-canal — Opção X), executado no boot.

Vira o `instance/` PLANO (single-channel legado) no layout multi-canal
autocontido `instance/channels/<canal>/...` mais um ponteiro de canal ativo
(`instance/active-channel`). É a FUNDAÇÃO que torna copiar o prod LOSSLESS: uma
cópia da instância feita em qualquer ponto se auto-migra no próximo boot,
virando o canal #1.

Invariantes (cobertas pelos testes):

  - IDEMPOTENTE: se já existe `channels/` com um canal ativo válido → NO-OP.
  - LOSSLESS: MOVE (rename) os itens do layout plano para dentro da pasta do
    canal; nunca copia-e-apaga às cegas e nunca sobrescreve. Antes de tocar em
    qualquer item, confere que o destino está livre — senão ABORTA com erro
    claro, sem perder nada.
  - INSTALAÇÃO NOVA: sem nenhum `instance/`, materializa `channels/<default>/`
    a partir de `examples/instance.example/` e marca como ativo.

Este módulo NÃO altera o CONTEÚDO dos arquivos do canal — apenas o lugar deles.
"""

from __future__ import annotations

import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

import yaml

_APP_DIR = Path(__file__).resolve().parents[2]
# parents[2] = app (este arquivo mora em app/services/canal/); app → backend → repo.
_BACKEND_ROOT = _APP_DIR.parent
_REPO_ROOT = _BACKEND_ROOT.parent

# Nomes reservados que pertencem ao layout multi-canal (não são itens "planos").
_DIR_CANAIS = "channels"
_PONTEIRO_ATIVO = "active-channel"
# `settings.db` (D-191) é um artefato GLOBAL de nível de instância (config de
# todos os canais), vive na raiz de `instance/` ao lado do ponteiro de canal ativo.
# NÃO é item de layout plano legado: não deve disparar "layout inconsistente" nem
# ser movido para dentro de um canal. O SQLite em modo WAL cria sidecars ao lado do
# banco (`settings.db-wal`, `settings.db-shm`, `settings.db-journal`): eles pertencem
# ao mesmo artefato global e também são reservados — senão o boot seguinte os veria
# como itens planos órfãos e abortaria com "layout inconsistente".
_BANCO_SETTINGS = "settings.db"
# `llm_calls.db` (D-353): telemetria GLOBAL de chamadas de IA — artefato de nível de
# instância como o `settings.db` (não é por-canal). Vive na raiz de `instance/` e
# NÃO é item de layout plano legado: não deve disparar "layout inconsistente" nem
# ser movido para dentro de um canal.
_BANCO_LLM_CALLS = "llm_calls.db"
_BANCOS_GLOBAIS = frozenset({_BANCO_SETTINGS, _BANCO_LLM_CALLS})
_RESERVADOS = frozenset({_DIR_CANAIS, _PONTEIRO_ATIVO, *_BANCOS_GLOBAIS})


def _eh_reservado(nome: str) -> bool:
    """True para itens do layout multi-canal e para os bancos globais + seus sidecars.

    Um sidecar do SQLite é qualquer `<banco>.db-<sufixo>` (`-wal`, `-shm`,
    `-journal`): pertence ao banco global (`settings.db`/`llm_calls.db`), não ao
    layout plano legado.
    """
    return nome in _RESERVADOS or any(nome.startswith(b + "-") for b in _BANCOS_GLOBAIS)


_ID_FALLBACK = "default"


class LayoutMigrationError(RuntimeError):
    """Layout em estado que não pode ser migrado com segurança (conflito/ambiguidade).

    Levantado em vez de sobrescrever ou apagar dados — boot deve falhar alto.
    """


@dataclass(frozen=True)
class ResultadoMigracao:
    """O que o migrador fez nesta execução.

    `acao` ∈ {"noop", "migrado", "instalado"}.
    """

    acao: str
    canal_id: str
    canal_root: Path


def garantir_layout_de_canais(
    instance_root: Path | None = None,
    exemplo_dir: Path | None = None,
) -> ResultadoMigracao:
    """Garante o layout multi-canal em `instance_root`, migrando se preciso.

    Embrulha o `instance/` plano em `channels/<canal>/` + ponteiro de canal ativo.
    NÃO move os dados operacionais pesados (`backend/projetos/`, ~70GB): esse move
    foi OFFLINE e de uma vez só (D-155), porque no boot os render workers travam
    `backend/projetos` e um rename de 70GB falharia; o comando saiu no D-698,
    depois de a PROD e o DEV já estarem consolidados. Esta função roda no boot e é
    leve/idempotente.

    Args:
        instance_root: raiz da instância. Default: `<repo>/instance`.
        exemplo_dir: pasta-semente para instalação nova.
            Default: `<repo>/examples/instance.example`.

    Returns:
        ResultadoMigracao descrevendo a ação tomada e o canal ativo resultante.
    """
    # Boot real = chamada sem `instance_root` explícito. Só nele materializamos os
    # assets do canal ativo nos diretórios servidos (D-156); testes que passam uma
    # instância-fixture não devem tocar nos dirs reais do repo.
    boot_real = instance_root is None
    instance_root = Path(instance_root) if instance_root else _REPO_ROOT / "instance"
    exemplo_dir = Path(exemplo_dir) if exemplo_dir else _REPO_ROOT / "examples" / "instance.example"

    canais_dir = instance_root / _DIR_CANAIS
    ponteiro = instance_root / _PONTEIRO_ATIVO
    itens_planos = _itens_planos(instance_root)

    if canais_dir.is_dir():
        # Layout multi-canal já presente. Itens planos remanescentes indicam uma
        # migração interrompida/inconsistente — não adivinhamos, abortamos.
        if itens_planos:
            raise LayoutMigrationError(
                f"Layout inconsistente em {instance_root}: já existe '{_DIR_CANAIS}/' "
                f"e ainda há itens no layout plano "
                f"({sorted(p.name for p in itens_planos)}). "
                "Resolva manualmente para não arriscar perda de dados."
            )
        canal_id = _resolver_ou_curar_ponteiro(canais_dir, ponteiro)
        resultado = ResultadoMigracao("noop", canal_id, canais_dir / canal_id)
    elif itens_planos:
        resultado = _migrar_layout_plano(instance_root, canais_dir, ponteiro, itens_planos)
    else:
        resultado = _instalar_novo(canais_dir, ponteiro, exemplo_dir)

    if boot_real:
        _semear_identidade_do_ambiente(resultado.canal_root)
        _semear_mascote_do_ambiente(resultado.canal_root)
        _materializar_assets_servidos()
    return resultado


# Campos de identidade do canal e a env var (legada, global) que os semeia.
# Lidos via os.getenv DIRETO (não via config.settings) porque numa etapa futura
# do épico esses campos saem do config.py e o seed precisa continuar funcionando.
_SEED_IDENTIDADE = {
    "handle": "CANAL_HANDLE",
    "nome": "CANAL_NOME",
    "credito": "CANAL_CREDITO",
    "youtube_channel_id": "YOUTUBE_CHANNEL_ID",
}


def _semear_identidade_do_ambiente(canal_root: Path) -> None:
    """Preenche campos de identidade VAZIOS do canal ativo a partir do ambiente.

    Ponte de compatibilidade enquanto os consumidores ainda leem `settings.canal_*`
    do `.env`: torna o `channel.yaml` a fonte, semeando-o do ambiente no primeiro
    boot. IDEMPOTENTE — só escreve num campo ausente/vazio, nunca sobrescreve valor
    já presente; se a env var não existir/for vazia, deixa como está. Best-effort:
    um erro de I/O não pode derrubar o boot (mesmo contrato dos assets).
    """
    channel_yaml = canal_root / "channel.yaml"
    try:
        dados = _ler_yaml(channel_yaml)
        alterou = False
        for campo, env_var in _SEED_IDENTIDADE.items():
            if str(dados.get(campo) or "").strip():
                continue  # já preenchido — nunca sobrescreve
            valor = (os.getenv(env_var) or "").strip()
            if not valor:
                continue  # env ausente/vazia — deixa como está
            dados[campo] = valor
            alterou = True
        if alterou:
            channel_yaml.write_text(
                yaml.safe_dump(dados, allow_unicode=True, sort_keys=False),
                encoding="utf-8",
            )
    except Exception as e:  # noqa: BLE001 — boot resiliente a I/O de config
        print(f"[Multi-canal] Falha ao semear identidade do canal ativo: {e}")


def _ler_yaml(channel_yaml: Path) -> dict:
    """Lê o `channel.yaml` como dict; {} se ausente ou malformado."""
    try:
        dados = yaml.safe_load(channel_yaml.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return {}
    return dados if isinstance(dados, dict) else {}


# Nome do MASCOTE (identidade editorial usada nos prompts de thumbnail/metadados):
# env var GLOBAL que semeia o `editorial/mascote.yaml` do canal ativo. Mesma ponte
# de compatibilidade do seed de identidade — mantém o nome concreto do mascote FORA
# do código versionado (E-010/E-011), vivendo só no `.env`/`instance/` do canal.
_MASCOTE_ENV = "CANAL_MASCOTE_NOME"
_MASCOTE_YAML_CONFIG_VERSION = 1


def _semear_mascote_do_ambiente(canal_root: Path) -> None:
    """Preenche o `nome` VAZIO do mascote do canal ativo a partir do ambiente.

    Escreve `<canal-ativo>/editorial/mascote.yaml` com o `nome` lido de
    `CANAL_MASCOTE_NOME` quando o arquivo não existe ou tem `nome` vazio — o mesmo
    caminho que `editorial_identity.identidade_do_mascote()` lê em runtime. Espelha
    `_semear_identidade_do_ambiente`: IDEMPOTENTE (nunca sobrescreve um `nome` já
    presente), NO-OP quando a env var está ausente/vazia (canal segue neutro), e
    best-effort (um erro de I/O não pode derrubar o boot).

    POR QUÊ: sem o `mascote.yaml`, os prompts caem no FALLBACK NEUTRO ("mascote")
    e a saída do canal regride — o nome do personagem some das capas/metadados.
    Semeando do ambiente, a PROD basta declarar `CANAL_MASCOTE_NOME=<nome>` no `.env`
    e o arquivo nasce no primeiro boot, sem reintroduzir o nome no código.
    """
    nome = (os.getenv(_MASCOTE_ENV) or "").strip()
    if not nome:
        return  # env ausente/vazia — mantém o que houver (ou o fallback neutro)

    mascote_yaml = canal_root / "editorial" / "mascote.yaml"
    try:
        dados = _ler_yaml(mascote_yaml)
        if str(dados.get("nome") or "").strip():
            return  # já preenchido — nunca sobrescreve
        dados.setdefault("config_version", _MASCOTE_YAML_CONFIG_VERSION)
        dados["nome"] = nome
        mascote_yaml.parent.mkdir(parents=True, exist_ok=True)
        mascote_yaml.write_text(
            yaml.safe_dump(dados, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )
    except Exception as e:  # noqa: BLE001 — boot resiliente a I/O de config
        print(f"[Multi-canal] Falha ao semear nome do mascote do canal ativo: {e}")


def _materializar_assets_servidos() -> None:
    """Espelha os assets do canal ativo nos diretórios servidos (Vite/Remotion).

    Import tardio para não criar ciclo (channel_assets_sync importa channel_paths).
    Best-effort: uma falha de cópia não pode derrubar o boot do backend.
    """
    try:
        from app.infrastructure.channel_assets_sync import sincronizar_assets_servidos

        sincronizar_assets_servidos()
    except Exception as e:  # noqa: BLE001 — boot resiliente a I/O de asset
        print(f"[Multi-canal] Falha ao materializar assets do canal ativo: {e}")

    # D-174: o tema selecionado sobrepõe a paleta copiada acima (quando há seleção).
    # Rodar DEPOIS de sincronizar_assets_servidos é intencional — a ordem garante a
    # precedência do tema nomeado sobre o asset legado do canal.
    try:
        from app.services.channel_theme import materializar_tema_do_canal

        materializar_tema_do_canal()
    except Exception as e:  # noqa: BLE001 — boot resiliente a I/O de settings
        print(f"[Multi-canal] Falha ao materializar tema do canal ativo: {e}")


# --------------------------------------------------------------------------- #
# Passos internos
# --------------------------------------------------------------------------- #


def _migrar_layout_plano(
    instance_root: Path,
    canais_dir: Path,
    ponteiro: Path,
    itens_planos: list[Path],
) -> ResultadoMigracao:
    """Embrulha o `instance/` plano em `channels/<id>/` movendo cada item."""
    canal_id = _derivar_id_canal(instance_root / "channel.yaml")
    destino = canais_dir / canal_id

    # Defensivo: confirma o destino ANTES de mover qualquer coisa.
    if destino.exists() and any(destino.iterdir()):
        raise LayoutMigrationError(
            f"Destino da migração já existe e não está vazio: {destino}. "
            "Abortado para não sobrescrever dados."
        )
    for item in itens_planos:
        if (destino / item.name).exists():
            raise LayoutMigrationError(
                f"Conflito de migração: '{item.name}' já existe em {destino}. "
                "Abortado para não sobrescrever dados."
            )

    destino.mkdir(parents=True, exist_ok=True)
    for item in itens_planos:
        shutil.move(str(item), str(destino / item.name))

    _escrever_ponteiro(ponteiro, canal_id)
    return ResultadoMigracao("migrado", canal_id, destino)


def _instalar_novo(
    canais_dir: Path,
    ponteiro: Path,
    exemplo_dir: Path,
) -> ResultadoMigracao:
    """Instalação nova: cria o canal default a partir do exemplo versionado."""
    if not exemplo_dir.is_dir():
        raise LayoutMigrationError(
            f"Não há instância nem semente: diretório de exemplo ausente: {exemplo_dir}."
        )

    canal_id = _derivar_id_canal(exemplo_dir / "channel.yaml")
    destino = canais_dir / canal_id
    if destino.exists() and any(destino.iterdir()):
        raise LayoutMigrationError(
            f"Destino da instalação já existe e não está vazio: {destino}. "
            "Abortado para não sobrescrever dados."
        )

    destino.mkdir(parents=True, exist_ok=True)
    for item in exemplo_dir.iterdir():
        alvo = destino / item.name
        if item.is_dir():
            shutil.copytree(item, alvo)
        else:
            shutil.copy2(item, alvo)

    _escrever_ponteiro(ponteiro, canal_id)
    return ResultadoMigracao("instalado", canal_id, destino)


def _resolver_ou_curar_ponteiro(canais_dir: Path, ponteiro: Path) -> str:
    """Valida o ponteiro de canal ativo; se ausente e houver 1 canal, cura."""
    canais = sorted(p.name for p in canais_dir.iterdir() if p.is_dir())
    atual = _ler_ponteiro(ponteiro)
    if atual and atual in canais:
        return atual
    if len(canais) == 1:
        _escrever_ponteiro(ponteiro, canais[0])
        return canais[0]
    raise LayoutMigrationError(
        f"'{_DIR_CANAIS}/' existe mas o canal ativo é indefinido "
        f"(ponteiro={atual!r}, canais={canais}). Defina manualmente o ativo."
    )


# --------------------------------------------------------------------------- #
# Auxiliares puros
# --------------------------------------------------------------------------- #


def _itens_planos(instance_root: Path) -> list[Path]:
    """Itens no nível raiz da instância que não pertencem ao layout multi-canal."""
    if not instance_root.is_dir():
        return []
    return [p for p in instance_root.iterdir() if not _eh_reservado(p.name)]


def _derivar_id_canal(channel_yaml: Path) -> str:
    """Deriva o id do canal do `handle` (ou `nome`) em channel.yaml; fallback default."""
    try:
        texto = channel_yaml.read_text(encoding="utf-8")
    except OSError:
        return _ID_FALLBACK
    for campo in ("handle", "nome"):
        slug = _slugify(_ler_campo_yaml(texto, campo))
        if slug:
            return slug
    return _ID_FALLBACK


def _slugify(valor: str) -> str:
    """`@Seu Canal` → `seu-canal`; vazio se não sobrar nada utilizável."""
    valor = valor.strip().lstrip("@").lower()
    return re.sub(r"[^a-z0-9]+", "-", valor).strip("-")


def _ler_campo_yaml(texto: str, campo: str) -> str:
    """Lê `campo: valor` no topo do YAML sem depender de um parser externo.

    Suficiente para `handle`/`nome` (escalares de uma linha) e tolerante a aspas.
    """
    match = re.search(rf"^{campo}\s*:\s*(.+?)\s*$", texto, re.MULTILINE)
    if not match:
        return ""
    return match.group(1).strip().strip('"').strip("'")


def _ler_ponteiro(ponteiro: Path) -> str:
    try:
        return ponteiro.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _escrever_ponteiro(ponteiro: Path, canal_id: str) -> None:
    ponteiro.parent.mkdir(parents=True, exist_ok=True)
    ponteiro.write_text(canal_id + "\n", encoding="utf-8")
