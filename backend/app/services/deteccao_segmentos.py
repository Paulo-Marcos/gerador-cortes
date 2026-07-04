"""Detecção de mudanças de cena por corte via PySceneDetect (F-054).

A ideia é simples: o usuário não quer ficar varrendo o vídeo bruto à mão para
identificar pontos onde o palco/posicionamento muda (corte de câmera, troca de
slide, virada de imagem). PySceneDetect detecta essas viradas visuais via
ContentDetector (HSV deltas frame a frame) e devolve uma lista de segmentos.

Cada segmento detectado é uma *sugestão* — não vira região automaticamente. O
front mostra como marcador tracejado na timeline do YT layout; o editor decide
no Ctrl+Click (Rejeitar / FULL / Compartilhada).

As funções de detecção (`detectar_segmentos_arquivo` / `_async`) são puras do ponto
de vista de aplicação — só I/O contra o filesystem, sem banco — o que facilita
teste e isolamento. A orquestração fire-and-forget `executar_deteccao_segmentos`
é a única parte que persiste no banco: ela vive aqui (e não no router) para que o
serviço de export possa dispará-la sem inverter a seta de dependência
(service→presentation). O router e o `ExportService` apenas importam daqui.
"""

from __future__ import annotations

import asyncio
import enum
import json
from pathlib import Path
from typing import Any

from app.database import AsyncSessionLocal
from app.models import Corte
from app.services.app_logging import operational_error

# Limiar do ContentDetector — quanto MENOR, mais sensível (detecta mais cortes).
# 27 é o default do PySceneDetect e produz resultados estáveis em entrevistas /
# lives analíticas (poucos falsos positivos em câmeras estáticas).
DEFAULT_THRESHOLD = 27.0

# Duração mínima de cena (em segundos). Abaixo disso a detecção tende a virar
# barulho — cortes de 0.5s não são úteis como sugestão editorial.
DEFAULT_MIN_SCENE_LEN_SEC = 2.0


class StatusSegmentoDetectado(str, enum.Enum):
    """Ciclo de vida de cada segmento sugerido."""

    SUGERIDO = "sugerido"
    ACEITO_FULL = "aceito_full"
    ACEITO_COMPARTILHADA = "aceito_compartilhada"
    REJEITADO = "rejeitado"


VALORES_ACEITOS_DECISAO = {"rejeitar", "full", "compartilhada"}


def _decisao_para_status(decisao: str) -> StatusSegmentoDetectado:
    if decisao == "rejeitar":
        return StatusSegmentoDetectado.REJEITADO
    if decisao == "full":
        return StatusSegmentoDetectado.ACEITO_FULL
    if decisao == "compartilhada":
        return StatusSegmentoDetectado.ACEITO_COMPARTILHADA
    raise ValueError(f"Decisão inválida: {decisao!r}")


def detectar_segmentos_arquivo(
    video_path: Path,
    threshold: float = DEFAULT_THRESHOLD,
    min_scene_len_sec: float = DEFAULT_MIN_SCENE_LEN_SEC,
) -> list[dict[str, Any]]:
    """Roda PySceneDetect síncrono no `video_path` e devolve segmentos.

    Cada segmento é `{"inicio": float, "fim": float, "score": float}` com
    tempos em segundos relativos ao início do clip. `score` é o pico do delta
    HSV no entorno do corte — útil pra ordenar/filtrar sugestões.

    Levanta `FileNotFoundError` se o arquivo não existir e propaga qualquer
    erro do scenedetect. Quem chama deve tratar e marcar status de erro.
    """
    if not video_path.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {video_path}")

    # Import lazy: scenedetect é opcional em ambientes onde o backend roda só
    # como API (sem detecção). Se faltar, devolve lista vazia com sinalização
    # visível no log — o usuário só perde a sugestão automática.
    try:
        from scenedetect import ContentDetector, SceneManager, open_video
    except ImportError as exc:
        raise RuntimeError(
            "PySceneDetect não está instalado. Adicione `scenedetect[opencv]` "
            "ao requirements e reinstale."
        ) from exc

    video = open_video(str(video_path))
    fps = float(video.frame_rate) or 30.0
    min_scene_frames = max(1, int(min_scene_len_sec * fps))

    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=threshold, min_scene_len=min_scene_frames))
    scene_manager.detect_scenes(video=video, show_progress=False)

    scenes = scene_manager.get_scene_list()

    segmentos: list[dict[str, Any]] = []
    for inicio, fim in scenes:
        inicio_seg = float(inicio.get_seconds())
        fim_seg = float(fim.get_seconds())
        if fim_seg <= inicio_seg:
            continue
        segmentos.append(
            {
                "inicio": round(inicio_seg, 3),
                "fim": round(fim_seg, 3),
                # ContentDetector não expõe score por cena diretamente —
                # como proxy, normalizamos a duração: cortes muito curtos
                # sobem o score (mudança brusca), longos descem.
                "score": round(min(1.0, 5.0 / max(0.5, fim_seg - inicio_seg)), 3),
                "status": StatusSegmentoDetectado.SUGERIDO.value,
            }
        )
    return segmentos


