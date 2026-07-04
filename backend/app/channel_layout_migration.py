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

_APP_DIR = Path(__file__).resolve().parent
# parent = app, parent.parent = backend, parent.parent.parent = raiz do repo.
_BACKEND_ROOT = _APP_DIR.parent
_REPO_ROOT = _BACKEND_ROOT.parent

# Nomes reservados que pertencem ao layout multi-canal (não são itens "planos").
_DIR_CANAIS = "channels"
_PONTEIRO_ATIVO = "active-channel"
_RESERVADOS = frozenset({_DIR_CANAIS, _PONTEIRO_ATIVO})

_ID_FALLBACK = "default"

# Arquivos sem valor de dado (placeholders versionados): um destino que só os
# contém é tratado como vazio na consolidação — pode ser substituído sem perda.
_PLACEHOLDERS = frozenset({".gitkeep"})


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
    NÃO move os dados operacionais pesados (`backend/projetos/`, ~70GB): isso fica
    a cargo de `consolidar_dados_do_canal`, rodado OFFLINE (ver docstring lá),
    porque no boot do stack de dev os render workers travam `backend/projetos` e
    um rename de 70GB falharia. Esta função roda no boot e é leve/idempotente.

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
        from app.channel_assets_sync import sincronizar_assets_servidos

        sincronizar_assets_servidos()
    except Exception as e:  # noqa: BLE001 — boot resiliente a I/O de asset
        print(f"[Multi-canal] Falha ao materializar assets do canal ativo: {e}")


def consolidar_dados_do_canal(
    instance_root: Path | None = None,
    exemplo_dir: Path | None = None,
    backend_root: Path | None = None,
) -> ResultadoMigracao:
    """Garante o layout e MOVE os dados operacionais legados para o canal ativo.

    Move `backend/projetos/` (banco `projetos.db` + mídias) e
    `backend/app/canal_config.py` para `instance/channels/<ativo>/`, via rename
    same-volume (atômico, sem copiar ~70GB). Idempotente; defensivo (aborta antes
    de arriscar perda); aborta se origem/destino estão em volumes diferentes.

    RODE OFFLINE — com TODOS os serviços parados (backend, native_worker, Remotion):
    os render workers observam uma fila DENTRO de `backend/projetos`, travando a
    pasta, e o rename falharia com "Acesso negado" (WinError 5). Faça BACKUP de
    `instance/` e `backend/projetos/` antes.

    `backend_root` é obrigatório quando `instance_root` é informado (testes), para
    nunca mover os dados REAIS para dentro de uma instância de teste.

    Returns:
        ResultadoMigracao do layout; após ela, os dados vivem sob `canal_root`.
    """
    if instance_root is not None and backend_root is None:
        raise ValueError(
            "consolidar_dados_do_canal: informe backend_root explícito quando passar "
            "instance_root — proteção contra mover os dados reais para uma fixture."
        )
    resultado = garantir_layout_de_canais(instance_root, exemplo_dir)
    backend_root = Path(backend_root) if backend_root else _BACKEND_ROOT
    _consolidar_dados_operacionais(resultado.canal_root, backend_root)
    return resultado


