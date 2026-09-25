"""Serviço de Shorts — monta o material do prompt e persiste os candidatos (D-454).

Divisão de trabalho no mesmo arranjo da avaliação do bruto (D-447): aqui mora o
que toca banco; as regras de validação vivem no domínio puro (`app.domain.short.shorts`)
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
from datetime import datetime
from pathlib import Path

from app.config import settings
from app.core.channel_paths import projetos_dir, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.compartilhado.provider_ia import ProviderIA
from app.domain.compartilhado.time_convert import seg_to_hms_short, seg_to_mmss
from app.domain.short import gancho_short, legenda_short, segmentos_short
from app.domain.short.arranjo_short import de_chave as arranjo_de_chave
from app.domain.short.cenas_short import normalizar_lista as normalizar_lista_de_cenas
from app.domain.short.cenas_short_ia import recortar_transcricao_varios
from app.domain.short.formato_video import foco_de_regiao
from app.domain.short.moldura_short import Moldura
from app.domain.short.shorts import ResultadoSugestoes, SugestaoShort
from app.models import Corte, MetadadoCorte, MetadadoShort, Projeto, Short, StatusShort
from app.services import channels
from app.services.canal import editorial_scaffolds, editorial_skills
from app.services.claude_ia import gerar_json, gerar_texto, registrar_skill_usada
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_SKILL_SHORTS = "shorts-expert"
_SKILL_CENAS_SHORT = "cenas-short-expert"
_SKILL_GANCHO_SHORT = "gancho-short-expert"

ORIGEM_IA = "ia"
ORIGEM_MANUAL = "manual"

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

        # D-484: so os SUGERIDOS DA IA sao descartados. Regerar e refazer o
        # palpite da maquina; o trecho que o operador marcou a mao nao e palpite
        # de ninguem, e some-lo aqui seria apagar trabalho humano em silencio.
        antigos = (
            await db.scalars(
                select(Short)
                .where(Short.corte_id == contexto.corte_id)
                .where(Short.status == StatusShort.SUGERIDO)
                .where(Short.origem == ORIGEM_IA)
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


async def criar_manual(
    corte_id: str, *, inicio_seg: float, fim_seg: float, titulo: str = ""
) -> dict:
    """Cria um short que a IA não propôs (D-484).

    O operador viu no bruto um trecho que o palpite da máquina deixou passar. O
    candidato nasce SUGERIDO — ele ainda passa pela mesma curadoria, aparece nas
    mesmas contagens e usa os mesmos botões — mas com `origem="manual"`, que é o
    que o poupa da próxima regeração.

    As bordas passam pela MESMA validação do PATCH: não pode ser negativa, o fim
    vem depois do início, e nada aponta para fora do bruto. Um caminho de escrita
    com regra própria acabaria discordando do outro.

    Levanta `LookupError` (corte inexistente) e `ValueError` (bordas impossíveis).
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")

        _validar_bordas(float(inicio_seg), float(fim_seg), corte)
        numero = await _proximo_numero_apos_os_curados(db, corte_id)

        short = Short(
            id=str(uuid.uuid4()),
            corte_id=corte_id,
            numero=numero,
            titulo_sugerido=titulo.strip() or f"Trecho manual #{numero}",
            inicio_seg=round(float(inicio_seg), 2),
            fim_seg=round(float(fim_seg), 2),
            # Sem nota: o score ordena os palpites da IA entre si, e dar uma
            # nota inventada ao trecho humano o misturaria nessa fila como se
            # fosse mais um chute. A origem na tela diz o que ele é.
            score=0.0,
            justificativa="Marcado a mao pelo operador.",
            status=StatusShort.SUGERIDO,
            origem=ORIGEM_MANUAL,
        )
        db.add(short)
        await db.commit()
        serializado = _serializar(short, corte)

    logger.info(
        "[Shorts] corte=%s short MANUAL #%d criado (%.2fs a %.2fs)",
        corte_id[:8],
        numero,
        inicio_seg,
        fim_seg,
    )
    return serializado


async def definir_cenas(short_id: str, cenas: list[dict]) -> dict:
    """Grava as cenas de um short, validadas contra a duração DELE (D-494).

    A duração vem do próprio short e não do corte: a cena vive na timeline do
    short, que começa no zero. Validar contra o bruto deixaria passar uma cena
    que só aparece depois do fim do arquivo.

    Levanta `LookupError` (short inexistente) e `CenaInvalida` — que é um
    `ValueError`, então o router já o traduz em 422 com o motivo dentro.
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")

        # D-604: a duracao LIQUIDA, e nao o span. Uma cena aos 50s num short de
        # 0-30 + 45-60 e valida contra o envelope (60s) e invalida contra o video
        # (45s) — e o Remotion receberia uma cena depois do fim da composicao.
        duracao = segmentos_short.duracao_liquida(
            segmentos_short.de_json(short.segmentos),
            inicio_seg=float(short.inicio_seg),
            fim_seg=float(short.fim_seg),
        )
        validadas = normalizar_lista_de_cenas(cenas, duracao)

        short.cenas_remotion = json.dumps(
            [cena.para_json() for cena in validadas], ensure_ascii=False
        )
        await db.commit()
        serializado = _serializar(short)

    logger.info("[Shorts] short=%s cenas=%d", short_id[:8], len(validadas))
    return serializado


@dataclass(frozen=True)
class ContextoCenasDoShort:
    """O material que o proponente de cenas precisa ver — e só ele.

    A transcrição aqui é a do TRECHO, já rebaseada no relógio do short. Mandar a
    do bruto inteiro faria o modelo propor cenas para falas que o short não
    contém, e os tempos voltariam no relógio errado.
    """

    short_id: str
    corte_id: str
    projeto_id: str
    titulo: str
    gancho: str
    duracao_seg: float
    texto_transcricao: str


async def montar_contexto_de_cenas(short_id: str) -> ContextoCenasDoShort:
    """Reúne a janela do short com a transcrição recortada e zerada nela.

    Levanta `LookupError` (short ou corte inexistente) e `ValueError` quando o
    trecho não tem fala nenhuma — sem transcrição o modelo só teria o título
    para trabalhar, e cena inventada em cima de título é exatamente o cartão que
    repete o que o vídeo já diz.
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        transcricao = _json_lista(corte.transcricao_final)
        inicio = float(short.inicio_seg)
        fim = float(short.fim_seg)
        janela = _fala_do_short(short, transcricao)
        if not janela:
            raise ValueError(
                "Este trecho não tem fala transcrita — sem ela não há o que apoiar com cenas."
            )

        return ContextoCenasDoShort(
            short_id=short.id,
            corte_id=corte.id,
            projeto_id=corte.projeto_id,
            titulo=short.titulo_sugerido or corte.titulo_proposto or "",
            gancho=short.gancho or "",
            duracao_seg=round(fim - inicio, 2),
            texto_transcricao=montar_texto_transcricao(janela),
        )


