"""Helpers do router de cortes: conversão HMS, serialização de Corte e limpeza
pós-sincronização.

Extraído de `cortes` (E-006). Funções sem dependência do objeto `router`.
`_corte_to_dict` monta o payload da API a partir do ORM `Corte` (decodifica
campos JSON, mede duração via ffprobe quando ausente). Re-exportadas pela
fachada `app.routers.cortes`.

NOTA: os helpers do cluster `pipeline-status` (`_pipeline_paths`,
`_grade_aproveitavel`, etc.) e `_corte_ja_gerou_bruto` permanecem no módulo do router
porque seus testes fazem monkeypatch em `cortes.projetos_dir`/`_corte_ja_gerou_bruto`.
"""

import json
import logging

from app.core.channel_paths import projetos_dir, resolver_do_projeto
from app.domain.compartilhado.time_convert import hms_to_seg
from app.domain.corte.corte_mapper import normalizar_cenas_remotion_payload
from app.domain.corte.desvio_categoria import classificar_desvio
from app.models import Corte
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError

# O ffprobe da duração só lê o cabeçalho do arquivo.
_TIMEOUT_DO_FFPROBE_S = 10

logger = logging.getLogger(__name__)


def _hms_to_seg(hms: str) -> float:
    """HH:MM:SS -> segundos, pelo conversor do domínio (D-654).

    Havia aqui uma segunda implementação que, diante de um tempo estranho,
    devolvia 0.0 em SILÊNCIO: dividir um corte em "12:34x" cortaria no começo do
    vídeo, sem uma linha de log para explicar. Agora o tempo inválido vira 400 —
    o operador lê o motivo e corrige, em vez de ver um corte no lugar errado.

    A troca foi conferida contra os dados reais: 78.981 tempos gravados nos
    bancos de DEV e de PROD, zero divergências entre as duas implementações.
    """
    try:
        return hms_to_seg(hms)
    except (ValueError, TypeError, AttributeError) as erro:
        raise HTTPException(
            status_code=400, detail=f"Tempo inválido: {hms!r}. Use HH:MM:SS."
        ) from erro


def _corte_to_dict(corte: Corte) -> dict:
    # WHY: itera por __table__.columns — colunas novas (ex.: I-034 `justificativa`)
    # entram automaticamente no payload. Só ajustamos abaixo campos JSON-encoded.
    d = {c: getattr(corte, c) for c in corte.__table__.columns.keys()}
    # D-422: classifica no caminho de LEITURA, não só na geração — assim os cortes
    # analisados antes da categoria existir também chegam badgeados ao editor, sem
    # migrar banco e sem replicar a tabela de inferência no frontend. Este é o
    # único ponto de serialização de corte da API, então cobre todas as rotas.
    d["desvios"] = [classificar_desvio(x) for x in json.loads(corte.desvios or "[]")]
    # D-314: `score_json` (proposta v2, D-302) é ranking relativo entre os cortes
    # da mesma análise — {hook, flow, value, total}. Sai parseado como objeto no
    # campo `score` para o editor priorizar qual corte tratar primeiro. Corte
    # antigo/manual (anterior à v2 ou sem análise) → {} — o front não exibe badge.
    # frase_gancho_hms/frase_gancho_texto/contextualizacao já saem como strings
    # pela iteração de colunas acima (default "" nos cortes legados).
    try:
        d["score"] = json.loads(getattr(corte, "score_json", None) or "{}")
    except (ValueError, TypeError):
        d["score"] = {}
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
    except (ValueError, TypeError):
        d["segmentos_detectados"] = []
    # D-576: ordem de exibição dos blocos. Lista vazia = ordem cronológica, que
    # é o caso da esmagadora maioria dos cortes — e o que os legados devolvem.
    try:
        d["arranjo_blocos"] = json.loads(getattr(corte, "arranjo_blocos", None) or "[]")
    except (ValueError, TypeError):
        d["arranjo_blocos"] = []
    # D-334: log de invocações da skill trechos-expert (telemetria D-303).
    try:
        d["trechos_geracoes_log"] = json.loads(getattr(corte, "trechos_geracoes_log", None) or "[]")
    except (ValueError, TypeError):
        d["trechos_geracoes_log"] = []

    # Prevenção contra erro de Lazy Loading (greenlet_spawn)
    try:
        d["is_fire"] = corte.metadado.is_fire if corte.metadado else False
    except SQLAlchemyError:
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
                    timeout=_TIMEOUT_DO_FFPROBE_S,
                )
                if result.returncode == 0:
                    d["duracao_clip_seg"] = float(result.stdout.strip())
                else:
                    logger.debug(
                        "[Cortes] ffprobe falhou em %s (rc=%s): %s",
                        p.name,
                        result.returncode,
                        result.stderr[-200:],
                    )
            except Exception as erro:  # noqa: BLE001 — duração é acessória
                # D-654: acessória não quer dizer invisível. Sem este log, um
                # ffprobe quebrado vira "o editor não mostra a duração" e a
                # investigação começa no lugar errado.
                logger.debug("[Cortes] não consegui medir a duração de %s: %s", p.name, erro)

    return d
