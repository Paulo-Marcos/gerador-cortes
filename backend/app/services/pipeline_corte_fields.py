"""Leitura tolerante de campos do `Corte` para o pipeline de render.

Extraído de `pipeline_render` (E-006). Localiza o vídeo bruto, extrai cenas e
resolve layout/duração aceitando tanto o ORM `Corte` quanto um `dict`. Funções
puras (só dependem do argumento + filesystem para localizar o clip).
"""

import json
import logging
from pathlib import Path

from app.core.channel_paths import resolver_do_projeto
from app.domain.corte.segment_calculator import calcular_segmentos, normalizar_desvio
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


def _layout_youtube_cru_do_corte(corte: Corte | dict | None) -> dict:
    """Layout do corte como ele foi salvo — desserializado, mas NAO normalizado.

    Quem resolve a cascata (`resolver_layout_em_cascata`) precisa distinguir um
    corte intocado de um configurado: normalizar antes preenche fundo, placa,
    compartilhada e full com os defaults de codigo, o corte passa a parecer
    configurado e os niveis de projeto e global sao descartados (D-414).
    """
    raw = _campo_corte(corte, "layout_youtube")
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(raw or "{}")
    except (ValueError, TypeError) as e:
        logger.warning(
            "[Pipeline] layout_youtube invalido no corte %s: %s",
            _campo_corte(corte, "id", ""),
            e,
        )
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _desvios_do_corte(corte: Corte | dict | None) -> list[dict]:
    """Extrai a lista de desvios (trechos removidos) do corte.

    Tolerante ao formato: JSON string (como fica no banco) ou lista já
    desserializada. Descarta entradas que não sejam dict.
    """
    raw = _campo_corte(corte, "desvios")
    if not raw:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            return []
    if isinstance(raw, list):
        return [normalizar_desvio(d) for d in raw if isinstance(d, dict)]
    return []


def _duracao_layout_corte(corte: Corte | dict | None) -> float:
    """Duração de referência do corte que ancora a grade e o compose final.

    Prioriza `duracao_clip_seg` — a duração REAL do `clip_raw`, medida por
    ffprobe no "Gerar Bruto" (já líquida, sem os trechos removidos).

    Quando ausente (corte ainda não gerado ou campo zerado), o fallback usa a
    duração LÍQUIDA — o span menos os trechos removidos (desvios) —, NÃO o span
    bruto `fim - inicio` (o campo "DUR" do editor, que inclui os trechos).
    Ancorar a grade no span bruto inflava a duração: o graded/final rodavam
    além do conteúdo real e congelavam o último frame até o fim do span (D-362).
    A líquida é idêntica ao `calcularDuracaoLiquida` do editor e à duração que o
    `clip_raw` realmente terá.
    """
    duracao = _numero_corte(_campo_corte(corte, "duracao_clip_seg"), 0.0)
    if duracao > 0:
        return duracao

    inicio = _numero_corte(_campo_corte(corte, "inicio_seg"), 0.0)
    fim = _numero_corte(_campo_corte(corte, "fim_seg"), inicio)
    if fim <= inicio:
        return 0.0

    segmentos = calcular_segmentos(inicio, fim, _desvios_do_corte(corte))
    return sum(s["end"] - s["start"] for s in segmentos)


def _campo_corte(corte: Corte | dict | None, campo: str, default=None):
    if isinstance(corte, dict):
        return corte.get(campo, default)
    return getattr(corte, campo, default)


def _numero_corte(valor, default: float) -> float:
    try:
        return float(valor)
    except (TypeError, ValueError):
        return default