# D-565: quantos ganchos ja usados vao no prompt. Poucos nao mostram o padrao do
# canal; muitos empurram o modelo a imita-los em vez de evitar a repeticao.
_GANCHOS_NO_HISTORICO = 15


@dataclass(frozen=True)
class ContextoGanchoDoShort:
    """O material que a skill do gancho precisa ler (D-565).

    A base e a TRANSCRICAO DO TRECHO, e nao o resumo do corte. A diferenca nao e
    de detalhe: o gancho promete, e a promessa tem de estar no que o short mostra.
    Escrito a partir do resumo do corte inteiro, ele prometeria coisas dos outros
    minutos — e o espectador abandona no segundo 10, o que e pior que nao prender,
    porque queima a confianca do perfil.
    """

    short_id: str
    projeto_id: str
    corte_id: str
    titulo: str
    tema_central: str
    duracao_seg: float
    texto_transcricao: str
    gancho_da_curadoria: str
    ganchos_recentes: str
    # A mesma lista, crua. O texto acima e para o PROMPT; esta e para o
    # parser garantir o que o prompt so pede (D-565).
    ganchos_gastos: list[str]


async def montar_contexto_do_gancho(short_id: str) -> ContextoGanchoDoShort:
    """Reune o trecho + o historico de ganchos do canal.

    O historico vai para EVITAR repeticao — o inverso da etiqueta da capa do
    TikTok, onde ele existe para permiti-la. Sao vitrines diferentes: a grade do
    perfil ganha coerencia quando tres cortes sobre a Selic dizem SELIC, mas no
    feed os shorts aparecem em sequencia, e dois ganchos iguais parecem robo.

    Levanta `LookupError` (short ou corte inexistente) e `ValueError` quando o
    trecho nao tem fala — sem transcricao o modelo so teria o titulo, e gancho
    escrito em cima de titulo e exatamente o que promete o que o short nao tem.
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        inicio = float(short.inicio_seg)
        fim = float(short.fim_seg)
        janela = _fala_do_short(short, _json_lista(corte.transcricao_final))
        if not janela:
            raise ValueError(
                "Este trecho nao tem fala transcrita — sem ela o gancho seria inventado."
            )

        recentes = (
            await db.scalars(
                select(Short.gancho_tela)
                .where(Short.gancho_tela != "")
                .where(Short.id != short_id)
                .order_by(Short.atualizado_em.desc())
                .limit(_GANCHOS_NO_HISTORICO)
            )
        ).all()

        return ContextoGanchoDoShort(
            short_id=short.id,
            projeto_id=corte.projeto_id,
            corte_id=corte.id,
            titulo=short.titulo_sugerido or corte.titulo_proposto or "",
            tema_central=corte.tema_central or "",
            duracao_seg=round(fim - inicio, 2),
            texto_transcricao=montar_texto_transcricao(janela),
            gancho_da_curadoria=short.gancho or "(a IA nao escreveu um)",
            ganchos_recentes="\n".join(f"- {g}" for g in recentes) or "(nenhum ainda)",
            ganchos_gastos=list(recentes),
        )


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
    segmentos: list[dict] | None = None,
    foco_x: float | None = None,
    arranjo_palco: str | None = None,
    janela_cheia: str | None = None,
    ajustes_palco: dict | None = None,
    palco_preset: str | None = None,
    moldura: str | None = None,
    recortes_palco: dict | None = None,
    fundo_palco: str | None = None,
    fundo_editorial: str | None = None,
    palco_short_preset: str | None = None,
    legenda_cor: str | None = None,
    legenda_fonte: str | None = None,
    legenda_x: float | None = None,
    legenda_y: float | None = None,
    legenda_largura: float | None = None,
    gancho_tela: str | None = None,
    gancho_ate_seg: float | None = None,
    gancho_cor: str | None = None,
    gancho_realce: str | None = None,
    gancho_x: float | None = None,
    gancho_y: float | None = None,
    gancho_largura: float | None = None,
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

        _aplicar_status(short, status)
        await _aplicar_bordas(db, short, inicio_seg, fim_seg, segmentos)
        await _aplicar_segmentos(db, short, segmentos)
        _aplicar_foco(short, foco_x)
        _aplicar_gancho(
            short,
            gancho_tela=gancho_tela,
            gancho_ate_seg=gancho_ate_seg,
            gancho_cor=gancho_cor,
            gancho_realce=gancho_realce,
            gancho_x=gancho_x,
            gancho_y=gancho_y,
            gancho_largura=gancho_largura,
        )
        _aplicar_moldura(short, moldura)
        _aplicar_palco(
            short,
            palco_preset=palco_preset,
            ajustes_palco=ajustes_palco,
            recortes_palco=recortes_palco,
            fundo_editorial=fundo_editorial,
        )
        _aplicar_legenda(
            short,
            legenda_cor=legenda_cor,
            legenda_fonte=legenda_fonte,
            legenda_x=legenda_x,
            legenda_y=legenda_y,
            legenda_largura=legenda_largura,
        )
        _aplicar_marca_do_preset(
            short,
            palco_short_preset,
            campos_do_palco=(
                arranjo_palco,
                janela_cheia,
                recortes_palco,
                fundo_editorial,
                legenda_cor,
                legenda_fonte,
                # D-605: mexer no lugar da legenda tambem desfaz a marca. O
                # preset descreve o palco INTEIRO, legenda incluida; manter a
                # marca faria a tela dizer "preset X" sobre um palco que nao e
                # mais o X, e aplica-lo noutro trecho sairia diferente.
                legenda_x,
                legenda_y,
                legenda_largura,
            ),
        )
        _aplicar_arranjo(
            short, fundo_palco=fundo_palco, arranjo_palco=arranjo_palco, janela_cheia=janela_cheia
        )

        await db.commit()
        return _serializar(short)


def _aplicar_status(short: Short, status: str | None) -> None:
    if status is not None:
        if status not in _STATUS_DA_CURADORIA:
            raise ValueError(f"Status {status!r} nao e uma decisao de curadoria.")
        short.status = status


async def _aplicar_bordas(
    db: AsyncSession,
    short: Short,
    inicio_seg: float | None,
    fim_seg: float | None,
    segmentos: list[dict] | None,
) -> None:
    if inicio_seg is not None or fim_seg is not None:
        corte = await db.get(Corte, short.corte_id)
        novo_inicio = short.inicio_seg if inicio_seg is None else float(inicio_seg)
        novo_fim = short.fim_seg if fim_seg is None else float(fim_seg)
        _validar_bordas(novo_inicio, novo_fim, corte)
        short.inicio_seg = round(novo_inicio, 2)
        short.fim_seg = round(novo_fim, 2)
        # D-604: arrastar a borda de um short COLADO nao faz sentido — a
        # borda dele e a soma dos segmentos, e mexer no envelope deixaria os
        # dois discordando em silencio. Quem tem segmentos muda os segmentos.
        if segmentos is None and segmentos_short.de_json(short.segmentos):
            raise ValueError(
                "Este short e montado por segmentos: mova os segmentos na regua em vez das bordas."
            )


async def _aplicar_segmentos(db: AsyncSession, short: Short, segmentos: list[dict] | None) -> None:
    if segmentos is not None:
        # D-604: a colagem do short. Lista vazia DESFAZ a colagem e devolve o
        # short a janela unica — e como o operador volta atras sem precisar de
        # um botao proprio.
        if not segmentos:
            short.segmentos = "[]"
        else:
            corte = await db.get(Corte, short.corte_id)
            limite = float(corte.duracao_clip_seg or 0.0) if corte else 0.0
            fatias = segmentos_short.de_json(segmentos)
            # VALIDA antes de cortar, e nao depois — e a diferenca entre um
            # 422 que explica e um 200 que mente.
            #
            # `normalizar(limite_seg=...)` ENCOLHE o que passa do fim do bruto,
            # e isso e certo na LEITURA (bruto regerado mais curto nao pode
            # custar a tela). Na ESCRITA seria silencio: um segmento marcado
            # aos 500s de um bruto de 120s encolheria para nada, a lista viria
            # vazia, e o operador receberia sucesso com o segmento
            # desaparecido. Aqui ele ouve o numero e o motivo.
            segmentos_short.validar(fatias, limite_seg=limite or fatias[-1].fim_seg)
            # O ENVELOPE acompanha, e nao e redundancia: e por `inicio_seg`/
            # `fim_seg` que a regua sabe onde desenhar o short e que a
            # deteccao de rosto escolhe a janela. Deixa-los para tras poria a
            # tela desenhando o short num lugar que ele nao ocupa mais.
            envelope_inicio, envelope_fim = segmentos_short.envelope(
                fatias, inicio_seg=short.inicio_seg, fim_seg=short.fim_seg
            )
            short.inicio_seg = round(envelope_inicio, 2)
            short.fim_seg = round(envelope_fim, 2)
            # UM segmento so NAO e colagem: e a janela unica com aquelas
            # bordas. Colapsar aqui e o que mantem as duas formas de dizer a
            # mesma coisa como UMA so no banco — com `[{...}]` gravado, a trava
            # de borda acima recusaria arrastar um short que a tela mostra
            # como trecho comum, e a regua ofereceria alcas que dao 422.
            #
            # E e o que faz "tirar o penultimo" funcionar: a tela manda o
            # segmento que sobrou, e as bordas viram as dele. Mandar `[]`
            # deixaria o envelope antigo — com o buraco que o operador tinha
            # tirado de volta DENTRO do short.
            short.segmentos = "[]" if len(fatias) == 1 else segmentos_short.para_json(fatias)


def _aplicar_foco(short: Short, foco_x: float | None) -> None:
    if foco_x is not None:
        if not 0.0 <= foco_x <= 1.0:
            raise ValueError("O foco horizontal vai de 0.0 (esquerda) a 1.0 (direita).")
        short.foco_x = round(float(foco_x), 3)


def _aplicar_gancho(
    short: Short,
    *,
    gancho_tela: str | None,
    gancho_ate_seg: float | None,
    gancho_cor: str | None,
    gancho_realce: str | None,
    gancho_x: float | None,
    gancho_y: float | None,
    gancho_largura: float | None,
) -> None:
    if gancho_tela is not None:
        # "" apaga o gancho, e e assim que o operador o remove. Normalizar
        # aqui e nao so no render: o que a tela mostra de volta tem de ser o
        # que vai para o arquivo, senao a previa mente sobre o espaco.
        short.gancho_tela = gancho_short.normalizar_gancho(gancho_tela)

    if gancho_ate_seg is not None:
        # D-594: 0 e "nao decidi" — o trecho segue a duracao do gancho
        # padrao do corte. Normalizar o zero para 2,5s aqui carimbaria o
        # default no short e o preset nunca mais o alcancaria.
        short.gancho_ate_seg = (
            gancho_short.normalizar_duracao(gancho_ate_seg) if gancho_ate_seg > 0 else 0.0
        )

    if gancho_cor is not None:
        # D-581: "" volta ao branco. Normaliza aqui pelo mesmo motivo do
        # texto: o que a tela recebe de volta tem de ser o que vai para o
        # arquivo, senao a previa pinta uma cor que o render nao usa.
        short.gancho_cor = gancho_short.normalizar_cor(gancho_cor)

    if gancho_realce is not None:
        # D-594: "" fica "" pelo mesmo motivo da duracao — vazio herda do
        # padrao do corte; o veu so entra na leitura, quando nada decidiu.
        short.gancho_realce = (
            gancho_short.normalizar_realce(gancho_realce) if gancho_realce.strip() else ""
        )

    if gancho_x is not None or gancho_y is not None or gancho_largura is not None:
        # D-600: os tres andam juntos porque sao UM gesto — o operador
        # arrasta a caixa e solta. Mandar so `y` num PATCH e legitimo, mas o
        # caso comum e o trio, e separa-los em tres `if` sugeriria que ha
        # tres decisoes onde ha uma.
        #
        # 0 continua sendo "nao decidi", como na duracao e no realce: e assim
        # que o botao "voltar ao lugar do padrao" devolve o trecho a heranca.
        if gancho_x is not None:
            short.gancho_x = gancho_short.normalizar_x(gancho_x) if gancho_x > 0 else 0.0
        if gancho_y is not None:
            short.gancho_y = gancho_short.normalizar_y(gancho_y) if gancho_y > 0 else 0.0
        if gancho_largura is not None:
            short.gancho_largura = (
                gancho_short.normalizar_largura(gancho_largura) if gancho_largura > 0 else 0.0
            )


def _aplicar_moldura(short: Short, moldura: str | None) -> None:
    if moldura is not None:
        if moldura not in {m.value for m in Moldura}:
            raise ValueError(f"Moldura {moldura!r} nao existe.")
        short.moldura = moldura


def _aplicar_palco(
    short: Short,
    *,
    palco_preset: str | None,
    ajustes_palco: dict | None,
    recortes_palco: dict | None,
    fundo_editorial: str | None,
) -> None:
    if palco_preset is not None:
        # "" volta a herdar do corte. Nao validamos a existencia do preset
        # aqui: quem resolve a cascata ja ignora id que nao acha, e recusar
        # aqui exigiria uma consulta so para dizer o que a tela ja sabe.
        short.palco_preset = palco_preset

    if ajustes_palco is not None:
        # Dicionario VAZIO e valido: e como o operador desfaz os ajustes e
        # volta ao modelo. Guardar so o que veio mantem a heranca parcial —
        # materializar os slots do modelo aqui congelaria o arranjo.
        short.ajustes_palco = json.dumps(
            {
                nome: {c: float(ret[c]) for c in "xywh"}
                for nome, ret in ajustes_palco.items()
                if isinstance(ret, dict) and all(c in ret for c in "xywh")
            },
            ensure_ascii=False,
        )

    if recortes_palco is not None:
        # D-499: o recorte sobre o quadro-FONTE, em pixels do bruto. Mesma
        # regra do `ajustes_palco`: vazio desfaz e volta ao preset, e o que
        # nao vier continua herdando — materializar as regioes do preset
        # aqui congelaria a heranca, e trocar de preset depois nao mudaria
        # mais nada.
        short.recortes_palco = json.dumps(
            {
                nome: {c: float(ret[c]) for c in "xywh"}
                for nome, ret in recortes_palco.items()
                if isinstance(ret, dict) and all(c in ret for c in "xywh")
            },
            ensure_ascii=False,
        )

    if fundo_editorial is not None:
        # O id da textura. "" volta ao default do canal. Nao validamos
        # contra o catalogo pelo mesmo motivo do `fundo_palco`: o catalogo
        # muda com o tema, e um short antigo apontando para uma textura que
        # saiu deve cair no default em vez de virar erro de gravacao.
        short.fundo_editorial = fundo_editorial


def _aplicar_legenda(
    short: Short,
    *,
    legenda_cor: str | None,
    legenda_fonte: str | None,
    legenda_x: float | None,
    legenda_y: float | None,
    legenda_largura: float | None,
) -> None:
    if legenda_cor is not None:
        # D-563: o hex da palavra corrente. "" volta ao acento do canal.
        # Mesma regra dos outros: nao validamos aqui, degrada na leitura.
        short.legenda_cor = legenda_cor

    if legenda_fonte is not None:
        # A familia da fonte. "" volta a do canal. Idem: degrada na leitura.
        short.legenda_fonte = legenda_fonte

    if legenda_x is not None or legenda_y is not None or legenda_largura is not None:
        # D-605: os tres andam juntos porque sao UM gesto — o operador
        # arrasta a legenda na previa e solta. Mandar so `y` num PATCH e
        # legitimo (e o caso comum: "sobe essa legenda"), mas separa-los em
        # tres blocos sugeriria que ha tres decisoes onde ha uma.
        #
        # 0 continua sendo "nao decidi": e assim que "voltar ao lugar do
        # palco" devolve o trecho a heranca, sem coluna extra de intencao.
        if legenda_x is not None:
            short.legenda_x = legenda_short.normalizar_x(legenda_x) if legenda_x > 0 else 0.0
        if legenda_y is not None:
            short.legenda_y = legenda_short.normalizar_y(legenda_y) if legenda_y > 0 else 0.0
        if legenda_largura is not None:
            short.legenda_largura = (
                legenda_short.normalizar_largura(legenda_largura) if legenda_largura > 0 else 0.0
            )


def _aplicar_marca_do_preset(
    short: Short, palco_short_preset: str | None, campos_do_palco: tuple
) -> None:
    # D-552: a marca do preset e escrita PRIMEIRO e apagada por qualquer
    # mudanca posterior no mesmo PATCH.
    #
    # Aplicar um preset manda tudo junto — a marca e os valores dela. Mexer
    # no arranjo depois manda so o arranjo, e ai a marca precisa cair: um
    # rotulo que sobrevive a edicao do que ele descreve passa a mentir, e
    # mentir sobre a origem e pior que nao dizer nada.
    if palco_short_preset is not None:
        short.palco_short_preset = palco_short_preset
    elif any(campo is not None for campo in campos_do_palco):
        short.palco_short_preset = ""


def _aplicar_arranjo(
    short: Short,
    *,
    fundo_palco: str | None,
    arranjo_palco: str | None,
    janela_cheia: str | None,
) -> None:
    if fundo_palco is not None:
        # A CHAVE da paleta, nao a cor. "" volta ao default do canal. Nao
        # validamos contra a paleta: ela pode mudar, e um short antigo
        # apontando para uma cor que saiu do tema deve cair no default
        # (o resolvedor faz isso) em vez de virar erro de gravacao.
        short.fundo_palco = fundo_palco

    if arranjo_palco is not None:
        # "" e valido: volta ao automatico, que deduz das regioes. Uma chave
        # desconhecida NAO e — ela viraria um palco silenciosamente diferente
        # do que a tela mostra (mesma regra que o modelo antigo tinha).
        if arranjo_palco and arranjo_de_chave(arranjo_palco).chave != arranjo_palco:
            raise ValueError(f"Arranjo {arranjo_palco!r} nao existe.")
        short.arranjo_palco = arranjo_palco

    if janela_cheia is not None:
        # Sem validar contra as regioes: elas mudam com o preset, e o
        # resolvedor ja cai numa regiao disponivel quando a escolhida sumiu.
        short.janela_cheia = janela_cheia


def _fala_do_short(short: Short, transcricao: list[dict]) -> list[dict]:
    """A fala que o short REALMENTE contem, na ordem em que ela toca (D-604).

    Um lugar so, usado pelas cenas, pelo gancho, pelo post e pela etiqueta da
    capa. Sem isto cada consumidor recortaria `[inicio, fim]` por conta propria e
    levaria a fala do BURACO — o material que o operador tirou fora. O sintoma
    nao seria erro: seria o modelo prometendo um assunto que o video nao contem.
    """
    fatias = segmentos_short.de_json(short.segmentos)
    janelas = [
        (segmento.inicio_seg, segmento.fim_seg, offset)
        for segmento, offset in segmentos_short.com_offsets(
            fatias, inicio_seg=float(short.inicio_seg), fim_seg=float(short.fim_seg)
        )
    ]
    return recortar_transcricao_varios(transcricao, janelas)


def _duracao_do_short(short: Short) -> float:
    """Quanto tempo de VIDEO o short tem. Com colagem, a soma; sem, o span."""
    return segmentos_short.duracao_liquida(
        segmentos_short.de_json(short.segmentos),
        inicio_seg=float(short.inicio_seg),
        fim_seg=float(short.fim_seg),
    )


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
    """Todos os shorts do corte, do melhor palpite ao pior.

    Cada item leva tambem o `foco_efetivo` — o enquadramento que o render vai
    usar de fato. Sem ele a tela nao teria de onde partir para ajustar: o
    `foco_x` e NULL enquanto o operador nao discordou do layout.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        shorts = (
            await db.scalars(
                select(Short)
                .where(Short.corte_id == corte_id)
                .order_by(Short.score.desc(), Short.numero.asc())
            )
        ).all()
        return [_serializar(short, corte) for short in shorts]