def consolidar_assets_do_canal(
    instance_root: Path | None = None,
    exemplo_dir: Path | None = None,
    repo_root: Path | None = None,
) -> ResultadoMigracao:
    """Garante o layout e MOVE os ASSETS VISUAIS legados para `<canal>/assets/` (D-156).

    Move para `instance/channels/<ativo>/assets/`:
      - `video-renderer/public/mascote/`  -> `assets/mascote`   (superset de 51 poses)
      - `frontend/public/mascote/`        -> reconciliado em `assets/mascote` (subset)
      - `backend/assets/youtube_bg/`   -> `assets/youtube_bg`
      - `backend/assets/retratos/`     -> `assets/retratos`
      - `video-renderer/theme.config.json` -> `assets/theme.config.json`

    E o CATALOGO de poses do mascote (D-179), para a raiz do canal (nao em assets/):
      - `backend/app/data/mascote_poses.json` -> `mascot/poses.json`
    que e o override que `mascot_catalog._resolver_caminho` le como `mascot_dir()/poses.json`.

    Os nomes legados (`public/sapo/`, `sapo_poses.json`) continuam aceitos como
    origem (E-011) para não regredir instalações anteriores à genericização.

    Cada move é um RENAME same-volume (atômico, sem copiar): idempotente (origem
    ausente = no-op), defensivo (aborta antes de sobrescrever dados reais), e
    aborta se origem/destino estão em volumes diferentes. NÃO move os caches
    regeneráveis do palco (`projetos/_palco_cache`) — esses já seguem o canal pela
    consolidação de dados (D-155).

    RODE OFFLINE — com os serviços parados — e com BACKUP de `instance/` e dos
    diretórios de origem. `repo_root` é obrigatório quando `instance_root` é
    informado (testes), para nunca mover os assets REAIS para uma fixture.

    Após mover, materialize de volta nos diretórios servidos com
    `channel_assets_sync.sincronizar_assets_servidos()`.
    """
    if instance_root is not None and repo_root is None:
        raise ValueError(
            "consolidar_assets_do_canal: informe repo_root explícito quando passar "
            "instance_root — proteção contra mover os assets reais para uma fixture."
        )
    resultado = garantir_layout_de_canais(instance_root, exemplo_dir)
    repo_root = Path(repo_root) if repo_root else _REPO_ROOT
    _consolidar_assets_visuais(resultado.canal_root, repo_root)
    return resultado


def _consolidar_assets_visuais(canal_root: Path, repo_root: Path) -> None:
    """Traz mascote, fundos, retratos e paleta legados para `<canal>/assets/`."""
    assets_dst = canal_root / "assets"
    _mover_para_canal(repo_root / "backend" / "assets" / "youtube_bg", assets_dst / "youtube_bg")
    _mover_para_canal(repo_root / "backend" / "assets" / "retratos", assets_dst / "retratos")
    _mover_para_canal(
        repo_root / "video-renderer" / "theme.config.json", assets_dst / "theme.config.json"
    )
    _consolidar_mascote(
        video_mascote=_dir_mascote_versionado(repo_root / "video-renderer" / "public"),
        frontend_mascote=_dir_mascote_versionado(repo_root / "frontend" / "public"),
        destino=assets_dst / "mascote",
    )
    # Catalogo de poses (D-179): vira o override da instancia que o backend le em
    # `mascot_dir()/poses.json`. Mesmo move same-volume, idempotente e defensivo.
    _mover_para_canal(
        _catalogo_versionado(repo_root / "backend" / "app" / "data"),
        canal_root / "mascot" / "poses.json",
    )


def _dir_mascote_versionado(public_dir: Path) -> Path:
    """`<public>/mascote` (canônico) ou `<public>/sapo` (legado) — o que existir.

    Devolve o canônico quando nenhum existir (o move é no-op sobre origem ausente).
    """
    for nome in ("mascote", "sapo"):
        candidato = public_dir / nome
        if candidato.exists():
            return candidato
    return public_dir / "mascote"


def _catalogo_versionado(data_dir: Path) -> Path:
    """`mascote_poses.json` (canônico) ou `sapo_poses.json` (legado) — o que existir."""
    novo = data_dir / "mascote_poses.json"
    return novo if novo.exists() else data_dir / "sapo_poses.json"


def _consolidar_mascote(video_mascote: Path, frontend_mascote: Path, destino: Path) -> None:
    """Funde os dois diretórios de mascote num único `assets/mascote`, sem perda.

    O `video-renderer/public/mascote` (51 poses) é o SUPERSET — vira `assets/mascote`.
    O `frontend/public/mascote` (34 poses) é subconjunto: cada arquivo idêntico já no
    destino é redundante (será re-materializado pelo sync) e é descartado; um
    arquivo ausente no destino é TRAZIDO; um com mesmo nome mas conteúdo divergente
    ABORTA (ambiguidade — não escolhemos qual versão perder).
    """
    _mover_para_canal(video_mascote, destino)
    if not frontend_mascote.exists():
        return
    if not destino.exists():
        # Não havia superset (só o subset existia) — promove o subset a canônico.
        _mover_para_canal(frontend_mascote, destino)
        return
    _exigir_mesmo_volume(frontend_mascote, destino)
    for arquivo in frontend_mascote.iterdir():
        if not arquivo.is_file():
            continue
        alvo = destino / arquivo.name
        if alvo.exists():
            if alvo.stat().st_size != arquivo.stat().st_size:
                raise LayoutMigrationError(
                    f"Conflito ao fundir mascote: '{arquivo.name}' difere entre "
                    f"{frontend_mascote} e {destino}. Resolva manualmente para não perder dados."
                )
            continue  # redundante: idêntico ao superset
        os.rename(arquivo, alvo)  # único no subset — traz para o canônico
    shutil.rmtree(frontend_mascote)


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
# Consolidação dos dados operacionais (D-155)
# --------------------------------------------------------------------------- #


