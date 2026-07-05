"""Leitura tolerante de campos do `Corte` para o pipeline de render.

Extraído de `pipeline_render` (E-006). Localiza o vídeo bruto, extrai cenas e
resolve layout/duração aceitando tanto o ORM `Corte` quanto um `dict`. Funções
puras (só dependem do argumento + filesystem para localizar o clip).
"""

import json
import logging
from pathlib import Path

from app.channel_paths import resolver_do_projeto
from app.domain.youtube_layout import normalizar_layout_youtube
from app.models import Corte

logger = logging.getLogger(__name__)


def _find_clip_raw(corte_dir: Path) -> Path | None:
    """Localiza o vídeo bruto na pasta do corte.

    Robusto a nomes com timestamp (``clip_raw_<ms>.mkv``, produzidos pelo
    "Gerar Bruto") e à relocação da pasta — depende só do conteúdo do diretório,
    nunca de um caminho absoluto stale no banco. Ordem de preferência:

    1. Nomes canônicos (``clip_raw.mkv/.mp4``, ``clip_raw_base.mkv/.mp4``).
    2. Qualquer ``clip_raw*.mkv/.mp4`` (exceto backups), escolhendo o mais
       recente por mtime — desempate determinístico por nome.
    3. Backups ``clip_raw_backup_com_silencios.*`` como último recurso.
    """
    for name in (
        "clip_raw.mkv",
        "clip_raw.mp4",
        "clip_raw_base.mkv",
        "clip_raw_base.mp4",
    ):
        p = corte_dir / name
        if p.exists():
            return p

    def _is_backup(p: Path) -> bool:
        return "_backup_com_silencios" in p.name

    candidatos = [
        p for ext in ("mkv", "mp4") for p in corte_dir.glob(f"clip_raw*.{ext}") if p.is_file()
    ]
    nao_backup = [p for p in candidatos if not _is_backup(p)]
    if nao_backup:
        return max(nao_backup, key=lambda p: (p.stat().st_mtime, p.name))

    backups = [p for p in candidatos if _is_backup(p)]
    if backups:
        return max(backups, key=lambda p: (p.stat().st_mtime, p.name))

    return None


def _find_registered_clip_raw(corte: Corte) -> Path | None:
    if not corte.arquivo_clip_path:
        return None

    # D-158: reancora pelo canal ativo — aceita valor relativo (novo padrão) e
    # absoluto/Docker legado, ambos resolvem para a raiz de dados vigente.
    p = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
    return p if p.exists() else None


def _extrair_cenas(corte: Corte) -> list[dict]:
    """Extrai a lista de cenas do campo cenas_remotion do banco."""
    raw = _campo_corte(corte, "cenas_remotion")
    if not raw:
        return []

    data = []

    if isinstance(raw, str):
        try:
            data = json.loads(raw)
        except Exception as e:
            logger.error(f"Erro ao parsear JSON de cenas: {e}")
            return []
    else:
        data = raw

    # Se for um dict com chave 'cenas' (padrão)
    if isinstance(data, dict):
        return data.get("cenas", [])
    # Se for uma lista direta
    if isinstance(data, list):
        return data

    return []


def _layout_youtube_do_corte(
    corte: Corte | dict | None, fallback_layout: str | dict | None = None
) -> dict:
    raw = _campo_corte(corte, "layout_youtube")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw or "{}")
        except Exception as e:
            logger.warning(
                "[Pipeline] layout_youtube invalido no corte %s: %s",
                _campo_corte(corte, "id", ""),
                e,
            )
            raw = {}
    return normalizar_layout_youtube(raw, fallback_layout)


def _duracao_layout_corte(corte: Corte | dict | None) -> float:
    duracao = _numero_corte(_campo_corte(corte, "duracao_clip_seg"), 0.0)
    if duracao > 0:
        return duracao

    inicio = _numero_corte(_campo_corte(corte, "inicio_seg"), 0.0)
    fim = _numero_corte(_campo_corte(corte, "fim_seg"), inicio)
    return max(0.0, fim - inicio)


def _campo_corte(corte: Corte | dict | None, campo: str, default=None):
    if isinstance(corte, dict):
        return corte.get(campo, default)
    return getattr(corte, campo, default)


def _numero_corte(valor, default: float) -> float:
    try:
        return float(valor)
    except (TypeError, ValueError):
        return default