async def indicar_para_shorts(corte_id: str, indicado: bool = True) -> dict:
    """Marca o corte como candidato a short, sem tocar no Fire (D-502).

    Cria o `MetadadoCorte` se ainda nao existe: um corte que nunca passou pela
    etapa de metadados tambem pode ter um trecho bom, e exigir que ele passe
    antes seria uma dependencia inventada.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")

        metadado = corte.metadado
        if metadado is None:
            # D-666: o mesmo crédito que o default do model gravava.
            metadado = MetadadoCorte(
                id=str(uuid.uuid4()),
                corte_id=corte_id,
                canal_credito=channels.identidade_do_canal_ativo().credito,
            )
            db.add(metadado)

        metadado.candidato_shorts = bool(indicado)
        await db.commit()

    logger.info(
        "[Shorts] corte=%s %s a fabrica de shorts",
        corte_id[:8],
        "indicado para" if indicado else "removido da",
    )
    return await elegibilidade(corte_id)


async def marcar_finalizado(corte_id: str, finalizado: bool = True) -> dict:
    """Declara (ou desfaz) que os shorts do corte ja subiram para todas as redes (D-593).

    Marcar de novo um corte ja finalizado NAO renova a data: o carimbo responde
    "quando eu fechei", e um segundo clique distraido reescreveria a resposta.
    Reabrir apaga o carimbo e devolve o corte a fila.

    Levanta `LookupError` quando o corte nao existe.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")

        if not finalizado:
            corte.shorts_finalizados_em = None
        elif corte.shorts_finalizados_em is None:
            corte.shorts_finalizados_em = datetime.utcnow()
        await db.commit()
        carimbo = corte.shorts_finalizados_em

    logger.info(
        "[Shorts] corte=%s %s", corte_id[:8], "finalizado" if carimbo else "reaberto na fila"
    )
    return {"corte_id": corte_id, "finalizado_em": carimbo.isoformat() if carimbo else None}


