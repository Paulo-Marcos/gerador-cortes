"""Helpers do router de cortes: conversão HMS, serialização de Corte e limpeza
pós-sincronização.

Extraído de `cortes` (E-006). Funções sem dependência do objeto `router`.
`_corte_to_dict` monta o payload da API a partir do ORM `Corte` (decodifica
campos JSON, mede duração via ffprobe quando ausente). Re-exportadas pela
fachada `app.routers.cortes`.

NOTA: os helpers do cluster `pipeline-status` (`_pipeline_paths`,
`_grade_aproveitavel`, etc.) e `_corte_tem_bruto` permanecem no módulo do router
porque seus testes fazem monkeypatch em `cortes.projetos_dir`/`_corte_tem_bruto`.
"""

import asyncio
import json
import logging
import shutil
from pathlib import Path

from app.channel_paths import projetos_dir, resolver_do_projeto
from app.domain.corte_mapper import normalizar_cenas_remotion_payload
from app.models import Corte

logger = logging.getLogger(__name__)


def _hms_to_seg(hms: str) -> float:
    try:
        if not hms:
            return 0.0
        partes = str(hms).strip().split(":")
        if len(partes) >= 3:
            return int(partes[0]) * 3600 + int(partes[1]) * 60 + float(partes[2])
        elif len(partes) == 2:
            return int(partes[0]) * 60 + float(partes[1])
        elif len(partes) == 1:
            return float(partes[0])
    except Exception:
        pass
    return 0.0


def _corte_to_dict(corte: Corte) -> dict:
    # WHY: itera por __table__.columns — colunas novas (ex.: I-034 `justificativa`)
    # entram automaticamente no payload. Só ajustamos abaixo campos JSON-encoded.
    d = {c: getattr(corte, c) for c in corte.__table__.columns.keys()}
    d["desvios"] = json.loads(corte.desvios or "[]")
    d["transcricao_corte"] = json.loads(corte.transcricao_corte or "[]")
    d["transcricao_final"] = json.loads(corte.transcricao_final or "[]")
    d["transcricao_final_texto"] = corte.transcricao_final_texto or ""
    d["cenas_remotion"] = normalizar_cenas_remotion_payload(
        json.loads(corte.cenas_remotion or "[]")
    )
    layout_val = getattr(corte, "layout_youtube", None)
    if isinstance(layout_val, str) and layout_val.strip():
        d["layout_youtube"] = json.loads(layout_val)
    elif isinstance(layout_val, dict):
        d["layout_youtube"] = layout_val
    else:
        d["layout_youtube"] = {}
    d["cenas_validadas"] = int(getattr(corte, "cenas_validadas", 0) or 0)
    d["cenas_validadas_em"] = getattr(corte, "cenas_validadas_em", None)
    # F-054: lista pode estar vazia (corte ainda não rodou detecção) ou
    # ausente em cortes legados — sempre devolve [].
    try:
        d["segmentos_detectados"] = json.loads(getattr(corte, "segmentos_detectados", None) or "[]")
    except Exception:
        d["segmentos_detectados"] = []

    # Prevenção contra erro de Lazy Loading (greenlet_spawn)
    try:
        d["is_fire"] = corte.metadado.is_fire if corte.metadado else False
    except Exception:
        d["is_fire"] = False

    d["is_pos_producao"] = getattr(corte, "is_pos_producao", 0)

    # Heurística para dados legados ou renderizados antes da flag
    if not d["is_pos_producao"]:
        p_path = (
            projetos_dir() / corte.projeto_id / "cortes" / corte.id / "upload_ready" / "video.mp4"
        )
        if p_path.exists():
            d["is_pos_producao"] = 1

    # Fallback: se duracao_clip_seg ainda não foi salva (cortes legados
    # gerados antes desse campo existir) mas o arquivo existe no disco,
    # mede via ffprobe síncrono e retorna na resposta.  Resposta da API
    # passa a refletir o valor REAL sem precisar regerar o bruto.
    d["duracao_clip_seg"] = float(getattr(corte, "duracao_clip_seg", 0.0) or 0.0)
    if d["duracao_clip_seg"] <= 0 and corte.arquivo_clip_path:
        p = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
        if p.exists():
            try:
                import subprocess

                result = subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-show_entries",
                        "format=duration",
                        "-of",
                        "default=noprint_wrappers=1:nokey=1",
                        str(p),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )
                if result.returncode == 0:
                    d["duracao_clip_seg"] = float(result.stdout.strip())
            except Exception:
                pass

    return d


async def _limpar_pasta_corte_pos_sync(corte_dir: Path):
    """Após sincronização bem-sucedida, mantém apenas clip_filtered.mp4 e upload_ready/.
    Arquivos de vídeo grandes (clip_raw.*) podem estar com lock no Windows porque o
    player do navegador segura a conexão de streaming; tenta novamente algumas vezes."""
    manter = {"clip_filtered.mp4", "upload_ready"}
    pendentes: list[Path] = []

    for entry in corte_dir.iterdir():
        if entry.name in manter:
            continue
        try:
            if entry.is_dir():
                shutil.rmtree(entry)
            else:
                entry.unlink()
        except PermissionError:
            pendentes.append(entry)
        except Exception as e:
            logger.warning("[SincronizarPos] Falha ao remover %s: %s", entry, e)

    # Retry para arquivos travados (típico: clip_raw.mkv sendo servido via stream)
    for _ in range(1, 6):
        if not pendentes:
            break
        await asyncio.sleep(1.5)
        ainda_travados: list[Path] = []
        for entry in pendentes:
            try:
                if entry.is_dir():
                    shutil.rmtree(entry)
                else:
                    entry.unlink()
            except PermissionError:
                ainda_travados.append(entry)
            except FileNotFoundError:
                pass  # Sumiu entre tentativas, ok
            except Exception as e:
                logger.warning("[SincronizarPos] Falha ao remover %s: %s", entry, e)
        pendentes = ainda_travados

    for entry in pendentes:
        logger.warning(
            "[SincronizarPos] Não foi possível remover %s (arquivo bloqueado por outro processo)",
            entry.name,
        )
