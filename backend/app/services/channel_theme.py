"""Seleção e materialização do TEMA de render por canal (D-174).

Costura a biblioteca versionada (`domain/theme_library.py`) ao armazenamento por
canal (`settings_store`, `instance/settings.db`) e ao mecanismo de serving do
Remotion (o `theme.config.json` que `theme-v2.ts` importa em build).

FLUXO:
  - O canal SELECIONA um tema nomeado → grava o `tema_id` no banco e materializa
    imediatamente o `video-renderer/theme.config.json` com a paleta COMPLETA do tema.
    O `theme.config.json` está no fingerprint do bundle (via
    `pipeline_render_helpers._assets_servidos_do_bundle`), então o próximo render
    reconstrói o bundle com a nova paleta — sem restart.
  - SEM seleção (linha ausente / `tema_id` vazio) a materialização é NO-OP: o
    comportamento legado (asset do canal ou default versionado, copiado por
    `channel_assets_sync.sincronizar_assets_servidos`) prevalece e o render fica
    IDÊNTICO ao de antes do D-174. A seleção é opt-in.

PRECEDÊNCIA (decisão do dono, D-174): o preset tipográfico do tema é o DEFAULT do
canal; um projeto que escolheu um preset explícito (`Projeto.fonte_preset != 'atual'`)
ainda vence — ver `pipeline_render_config.ProjetoRenderConfig`.

A paleta de IDENTIDADE do canal (3 cores, D-191 `PaletaModel`) é OUTRA coisa
(branding/UI); NÃO se confunde com a paleta de render (17 cores) daqui.
"""

from __future__ import annotations

import json
from pathlib import Path

from app import channel_paths
from app.domain import theme_library
from app.domain.theme_library import Tema
from app.services import settings_store

# Destino servido que `theme-v2.ts` importa em build (mesmo alvo de
# `channel_assets_sync._RENDERER_THEME`).
_REPO_ROOT = Path(__file__).resolve().parents[3]
_RENDERER_THEME = _REPO_ROOT / "video-renderer" / "theme.config.json"


class TemaInvalido(ValueError):
    """`tema_id` não existe na biblioteca versionada."""


def _resolver_db(db_path: Path | None) -> Path:
    return db_path if db_path is not None else channel_paths.settings_db_path()


def _resolver_canal(channel_id: str | None) -> str:
    return channel_id if channel_id is not None else channel_paths.active_channel_root().name


def tema_selecionado_id(
    *, db_path: Path | None = None, channel_id: str | None = None
) -> str | None:
    """Id do tema que o canal selecionou, ou `None` se nunca selecionou.

    Defensivo: se o banco de settings ainda não existe, devolve `None` sem criá-lo
    (evita efeito colateral em contextos que só querem ler a seleção)."""
    banco = _resolver_db(db_path)
    if not banco.exists():
        return None
    return settings_store.ler_tema(banco, _resolver_canal(channel_id))


def tema_do_canal(*, db_path: Path | None = None, channel_id: str | None = None) -> Tema:
    """Tema resolvido do canal, caindo no default (`atual`) quando não há seleção."""
    return theme_library.tema_ou_default(
        tema_selecionado_id(db_path=db_path, channel_id=channel_id)
    )


def preset_padrao_do_canal(*, db_path: Path | None = None, channel_id: str | None = None) -> str:
    """Preset tipográfico DEFAULT do canal = o do tema selecionado (`atual` se nenhum)."""
    return tema_do_canal(db_path=db_path, channel_id=channel_id).fonte_preset


def selecionar_tema(
    tema_id: str,
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    renderer_theme: Path | None = None,
) -> Tema:
    """Seleciona `tema_id` para o canal: valida, grava no banco e materializa.

    Erro `TemaInvalido` se o id não existir na biblioteca. Após gravar, escreve o
    `theme.config.json` para o próximo render já pegar a nova paleta.
    """
    tema = theme_library.obter_tema(tema_id)
    if tema is None:
        raise TemaInvalido(f"tema desconhecido: {tema_id!r}")
    canal = _resolver_canal(channel_id)
    settings_store.gravar_tema(_resolver_db(db_path), canal, tema.id)
    # Só o canal ATIVO serve o `theme.config.json` do render — materializar a paleta
    # de um canal inativo sobrescreveria o render do canal ativo. Selecionar para um
    # canal inativo grava a escolha; ela materializa quando aquele canal virar ativo
    # (no boot, via `channel_layout_migration._materializar_assets_servidos`).
    if canal == channel_paths.active_channel_root().name:
        materializar_tema_do_canal(
            db_path=db_path, channel_id=channel_id, renderer_theme=renderer_theme
        )
    return tema


def materializar_tema_do_canal(
    *,
    db_path: Path | None = None,
    channel_id: str | None = None,
    renderer_theme: Path | None = None,
) -> Path | None:
    """Escreve o `theme.config.json` com a paleta do tema SELECIONADO do canal.

    NO-OP (retorna `None`) quando o canal não selecionou tema — nesse caso o asset
    do canal / default versionado (materializado por `channel_assets_sync`) continua
    valendo e o render fica idêntico. Deve rodar DEPOIS de
    `sincronizar_assets_servidos` para sobrepor a cópia do asset quando há seleção.

    Retorna o path escrito, ou `None` no NO-OP.
    """
    tema_id = tema_selecionado_id(db_path=db_path, channel_id=channel_id)
    if tema_id is None:
        return None
    tema = theme_library.tema_ou_default(tema_id)
    destino = renderer_theme if renderer_theme is not None else _RENDERER_THEME
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(
        json.dumps({"palette": tema.paleta}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return destino