async def elegibilidade(corte_id: str) -> dict:
    """O que a tela do bruto precisa saber para oferecer (ou nao) a fabrica.

    Levanta `LookupError` quando o corte nao existe.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")
        total = await db.scalar(
            select(func.count()).select_from(Short).where(Short.corte_id == corte_id)
        )
        indicado = bool(corte.metadado.candidato_shorts) if corte.metadado else False
        return {
            "is_fire": bool(corte.metadado.is_fire) if corte.metadado else False,
            "candidato_shorts": indicado,
            # D-502: a fabrica abre para Fire OU para indicacao manual. Sao
            # julgamentos diferentes: o Fire e sobre o corte, a indicacao e
            # sobre um trecho dele.
            "elegivel": (bool(corte.metadado.is_fire) if corte.metadado else False) or indicado,
            "tem_bruto": _bruto_em_disco(corte) is not None,
            "total_shorts": int(total or 0),
        }


async def sugerir_shorts(corte_id: str, provider: ProviderIA = "claude") -> dict:
    """Propõe os trechos verticais do bruto recém-gerado e os persiste (D-454).

    Roda sobre `Corte.transcricao_final` — a transcrição já sem os desvios e
    com os tempos **rebaseados na timeline do bruto**. É desse arquivo que o
    short será recortado, então é nesse relógio que os candidatos nascem.

    Levanta `LookupError` (corte inexistente) ou `ValueError` (sem transcrição
    final). Quem chama no fluxo automático trata a falha como não-fatal: a
    sugestão de shorts é derivada do bruto, não parte da entrega dele.
    """
    from app.domain.short.shorts import FaixaShort, normalizar_sugestoes

    contexto = await montar_contexto(corte_id)
    faixa = FaixaShort(
        duracao_min_seg=settings.shorts_duracao_min_seg,
        duracao_max_seg=settings.shorts_duracao_max_seg,
        quantidade_min=settings.shorts_quantidade_min,
        quantidade_max=settings.shorts_quantidade_max,
    )

    skill = editorial_skills.resolver_skill(_SKILL_SHORTS)
    scaffold = editorial_scaffolds.resolver_scaffold("shorts")
    prompt = scaffold.format(
        titulo=contexto.titulo,
        tema_central=contexto.tema_central,
        duracao_humana=seg_to_hms_short(contexto.duracao_seg),
        quantidade_alvo=faixa.quantidade_humana,
        faixa_duracao=faixa.duracao_humana,
        texto_transcricao=contexto.texto_transcricao,
    )
    registrar_skill_usada(_SKILL_SHORTS, skill, scaffold)
    resposta = await gerar_json(
        provider,
        prompt,
        skill,
        _SKILL_SHORTS,
        projeto_id=contexto.projeto_id,
        corte_id=corte_id,
    )
    resultado = normalizar_sugestoes(resposta, duracao_bruto_seg=contexto.duracao_seg, faixa=faixa)
    shorts = await registrar_sugestoes(contexto, resultado)
    return {"shorts": shorts, "descartes": resultado.descartes}


async def sugerir_cenas(short_id: str, provider: ProviderIA = "claude") -> dict:
    """Propõe os cartões que entram por cima de UM trecho vertical (D-497).

    No horizontal a IA propõe as cenas desde sempre; aqui o painel da D-494
    só sabia criar à mão. A skill é OUTRA (`cenas-short-expert`) porque o
    repertório é outro: lá são fichas e ênfases num vídeo de dez minutos,
    aqui são quatro cartões disputando trinta segundos de tela vertical, com
    a legenda queimada embaixo.

    As cenas voltam GRAVADAS, substituindo as que existiam. Propor sem
    gravar deixaria o operador com uma lista que ele teria de reescrever à
    mão para usar; e o que existia antes é ou vazio (o caso comum) ou um
    palpite anterior da própria IA. Um short com cenas escritas à mão só
    chega aqui se o operador pedir de novo — e aí ele pediu.

    Levanta `LookupError` (short inexistente) ou `ValueError` (trecho sem
    transcrição). Devolve o short atualizado e os descartes, que são o que
    explica por que a IA falou em cinco cenas e a tela mostra três.
    """
    from app.domain.short.cenas_short import TipoCenaShort
    from app.domain.short.cenas_short_ia import normalizar_sugestoes as normalizar_cenas

    contexto = await montar_contexto_de_cenas(short_id)

    skill = editorial_skills.resolver_skill(_SKILL_CENAS_SHORT)
    scaffold = editorial_scaffolds.resolver_scaffold("cenas-short")
    prompt = scaffold.format(
        titulo=contexto.titulo,
        gancho=contexto.gancho,
        duracao_humana=f"{contexto.duracao_seg:.0f} segundos",
        tipos_disponiveis=", ".join(t.value for t in TipoCenaShort),
        texto_transcricao=contexto.texto_transcricao,
    )
    registrar_skill_usada(_SKILL_CENAS_SHORT, skill, scaffold)
    resposta = await gerar_json(
        provider,
        prompt,
        skill,
        _SKILL_CENAS_SHORT,
        projeto_id=contexto.projeto_id,
        corte_id=contexto.corte_id,
        short_id=short_id,
    )
    resultado = normalizar_cenas(resposta, duracao_short=contexto.duracao_seg)
    short = await definir_cenas(short_id, [cena.para_json() for cena in resultado.cenas])
    logger.info(
        "[Shorts] cenas IA short=%s aceitas=%d descartadas=%d",
        short_id[:8],
        len(resultado.cenas),
        len(resultado.descartes),
    )
    return {"short": short, "descartes": resultado.descartes}


async def sugerir_ganchos(short_id: str, provider: ProviderIA = "claude") -> list[str]:
    """As variacoes do texto que abre o short (D-565).

    Skill separada da capa do TikTok, e nao um parametro dela, porque as duas
    escrevem coisas de generos opostos. La sao 2-3 palavras que NOMEIAM o
    assunto numa prateleira onde nove capas sao vistas juntas, e repetir da
    coerencia. Aqui e uma frase de 4-7 palavras que ABRE uma pergunta em quem
    esta com o dedo em movimento — e repetir, no feed, parece robo.

    A base e a transcricao do TRECHO, nao o resumo do corte: o gancho promete,
    e a promessa tem de estar no que este short mostra.

    NAO grava nada. As variacoes vao para a tela e o operador escolhe uma,
    escreve a dele, ou ignora todas — a decisao editorial continua sendo
    humana, e gravar por conta propria tiraria dele a chance de comparar.

    Levanta `LookupError` (short inexistente) e `ValueError` (trecho sem
    fala). Lista vazia quando o modelo nao produziu nada aproveitavel.
    """
    from app.domain.short.gancho_short import MAX_VARIACOES, ganchos_da_resposta

    contexto = await montar_contexto_do_gancho(short_id)

    skill = editorial_skills.resolver_skill(_SKILL_GANCHO_SHORT)
    scaffold = editorial_scaffolds.resolver_scaffold("gancho-short")
    prompt = scaffold.format(
        titulo_proposto=contexto.titulo,
        tema_central=contexto.tema_central,
        duracao_seg=contexto.duracao_seg,
        texto_transcricao=contexto.texto_transcricao,
        gancho_da_curadoria=contexto.gancho_da_curadoria,
        ganchos_recentes=contexto.ganchos_recentes,
        quantidade=MAX_VARIACOES,
    )
    registrar_skill_usada(_SKILL_GANCHO_SHORT, skill, scaffold)
    bruto = await gerar_texto(
        provider,
        prompt,
        skill,
        _SKILL_GANCHO_SHORT,
        projeto_id=contexto.projeto_id,
        corte_id=contexto.corte_id,
        short_id=short_id,
    )
    # O historico vai ao prompt E ao parser: um pede, o outro garante.
    variacoes = ganchos_da_resposta(bruto, ja_usados=contexto.ganchos_gastos)
    logger.info(
        "[Shorts] ganchos IA short=%s variacoes=%d",
        short_id[:8],
        len(variacoes),
    )
    return variacoes


async def localizar_arquivo(short_id: str, estagio: str) -> tuple[str, str, Path]:
    """O MP4 do short — a prévia ou o final — como (projeto, caminho relativo, arquivo).

    D-483: uma prévia que não se pode ver não serve para nada; a rota que a
    serve nasce junto com ela. D-706: a busca saiu do router.
    """
    if estagio not in {"previa", "final"}:
        raise NaoEncontrado(f"Estagio {estagio!r} desconhecido.")
    async with AsyncSessionLocal() as db, db.begin():
        short, corte = await _short_e_corte(db, short_id)
        relativo = short.arquivo_short_path if estagio == "final" else short.arquivo_previa_path
        projeto_id = corte.projeto_id
    if not relativo:
        raise NaoEncontrado(f"Este short ainda nao tem {estagio}.")
    caminho = resolver_do_projeto(relativo, projeto_id)
    if not caminho.is_file():
        raise NaoEncontrado("O arquivo foi registrado mas nao esta mais em disco.")
    return projeto_id, relativo, caminho


async def localizar_capa(short_id: str) -> Path:
    """O arquivo da capa do short (D-706: a busca saiu do router)."""
    async with AsyncSessionLocal() as db, db.begin():
        _short, corte = await _short_e_corte(db, short_id)
        meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == short_id))
        relativo = meta.capa_path if meta else ""
        projeto_id = corte.projeto_id
    if not relativo:
        raise NaoEncontrado("Este short ainda nao tem capa.")
    caminho = resolver_do_projeto(relativo, projeto_id)
    if not caminho.is_file():
        raise NaoEncontrado("A capa foi registrada mas nao esta mais em disco.")
    return caminho


async def _short_e_corte(db: AsyncSession, short_id: str) -> tuple[Short, Corte]:
    short = await db.get(Short, short_id)
    if not short:
        raise NaoEncontrado("Short nao encontrado")
    corte = await db.get(Corte, short.corte_id)
    if not corte:
        raise NaoEncontrado("Corte do short nao encontrado")
    return short, corte


async def exigir_video_da_live(corte_id: str) -> None:
    """O bruto sai da live; sem ela em disco, o FFmpeg falharia sem explicar (D-528).

    Vale para o caminho implícito — pedir sugestões num corte sem bruto regera o
    bruto de carona. O caminho explícito da tela nem chega aqui: ela desabilita o
    botão quando `live_em_disco` é falso, que é a regra da D-495 (não oferecer o
    que o backend vai recusar).
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")
        projeto = await db.get(Projeto, corte.projeto_id)
        if not projeto:
            raise LookupError(f"Projeto {corte.projeto_id!r} nao encontrado")

        em_disco = (
            bool(projeto.arquivo_video_path)
            and resolver_do_projeto(projeto.arquivo_video_path, projeto.id).is_file()
        )

    if not em_disco:
        raise ValueError(
            "O video desta live foi limpo do disco. Baixe a live de novo no workspace "
            "e depois gere o bruto."
        )


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
                # D-502: Fire OU indicado a mao — dois caminhos para a mesma fila.
                .where(or_(MetadadoCorte.is_fire, MetadadoCorte.candidato_shorts))
                .order_by(Corte.atualizado_em.desc())
            )
        ).all()

        fires = []
        for corte, projeto in linhas:
            bruto = _bruto_em_disco(corte)
            # D-502: corte SEM bruto tambem entra, e nao e mais pulado.
            #
            # A regra antiga ("sem bruto nao ha o que recortar") descrevia um
            # beco sem saida que deixou de existir: a fabrica sabe regerar o
            # bruto sem tocar na pos-producao (D-472). Esconder o corte aqui
            # obrigava o operador a voltar ao editor, regerar, e so entao vir —
            # trabalho que a propria tela pode oferecer.
            fires.append(_descrever_fire(corte, projeto, bruto))

        if fires:
            ids = [f["corte_id"] for f in fires]
            contagens = await _contar_shorts_por_corte(db, ids)
            edicoes = await _edicao_por_corte(db, ids)
            for fire in fires:
                fire["shorts"] = contagens.get(fire["corte_id"], _CONTAGEM_VAZIA.copy())
                fire["tem_edicao"] = edicoes.get(fire["corte_id"], False)

    return fires