def _consolidar_dados_operacionais(canal_root: Path, backend_root: Path) -> None:
    """Traz `backend/projetos/` e `backend/app/canal_config.py` para o canal ativo.

    O banco (`projetos.db`), as mídias (~70GB) e o `canal_config.py` deixam de
    viver fora da instância e passam a pertencer ao canal — fechando o isolamento
    multi-canal. MOVE same-volume (rename atômico, sem copiar); idempotente (se já
    consolidado, no-op); defensivo (aborta antes de arriscar perda).
    """
    _mover_para_canal(backend_root / "projetos", canal_root / "projetos")
    _mover_para_canal(backend_root / "app" / "canal_config.py", canal_root / "canal_config.py")


def _mover_para_canal(origem: Path, destino: Path) -> None:
    """Move `origem` para `destino` no MESMO volume, sem sobrescrever dados.

    - Origem ausente → no-op (idempotente: já consolidado ou nunca existiu).
    - Destino com dados reais → aborta (nunca sobrescreve).
    - Destino só com placeholders (`.gitkeep`) → trata como vazio: descarta-os e
      move a origem inteira por cima.
    - Volumes diferentes → aborta (mover ~70GB entre volumes não é atômico).
    """
    if not origem.exists():
        return

    sobras = _sobras_reais(destino)
    if sobras:
        raise LayoutMigrationError(
            f"Consolidação abortada: destino '{destino}' já contém dados "
            f"({sorted(p.name for p in sobras)}) e a origem '{origem}' também existe. "
            "Resolva manualmente para não arriscar perda de dados."
        )

    _exigir_mesmo_volume(origem, destino)

    if destino.exists():
        # Só placeholders aqui (sobras == []): seguro descartar antes de mover.
        _remover_placeholder(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    os.rename(origem, destino)


def _sobras_reais(destino: Path) -> list[Path]:
    """Itens com VALOR de dado no destino (ignora placeholders); [] se ausente/vazio."""
    if not destino.exists():
        return []
    if destino.is_dir():
        return [p for p in destino.iterdir() if p.name not in _PLACEHOLDERS]
    return [destino]  # destino é um arquivo já existente → conflito real


def _remover_placeholder(destino: Path) -> None:
    """Remove um destino que só contém placeholders (ou é placeholder)."""
    if destino.is_dir():
        shutil.rmtree(destino)
    else:
        destino.unlink()


def _exigir_mesmo_volume(origem: Path, destino: Path) -> None:
    """Aborta se origem e destino não estão no mesmo volume (rename não seria atômico)."""
    if _id_volume(origem) != _id_volume(destino):
        raise LayoutMigrationError(
            f"Consolidação abortada: origem '{origem}' e destino '{destino}' estão em "
            "volumes diferentes. Mover os dados operacionais (banco + mídias) entre "
            "volumes não é atômico nem seguro — faça a cópia manualmente e remova a "
            "origem depois de conferir."
        )


def _id_volume(caminho: Path) -> int:
    """Id do volume (st_dev) do ancestral existente mais próximo de `caminho`."""
    return _ancestral_existente(caminho).stat().st_dev


def _ancestral_existente(caminho: Path) -> Path:
    """Primeiro caminho existente subindo a árvore (o destino pode ainda não existir)."""
    for candidato in (caminho, *caminho.parents):
        if candidato.exists():
            return candidato
    return caminho


# --------------------------------------------------------------------------- #
# Auxiliares puros
# --------------------------------------------------------------------------- #


def _itens_planos(instance_root: Path) -> list[Path]:
    """Itens no nível raiz da instância que não pertencem ao layout multi-canal."""
    if not instance_root.is_dir():
        return []
    return [p for p in instance_root.iterdir() if p.name not in _RESERVADOS]


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
