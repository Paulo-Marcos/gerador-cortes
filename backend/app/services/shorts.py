"""Serviço de Shorts — monta o material do prompt e persiste os candidatos (D-454).

Divisão de trabalho no mesmo arranjo da avaliação do bruto (D-447): aqui mora o
que toca banco; as regras de validação vivem no domínio puro (`app.domain.shorts`)
e a chamada ao Claude vive em `claude_ia`, junto com as demais etapas editoriais.

O INSUMO é `Corte.transcricao_final` — a transcrição já com os desvios removidos
e **os tempos rebaseados na timeline do bruto** (`services/corte.py`). É de
propósito: o short é recortado do arquivo do bruto, então tempo de live aqui
dessincronizaria todo candidato. Nenhuma conversão é necessária; o cuidado é não
trocar a fonte por `transcricao_raw` num refactor futuro.

Regerar sugestões preserva decisão humana: só os candidatos ainda em SUGERIDO são
substituídos. O que o operador já aprovou ou rejeitou sobrevive.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from app.channel_paths import resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.shorts import ResultadoSugestoes, SugestaoShort
from app.domain.time_convert import seg_to_mmss
from app.models import Corte, MetadadoCorte, Projeto, Short, StatusShort
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Contagem zerada de shorts por estagio, DERIVADA do enum: acrescentar um status
# novo em StatusShort passa a aparecer na tela sozinho, sem editar esta lista.
_CONTAGEM_VAZIA: dict[str, int] = {"total": 0, **{s.value: 0 for s in StatusShort}}


@dataclass(frozen=True)
class ContextoShorts:
    """O material do prompt + os números que descrevem o bruto analisado."""

    corte_id: str
    projeto_id: str
    titulo: str
    tema_central: str
    duracao_seg: float
    texto_transcricao: str


async def montar_contexto(corte_id: str) -> ContextoShorts:
    """Reúne o que o garimpeiro precisa ver: a transcrição do bruto com `[MM:SS]`.

    Levanta `LookupError` quando o corte não existe e `ValueError` quando não há
    transcrição final — sem ela não há bruto de onde recortar, e mandar prompt
    vazio só produziria candidatos inventados.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} não encontrado")

        transcricao = _json_lista(corte.transcricao_final)
        if not transcricao:
            raise ValueError(
                "O corte não tem transcrição final — gere o bruto antes de propor shorts."
            )

        return ContextoShorts(
            corte_id=corte.id,
            projeto_id=corte.projeto_id,
            titulo=corte.titulo_proposto or "",
            tema_central=corte.tema_central or "",
            duracao_seg=round(_duracao_do_bruto(corte, transcricao), 2),
            texto_transcricao=montar_texto_transcricao(transcricao),
        )


def montar_texto_transcricao(transcricao_final: list[dict]) -> str:
    """A transcrição do bruto no dialeto `[MM:SS] fala` que os prompts leem.

    Exemplo:
        >>> montar_texto_transcricao(
        ...     [{"start": 0.0, "texto": "primeira"}, {"start": 65.0, "texto": "segunda"}]
        ... )
        '[00:00] primeira\\n[01:05] segunda'
    """
    linhas = []
    for segmento in transcricao_final:
        texto = str(segmento.get("texto", "")).strip()
        if not texto:
            continue
        linhas.append(f"[{seg_to_mmss(float(segmento.get('start', 0.0) or 0.0))}] {texto}")
    return "\n".join(linhas)


async def registrar_sugestoes(
    contexto: ContextoShorts, resultado: ResultadoSugestoes
) -> list[dict]:
    """Substitui os candidatos ainda SUGERIDOS do corte pelos recém-propostos.

    Aprovados e rejeitados NÃO são tocados: regerar as sugestões é refazer o
    palpite da IA, não desfazer a curadoria de quem já passou por ali.
    """
    async with AsyncSessionLocal() as db:
        # A numeracao continua depois do que SOBREVIVE, entao ela e lida antes do
        # delete — depois dele os candidatos removidos ainda estariam na sessao.
        proximo_numero = await _proximo_numero_apos_os_curados(db, contexto.corte_id)

        antigos = (
            await db.scalars(
                select(Short)
                .where(Short.corte_id == contexto.corte_id)
                .where(Short.status == StatusShort.SUGERIDO)
            )
        ).all()
        for antigo in antigos:
            await db.delete(antigo)

        novos = [
            _para_modelo(contexto.corte_id, proximo_numero + posicao, sugestao)
            for posicao, sugestao in enumerate(resultado.sugestoes)
        ]
        db.add_all(novos)
        await db.commit()
        serializados = [_serializar(short) for short in novos]

    logger.info(
        "[Shorts] corte=%s sugeridos=%d descartados=%d substituidos=%d",
        contexto.corte_id[:8],
        len(novos),
        len(resultado.descartes),
        len(antigos),
    )
    for motivo in resultado.descartes:
        logger.info("[Shorts] corte=%s descarte: %s", contexto.corte_id[:8], motivo)
    return serializados