def _bruto_em_disco(corte: Corte) -> Path | None:
    """O arquivo do bruto, ou `None` se o ponteiro nao aponta para nada."""
    if not corte.arquivo_clip_path:
        return None
    caminho = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
    return caminho if caminho.is_file() else None


def _descrever_fire(corte: Corte, projeto: Projeto, bruto: Path | None) -> dict:
    return {
        "corte_id": corte.id,
        "projeto_id": projeto.id,
        "projeto_titulo": projeto.titulo_live or "",
        "numero": corte.numero,
        "titulo": corte.titulo_proposto or "",
        "tema_central": corte.tema_central or "",
        "duracao_seg": round(float(corte.duracao_clip_seg or 0.0), 2),
        # Sem bruto, 0 MB e `tem_bruto` falso — a tela mostra "gerar bruto" no
        # lugar de "descartar", e nao finge um tamanho que nao existe.
        "tem_bruto": bruto is not None,
        "bruto_mb": round(bruto.stat().st_size / 1_000_000, 1) if bruto else 0.0,
        "is_fire": bool(corte.metadado.is_fire) if corte.metadado else False,
        "indicado": bool(corte.metadado.candidato_shorts) if corte.metadado else False,
        # D-503: so ha o que publicar no TikTok quando o MP4 final existe. Sem
        # isto a tela ofereceria um botao que o backend recusa — o mesmo defeito
        # que a D-495 corrigiu no seletor de arranjo.
        "tem_video_final": _video_final_em_disco(corte),
        # D-528: sem a live nao ha de onde extrair o bruto. A tela usa isto para
        # desabilitar o botao e dizer o que fazer, em vez de deixar o operador
        # descobrir no clique — mesma regra da D-495.
        "live_em_disco": _live_em_disco(projeto),
        # D-581: preenchido depois, junto das contagens — uma consulta para a
        # lista inteira em vez de uma por Fire.
        "tem_edicao": False,
        # D-593: o corte cujos shorts ja subiram para todas as redes. Continua
        # na lista (o operador pode reabrir), e a tela o tira da fila.
        "finalizado_em": (
            corte.shorts_finalizados_em.isoformat() if corte.shorts_finalizados_em else None
        ),
    }