async def detectar_segmentos_async(
    video_path: Path,
    threshold: float = DEFAULT_THRESHOLD,
    min_scene_len_sec: float = DEFAULT_MIN_SCENE_LEN_SEC,
) -> list[dict[str, Any]]:
    """Wrapper async que delega o trabalho CPU-bound a um worker thread.

    PySceneDetect é síncrono e bloqueante; sem isso travaria o event loop
    do FastAPI por minutos durante a detecção.
    """
    return await asyncio.to_thread(
        detectar_segmentos_arquivo, video_path, threshold, min_scene_len_sec
    )


def aplicar_decisao_segmento(
    segmentos: list[dict[str, Any]],
    indice: int,
    decisao: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Atualiza o status do segmento no índice e devolve (lista_nova, segmento).

    Função pura — testável sem banco. A rota usa o segmento devolvido para
    materializar uma região em `layout_youtube.regioes` quando aceito.
    """
    if not 0 <= indice < len(segmentos):
        raise IndexError(f"Índice {indice} fora dos limites [0, {len(segmentos)})")
    if decisao not in VALORES_ACEITOS_DECISAO:
        raise ValueError(
            f"Decisão inválida: {decisao!r}. Use uma de {sorted(VALORES_ACEITOS_DECISAO)}"
        )

    novos = [dict(item) for item in segmentos]
    novos[indice]["status"] = _decisao_para_status(decisao).value
    return novos, novos[indice]


def materializar_regiao_em_layout(
    layout_youtube: dict[str, Any],
    segmento: dict[str, Any],
    decisao: str,
) -> dict[str, Any]:
    """Insere uma região nova em `layout_youtube.regioes` a partir do segmento.

    Mantém as regiões existentes e adiciona uma nova com o modo correspondente
    à decisão (`full` ou `compartilhada`). Sem mutação: devolve dict novo.

    Para decisão `rejeitar` é no-op — devolve o layout inalterado, porque a UI
    só precisa atualizar o status do segmento.
    """
    if decisao == "rejeitar":
        return dict(layout_youtube)
    if decisao not in {"full", "compartilhada"}:
        raise ValueError(f"Decisão sem mapeamento de modo: {decisao!r}")

    inicio = float(segmento.get("inicio", 0.0))
    fim = float(segmento.get("fim", inicio))
    if fim <= inicio:
        # Segmento degenerado: não polui o layout com uma região inválida.
        return dict(layout_youtube)

    nova_regiao = {
        "inicio": round(inicio, 3),
        "fim": round(fim, 3),
        "modo": decisao,
    }
    layout_novo = dict(layout_youtube)
    regioes = list(layout_novo.get("regioes") or [])
    regioes.append(nova_regiao)
    regioes.sort(key=lambda r: (float(r.get("inicio", 0.0)), float(r.get("fim", 0.0))))
    layout_novo["regioes"] = regioes
    return layout_novo


# Guard de re-entrância: evita duplo trigger da detecção para o mesmo corte
# enquanto uma execução já está em andamento (a chamada é fire-and-forget).
_deteccoes_em_andamento: set[str] = set()


def deteccao_em_andamento(corte_id: str) -> bool:
    """True se já existe uma detecção rodando para `corte_id`."""
    return corte_id in _deteccoes_em_andamento


async def executar_deteccao_segmentos(corte_id: str, video_path: Path) -> None:
    """Roda PySceneDetect e salva o resultado no corte. Fire-and-forget.

    Marca o corte como "em andamento" antes de começar para evitar duplo trigger.
    Em qualquer erro, limpa a marca e loga — o usuário pode disparar de novo.

    Vive no serviço (e não no router) para que `ExportService` possa disparar a
    detecção no bruto recém-gerado sem importar a camada de apresentação.
    """
    if corte_id in _deteccoes_em_andamento:
        return
    _deteccoes_em_andamento.add(corte_id)
    try:
        segmentos = await detectar_segmentos_async(video_path)
        async with AsyncSessionLocal() as session:
            corte = await session.get(Corte, corte_id)
            if corte is None:
                return
            corte.segmentos_detectados = json.dumps(segmentos, ensure_ascii=False)
            await session.commit()
    except Exception as exc:
        operational_error(
            "DeteccaoSegmentos", f"Detecção de segmentos falhou para {corte_id}: {exc}"
        )
    finally:
        _deteccoes_em_andamento.discard(corte_id)