async def descartar_bruto(corte_id: str) -> dict:
    """Libera o disco do bruto de um Fire, encerrando a fabrica daquele corte (D-460).

    Sem o bruto nao ha de onde recortar: os candidatos ja aprovados continuam
    registrados, mas nenhum short novo sai dali e os existentes nao podem mais
    ser renderizados. Por isso a tela avisa antes — aqui a decisao ja foi tomada.

    Levanta `LookupError` quando o corte nao existe.
    """
    from app.services.media_retention import MediaRetentionService

    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")

        report = MediaRetentionService.descartar_bruto(corte)
        # O ponteiro so cai se o arquivo caiu: com o bruto travado pelo player o
        # descarte falha, e mentir no banco esconderia o disco ainda ocupado.
        if not report.erros:
            corte.arquivo_clip_path = ""
        await db.commit()

    logger.info(
        "[Shorts] corte=%s bruto descartado: %s MB liberados, %d erro(s)",
        corte_id[:8],
        report.liberado_mb,
        len(report.erros),
    )
    return {"liberado_mb": report.liberado_mb, "removidos": report.removidos, "erros": report.erros}


# Estagios que a curadoria humana pode atribuir. RENDERIZADO fica de fora de
# proposito: quem carimba isso e o render, quando o MP4 existe em disco (D-459).
_STATUS_DA_CURADORIA = frozenset(
    {StatusShort.SUGERIDO.value, StatusShort.APROVADO.value, StatusShort.REJEITADO.value}
)