def _live_em_disco(projeto: Projeto) -> bool:
    """Se o vídeo da live ainda está no disco — a matéria-prima do bruto."""
    if not projeto.arquivo_video_path:
        return False
    return resolver_do_projeto(projeto.arquivo_video_path, projeto.id).is_file()


def _video_final_em_disco(corte: Corte) -> bool:
    """Se o MP4 de publicacao do corte existe.

    Espelha o caminho que `publicacao_destinos.montar_contexto_do_corte` exige;
    aqui a pergunta e so "da para oferecer o botao?".
    """
    caminho = projetos_dir() / corte.projeto_id / "cortes" / corte.id / "upload_ready" / "video.mp4"
    return caminho.is_file()


async def _edicao_por_corte(db: AsyncSession, corte_ids: list[str]) -> dict[str, bool]:
    """Em quais cortes a MAO HUMANA ja passou — o filtro "onde eu parei" (D-581).

    A pergunta que o operador faz ao abrir a tela nao e "quantos candidatos a IA
    propos", e sim "em qual destes eu estava trabalhando". Sao coisas diferentes:
    um corte com dez sugestoes e nenhuma decisao esta intocado, e um corte com
    uma sugestao e um gancho escrito esta no meio do caminho.

    Por isso a conta olha para os sinais que SO existem se alguem agiu:

      - o candidato foi julgado (qualquer status que nao seja `sugerido`);
      - o trecho foi marcado a mao (`origem = manual`);
      - o gancho da abertura foi escrito;
      - o palco deste trecho foi mexido — arranjo, recorte, ajuste, textura,
        preset aplicado ou cor/fonte da legenda.

    Nenhum deles nasce preenchido pela geracao: `registrar_sugestoes` cria o
    candidato com status `sugerido`, origem `ia` e os campos de palco vazios.

    Uma consulta so, pela mesma razao do `_contar_shorts_por_corte`: a tela abre
    com a lista inteira, e uma query por Fire viraria lentidao no primeiro uso.
    """
    tocado = or_(
        Short.status != StatusShort.SUGERIDO,
        Short.origem == "manual",
        func.coalesce(Short.gancho_tela, "") != "",
        func.coalesce(Short.arranjo_palco, "") != "",
        func.coalesce(Short.palco_short_preset, "") != "",
        func.coalesce(Short.fundo_editorial, "") != "",
        func.coalesce(Short.legenda_cor, "") != "",
        func.coalesce(Short.recortes_palco, "{}") != "{}",
        func.coalesce(Short.ajustes_palco, "{}") != "{}",
    )
    linhas = (
        await db.execute(
            select(Short.corte_id, func.max(case((tocado, 1), else_=0)))
            .where(Short.corte_id.in_(corte_ids))
            .group_by(Short.corte_id)
        )
    ).all()
    return {corte_id: bool(marca) for corte_id, marca in linhas}


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
    """Primeiro número livre acima dos shorts que a regeração NÃO apaga.

    Sobrevivem os já curados E os manuais (D-484). Contar só os curados daria um
    número que já pertence a um short manual, e dois candidatos do mesmo corte
    passariam a se chamar "#3".
    """
    maior = await db.scalar(
        select(func.max(Short.numero))
        .where(Short.corte_id == corte_id)
        .where(~and_(Short.status == StatusShort.SUGERIDO, Short.origem == ORIGEM_IA))
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


def foco_efetivo(short: Short, corte: Corte | None) -> float:
    """O `foco_x` que o recorte vai usar: o do operador, ou o derivado do layout.

    O default nao e o meio do quadro: e a FACECAM. Num short vertical quem
    carrega o video e a pessoa falando, e centralizar no meio deixa o rosto na
    borda sempre que a facecam vive num canto — o normal numa live.
    """
    if short.foco_x is not None:
        return float(short.foco_x)
    return foco_de_regiao(_primeira_facecam(corte))


def _primeira_facecam(corte: Corte | None) -> dict | None:
    """O `crop_facecam` da primeira regiao do layout do corte, se houver."""
    if corte is None:
        return None
    try:
        layout = json.loads(corte.layout_youtube or "{}")
    except json.JSONDecodeError:
        return None
    regioes = layout.get("regioes") if isinstance(layout, dict) else None
    if not isinstance(regioes, list) or not regioes:
        return None
    primeira = regioes[0]
    return primeira.get("crop_facecam") if isinstance(primeira, dict) else None


def _serializar(short: Short, corte: Corte | None = None) -> dict:
    return {
        "id": short.id,
        "corte_id": short.corte_id,
        "numero": short.numero,
        "titulo": short.titulo_sugerido,
        "gancho": short.gancho,
        # D-565: o gancho de TELA, que e outro texto — ver o comentario da
        # coluna em `models.Short`. O `gancho` acima segue sendo o da curadoria.
        "gancho_tela": short.gancho_tela,
        # D-573: as propostas da IA viajam com o short — assim reabrir o modal
        # encontra o que a ultima geracao produziu, em vez de uma tela limpa.
        "gancho_sugestoes": _json_textos(short.gancho_sugestoes),
        "gancho_ate_seg": short.gancho_ate_seg,
        "gancho_cor": short.gancho_cor or "",
        "gancho_realce": short.gancho_realce or "",
        # D-600: onde a caixa senta neste trecho. 0 = do padrao do corte.
        "gancho_x": short.gancho_x or 0.0,
        "gancho_y": short.gancho_y or 0.0,
        "gancho_largura": short.gancho_largura or 0.0,
        "inicio_seg": short.inicio_seg,
        "fim_seg": short.fim_seg,
        # D-604: as fatias do bruto que este short toca, na ordem de toque. Lista
        # vazia = a janela unica acima, que e o caso normal.
        "segmentos": [s.para_dict() for s in segmentos_short.de_json(short.segmentos)],
        # A duracao e a LIQUIDA — o que a tela quer dizer quando pergunta "quanto
        # dura este short". Com buraco no meio, `fim - inicio` mentiria.
        "duracao_seg": round(_duracao_do_short(short), 2),
        # E o span, para quem precisa de "de onde a onde no bruto" — a regua
        # desenha o envelope e os segmentos dentro dele.
        "envelope_seg": round(float(short.fim_seg) - float(short.inicio_seg), 2),
        "score": short.score,
        "justificativa": short.justificativa,
        "status": short.status,
        "foco_x": short.foco_x,
        "foco_efetivo": foco_efetivo(short, corte),
        "arquivo_short_path": short.arquivo_short_path,
        "arquivo_previa_path": short.arquivo_previa_path,
        "arranjo_palco": short.arranjo_palco,
        "janela_cheia": short.janela_cheia,
        "palco_preset": short.palco_preset,
        "moldura": short.moldura,
        "ajustes_palco": _json_dict_seguro(short.ajustes_palco),
        "recortes_palco": _json_dict_seguro(short.recortes_palco),
        "fundo_palco": short.fundo_palco,
        "fundo_editorial": short.fundo_editorial,
        "legenda_cor": short.legenda_cor,
        "legenda_fonte": short.legenda_fonte,
        # D-605: onde a legenda senta neste trecho. 0 = do palco padrao do corte.
        "legenda_x": short.legenda_x or 0.0,
        "legenda_y": short.legenda_y or 0.0,
        "legenda_largura": short.legenda_largura or 0.0,
        "palco_short_preset": short.palco_short_preset,
        "origem": short.origem,
        "cenas": _json_lista(short.cenas_remotion),
    }


def _json_dict_seguro(bruto: str | None) -> dict:
    try:
        dados = json.loads(bruto or "{}")
    except json.JSONDecodeError:
        return {}
    return dados if isinstance(dados, dict) else {}


def _json_textos(bruto: str | None) -> list[str]:
    """Uma lista de STRINGS, descartando o que nao for.

    D-573: a tela chama `.trim()` em cada item. Um objeto entre eles derruba a
    pagina inteira com "texto.trim is not a function" — nao so o modal, a rota
    toda. Garantir o tipo na leitura e a mesma regra do `fundo_editorial` na
    D-554: o que esta gravado degrada, nunca quebra.
    """
    try:
        dados = json.loads(bruto or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(dados, list):
        return []
    return [item for item in dados if isinstance(item, str) and item.strip()]


async def gravar_sugestoes_de_gancho(short_id: str, variacoes: list[str]) -> None:
    """Guarda o que a IA acabou de propor, sem escolher nada (D-573)."""
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            return
        short.gancho_sugestoes = json.dumps(
            [v for v in variacoes if isinstance(v, str) and v.strip()],
            ensure_ascii=False,
        )
        await db.commit()


def _json_lista(bruto: str | None) -> list[dict]:
    try:
        dados = json.loads(bruto or "[]")
    except json.JSONDecodeError:
        return []
    return dados if isinstance(dados, list) else []