async def atualizar_short(
    short_id: str,
    *,
    status: str | None = None,
    inicio_seg: float | None = None,
    fim_seg: float | None = None,
) -> dict:
    """Aplica a decisao do operador sobre um candidato (D-459).

    As bordas sao validadas contra o BRUTO, nao contra a faixa de duracao da
    skill: a faixa existe para disciplinar a IA, e o humano que assistiu ao
    trecho tem o direito de discordar dela. O que ele NAO pode e apontar para
    fora do arquivo — dai o teto ser a duracao do bruto.

    Levanta `LookupError` (short inexistente) e `ValueError` (status invalido ou
    bordas impossiveis).
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")

        if status is not None:
            if status not in _STATUS_DA_CURADORIA:
                raise ValueError(f"Status {status!r} nao e uma decisao de curadoria.")
            short.status = status

        if inicio_seg is not None or fim_seg is not None:
            corte = await db.get(Corte, short.corte_id)
            novo_inicio = short.inicio_seg if inicio_seg is None else float(inicio_seg)
            novo_fim = short.fim_seg if fim_seg is None else float(fim_seg)
            _validar_bordas(novo_inicio, novo_fim, corte)
            short.inicio_seg = round(novo_inicio, 2)
            short.fim_seg = round(novo_fim, 2)

        await db.commit()
        return _serializar(short)


def _validar_bordas(inicio: float, fim: float, corte: Corte | None) -> None:
    if inicio < 0:
        raise ValueError("O inicio nao pode ser negativo.")
    if fim <= inicio:
        raise ValueError("O fim precisa vir depois do inicio.")
    duracao = float(corte.duracao_clip_seg or 0.0) if corte else 0.0
    if duracao > 0 and fim > duracao + _FOLGA_BORDA_SEG:
        raise ValueError("O fim passa da duracao do bruto.")


# O player devolve o tempo com casas decimais; um piscar alem do fim do arquivo
# e arredondamento, nao erro do operador.
_FOLGA_BORDA_SEG = 1.0


async def listar_shorts(corte_id: str) -> list[dict]:
    """Todos os shorts do corte, do melhor palpite ao pior."""
    async with AsyncSessionLocal() as db:
        shorts = (
            await db.scalars(
                select(Short)
                .where(Short.corte_id == corte_id)
                .order_by(Short.score.desc(), Short.numero.asc())
            )
        ).all()
    return [_serializar(short) for short in shorts]


async def listar_fires_com_bruto() -> list[dict]:
    """Os cortes Fire cujo bruto ainda existe em disco — a porta da tela de Shorts.

    O filtro de DISCO e o que importa aqui: um corte Fire cujo bruto ja foi
    descartado nao tem do que recortar short, entao listá-lo so daria trabalho
    ao operador. A D-456 faz esse bruto sobreviver a limpeza; aqui a gente
    confere que ele sobreviveu MESMO (o arquivo pode ter sumido por fora do app).

    Ordena do trabalho mais recente para o mais antigo: quem abre a tela quer
    ver a live que acabou de processar.
    """
    async with AsyncSessionLocal() as db:
        linhas = (
            await db.execute(
                select(Corte, Projeto)
                .join(MetadadoCorte, MetadadoCorte.corte_id == Corte.id)
                .join(Projeto, Projeto.id == Corte.projeto_id)
                .where(MetadadoCorte.is_fire)
                .order_by(Corte.atualizado_em.desc())
            )
        ).all()

        fires = []
        for corte, projeto in linhas:
            bruto = _bruto_em_disco(corte)
            if bruto is None:
                continue
            fires.append(_descrever_fire(corte, projeto, bruto))

        if fires:
            contagens = await _contar_shorts_por_corte(db, [f["corte_id"] for f in fires])
            for fire in fires:
                fire["shorts"] = contagens.get(fire["corte_id"], _CONTAGEM_VAZIA.copy())

    return fires


def _bruto_em_disco(corte: Corte) -> Path | None:
    """O arquivo do bruto, ou `None` se o ponteiro nao aponta para nada."""
    if not corte.arquivo_clip_path:
        return None
    caminho = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
    return caminho if caminho.is_file() else None


def _descrever_fire(corte: Corte, projeto: Projeto, bruto: Path) -> dict:
    return {
        "corte_id": corte.id,
        "projeto_id": projeto.id,
        "projeto_titulo": projeto.titulo_live or "",
        "numero": corte.numero,
        "titulo": corte.titulo_proposto or "",
        "tema_central": corte.tema_central or "",
        "duracao_seg": round(float(corte.duracao_clip_seg or 0.0), 2),
        "bruto_mb": round(bruto.stat().st_size / 1_000_000, 1),
    }


async def _contar_shorts_por_corte(db: AsyncSession, corte_ids: list[str]) -> dict[str, dict]:
    """Quantos shorts cada corte tem, por status — numa consulta so.

    Consultar dentro do laco daria uma query por Fire; a tela abre com a lista
    inteira, entao o N+1 apareceria como lentidao ja no primeiro uso real.
    """
    linhas = (
        await db.execute(
            select(Short.corte_id, Short.status, func.count())
            .where(Short.corte_id.in_(corte_ids))
            .group_by(Short.corte_id, Short.status)
        )
    ).all()

    contagens: dict[str, dict] = {}
    for corte_id, status, quantos in linhas:
        contagem = contagens.setdefault(corte_id, _CONTAGEM_VAZIA.copy())
        contagem["total"] += quantos
        if status in contagem:
            contagem[status] += quantos
    return contagens


async def _proximo_numero_apos_os_curados(db: AsyncSession, corte_id: str) -> int:
    """Primeiro número livre acima dos shorts que a regeração NÃO apaga."""
    maior = await db.scalar(
        select(func.max(Short.numero))
        .where(Short.corte_id == corte_id)
        .where(Short.status != StatusShort.SUGERIDO)
    )
    return int(maior or 0) + 1


def _duracao_do_bruto(corte: Corte, transcricao: list[dict]) -> float:
    """Duração do bruto: a gravada na geração, com a transcrição como retaguarda.

    `duracao_clip_seg` pode estar zerada em corte antigo (o probe do D-369 falhava
    em silêncio); nesse caso o último segmento da transcrição é o melhor palpite
    disponível — e é melhor um teto aproximado que nenhum.
    """
    gravada = float(corte.duracao_clip_seg or 0.0)
    if gravada > 0:
        return gravada
    ultimo = transcricao[-1]
    return float(ultimo.get("end", ultimo.get("start", 0.0)) or 0.0)


def _para_modelo(corte_id: str, numero: int, sugestao: SugestaoShort) -> Short:
    return Short(
        id=str(uuid.uuid4()),
        corte_id=corte_id,
        numero=numero,
        titulo_sugerido=sugestao.titulo,
        gancho=sugestao.gancho,
        inicio_seg=sugestao.inicio_seg,
        fim_seg=sugestao.fim_seg,
        score=sugestao.score,
        justificativa=sugestao.justificativa,
        status=StatusShort.SUGERIDO,
    )


def _serializar(short: Short) -> dict:
    return {
        "id": short.id,
        "corte_id": short.corte_id,
        "numero": short.numero,
        "titulo": short.titulo_sugerido,
        "gancho": short.gancho,
        "inicio_seg": short.inicio_seg,
        "fim_seg": short.fim_seg,
        "duracao_seg": round(short.fim_seg - short.inicio_seg, 2),
        "score": short.score,
        "justificativa": short.justificativa,
        "status": short.status,
        "arquivo_short_path": short.arquivo_short_path,
    }


def _json_lista(bruto: str | None) -> list[dict]:
    try:
        dados = json.loads(bruto or "[]")
    except json.JSONDecodeError:
        return []
    return dados if isinstance(dados, list) else []
