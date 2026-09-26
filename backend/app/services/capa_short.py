"""O quadro de capa de um short (D-565, onda 4).

Extrai um frame do MP4 que o render ja produziu e grava o caminho no
`MetadadoShort`. E so isso — e e de proposito.

## Por que nao ha montagem aqui

A capa do corte (`services/capa_tiktok.py`) monta tres faixas, pede uma arte a
um gerador de imagem e desenha a tipografia do canal por cima. Tudo aquilo existe
porque o video do corte e DEITADO: um frame 16:9 viraria uma faixa fina dentro do
quadro vertical, e o conteudo dele (slide, documento, navegador) nao sobrevive a
miniatura da grade.

O short e o caso oposto. Ele ja e 9:16, ja preenche o quadro, ja tem o palco e a
moldura do canal, e — desde a onda 1 desta demanda — ja tem o gancho escrito em
cima nos primeiros segundos. O quadro dele E a capa; o trabalho aqui e so
escolher QUAL.

## O escalonamento

Nenhum. O MP4 do short e 1080x1920 e a capa e 1080x1920: `-frames:v 1` basta.
O `scale`+`crop` agressivo da capa do corte existe para converter 16:9 em 4:5, e
aplica-lo aqui so introduziria reamostragem sem ganho.

Falhar aqui nao derruba nada a montante: quem chama recebe o erro e a tela diz
que nao deu, porque uma capa que some calada e pior que capa nenhuma (D-384).
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from app.core.channel_paths import para_relativo_ao_projeto, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.compartilhado.provider_ia import ProviderIA
from app.domain.compartilhado.time_convert import seg_to_mmss
from app.domain.short import segmentos_short
from app.domain.short.capa_short import (
    encaixar_instante,
    instante_padrao,
    prompt_da_capa,
    texto_da_capa,
)
from app.domain.short.cenas_short_ia import recortar_transcricao_varios
from app.infrastructure.ffmpeg_runner import run_ffmpeg_simple
from app.models import Corte, MetadadoCorte, MetadadoShort, Short
from app.services.canal import editorial_scaffolds, editorial_skills
from app.services.claude_ia import gerar_texto, registrar_skill_usada
from sqlalchemy import select

logger = logging.getLogger(__name__)

_SKILL_CAPA_SHORT = "capa-short-imagem-expert"

NOME_DA_CAPA = "capa.jpg"

# D-581: os formatos que a arte da capa pode chegar. Curto de proposito — o
# que nao esta aqui o navegador tambem nao desenharia como poster do <video>.
EXTENSOES_DA_ARTE = {".jpg", ".jpeg", ".png", ".webp"}


class CapaShortError(RuntimeError):
    """A capa nao saiu. A mensagem chega a tela — capa calada e pior que nenhuma."""


@dataclass(frozen=True)
class CapaDoShort:
    """O quadro gravado, e de onde ele saiu."""

    caminho_relativo: str
    instante_seg: float

    def como_dict(self) -> dict:
        return {
            "capa_path": self.caminho_relativo,
            "instante_seg": self.instante_seg,
            "tem_capa": bool(self.caminho_relativo),
        }


async def obter(short_id: str) -> dict:
    """A capa gravada deste short, com o instante SUGERIDO quando nao ha nenhuma.

    O instante sugerido ja vem calculado para a tela abrir no lugar certo: no
    meio do gancho quando ele existe, no primeiro terco quando nao.

    Levanta `LookupError` quando o short nao existe.
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")

        meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == short_id))
        duracao = _duracao(short)
        gravado = meta.capa_path if meta else ""

        return {
            "capa_path": gravado,
            "instante_seg": (
                meta.capa_instante_seg
                if meta and gravado
                else instante_padrao(duracao, float(short.gancho_ate_seg or 0.0))
            ),
            "tem_capa": bool(gravado),
            "duracao_seg": duracao,
            # A tela desenha o gancho por cima da previa quando o instante cai
            # dentro dele — e assim o operador ve a capa como ela sai.
            "gancho_ate_seg": float(short.gancho_ate_seg or 0.0),
        }


async def gerar(short_id: str, instante_seg: float | None = None) -> dict:
    """Tira o quadro no instante pedido e grava o caminho.

    `instante_seg` ausente usa o padrao — o meio do gancho, ou o primeiro terco.

    Levanta `LookupError` (short ou corte inexistente), `ValueError` (short ainda
    sem MP4 final) e `CapaShortError` (o FFmpeg nao entregou o arquivo).
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        if not short.arquivo_short_path:
            raise ValueError("Este short ainda nao foi renderizado — sem MP4 nao ha de onde tirar.")
        video = resolver_do_projeto(short.arquivo_short_path, corte.projeto_id)
        if not video.is_file():
            raise ValueError("O arquivo do short nao esta mais em disco.")

        duracao = _duracao(short)
        instante = (
            encaixar_instante(instante_seg, duracao)
            if instante_seg is not None
            else instante_padrao(duracao, float(short.gancho_ate_seg or 0.0))
        )
        projeto_id = corte.projeto_id

    destino = video.parent / NOME_DA_CAPA
    await _extrair_frame(video, destino, instante)

    async with AsyncSessionLocal() as db:
        meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == short_id))
        if not meta:
            meta = MetadadoShort(id=str(uuid.uuid4()), short_id=short_id)
            db.add(meta)
        meta.capa_path = para_relativo_ao_projeto(destino, projeto_id)
        meta.capa_instante_seg = instante
        await db.commit()
        resultado = CapaDoShort(meta.capa_path, meta.capa_instante_seg)

    logger.info("[CapaShort] short=%s instante=%.2fs -> %s", short_id[:8], instante, destino.name)
    return resultado.como_dict()


def _duracao(short: Short) -> float:
    """A duracao do VIDEO do short — a soma dos segmentos, nao o span (D-604).

    O instante da capa vive no tempo do SHORT (o frame sai do MP4 dele), entao
    encaixa-lo contra o envelope deixaria a tela oferecer um instante que o
    arquivo nao tem: num short de 0-30 + 45-60, o segundo 50 nao existe.
    """
    return round(
        segmentos_short.duracao_liquida(
            segmentos_short.de_json(short.segmentos),
            inicio_seg=float(short.inicio_seg),
            fim_seg=float(short.fim_seg),
        ),
        2,
    )


async def _extrair_frame(video: Path, destino: Path, instante: float) -> None:
    """Um quadro do short, do tamanho que ele ja tem.

    Sem `scale` nem `crop`: a origem e o destino sao 1080x1920, e reamostrar um
    quadro para o mesmo tamanho so perderia nitidez.

    `-ss` antes do `-i` e seek por keyframe — precisao de quadro nao importa numa
    capa, e o seek exato leria o arquivo inteiro ate o instante.
    """
    destino.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{max(0.0, instante):.3f}",
        "-i",
        str(video),
        "-frames:v",
        "1",
        "-q:v",
        "2",
        str(destino),
    ]
    try:
        await run_ffmpeg_simple(cmd, label="capa-short-frame")
    except RuntimeError as exc:
        raise CapaShortError(f"Nao consegui tirar o quadro do short: {exc}") from exc

    if not destino.is_file():
        raise CapaShortError("O FFmpeg terminou sem escrever o quadro.")


# ─── D-581: a capa DESENHADA, e não recortada do vídeo ─────────────────────
#
# A onda 4 da D-565 decidiu que a capa do short é um QUADRO do próprio short, e
# a razão era boa: diferente do corte (deitado, cheio de texto na tela), o short
# já nasce 9:16 com o palco e a moldura do canal em volta.
#
# Isso continua verdade, e este caminho não substitui aquele — os dois convivem.
# O que mudou é que "o melhor quadro do vídeo" e "a melhor capa" nem sempre são
# a mesma coisa: numa grade de perfil, competindo com dezenas de miniaturas, uma
# arte composta para ser vista pequena ganha de um frame de alguém falando.
#
# O app não desenha nada. Ele escreve o PROMPT; quem desenha é o operador, no
# agente capista dele — mesma divisão da capa do TikTok (D-524), e pela mesma
# razão: gerador de imagem dentro da esteira seria custo e imprevisibilidade num
# passo que o operador quer julgar com o olho.


@dataclass(frozen=True)
class ContextoDaCapa:
    """O material que o capista do short precisa ler."""

    short_id: str
    projeto_id: str
    corte_id: str
    titulo: str
    tema_central: str
    gancho_tela: str
    gancho_da_curadoria: str
    duracao_humana: str
    texto_transcricao: str
    prompt_thumbnail: str


async def montar_contexto_da_capa(short_id: str) -> ContextoDaCapa:
    """Reúne o trecho, o gancho e o estilo já estabelecido do canal.

    O `prompt_thumbnail` do corte vai junto como referência de ESTILO, e não de
    conteúdo — a mesma decisão da D-524. Manter a identidade do mascote em dois
    corpos de skill é garantir que um dia os dois discordem, e aí o mesmo canal
    passa a ter dois personagens.

    Levanta `LookupError` (short ou corte inexistente).
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        # D-604: a fala que o short REALMENTE contem. Pela janela inteira, a
        # etiqueta da capa sairia falando do trecho que o operador tirou fora.
        janela = recortar_transcricao_varios(
            _transcricao_do_corte(corte.transcricao_final),
            [
                (segmento.inicio_seg, segmento.fim_seg, offset)
                for segmento, offset in segmentos_short.com_offsets(
                    segmentos_short.de_json(short.segmentos),
                    inicio_seg=float(short.inicio_seg),
                    fim_seg=float(short.fim_seg),
                )
            ],
        )
        meta_corte = await db.scalar(
            select(MetadadoCorte).where(MetadadoCorte.corte_id == corte.id)
        )

        return ContextoDaCapa(
            short_id=short.id,
            projeto_id=corte.projeto_id,
            corte_id=corte.id,
            titulo=short.titulo_sugerido or corte.titulo_proposto or "",
            tema_central=corte.tema_central or "",
            gancho_tela=short.gancho_tela or "",
            gancho_da_curadoria=short.gancho or "",
            duracao_humana=seg_to_mmss(_duracao(short)),
            texto_transcricao=_falas_em_texto(janela),
            prompt_thumbnail=(meta_corte.prompt_thumbnail if meta_corte else "") or "",
        )


def _transcricao_do_corte(bruto: str) -> list[dict]:
    """A `transcricao_final` do corte, ou lista vazia quando ela nao presta.

    Tolerante de proposito: um JSON torto no banco nao pode impedir o operador
    de gerar o prompt da capa. O pior caso aceitavel e o capista receber o
    trecho sem a fala e trabalhar so com titulo, tema e gancho.
    """
    try:
        dados = json.loads(bruto or "[]")
    except (TypeError, ValueError):
        return []
    return dados if isinstance(dados, list) else []


def _falas_em_texto(janela: list[dict]) -> str:
    """A fala do trecho no dialeto `[MM:SS] fala` que os prompts leem."""
    linhas = []
    for segmento in janela:
        texto = str(segmento.get("texto", "")).strip()
        if not texto:
            continue
        linhas.append(f"[{seg_to_mmss(float(segmento.get('start', 0.0) or 0.0))}] {texto}")
    return "\n".join(linhas)


async def obter_prompt(short_id: str) -> str:
    """O prompt já escrito para este short, ou "" quando ainda não há."""
    async with AsyncSessionLocal() as db:
        meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == short_id))
        return (meta.prompt_capa if meta else "") or ""


async def _escrever_prompt_da_capa(short_id: str, provider: ProviderIA) -> str:
    """O prompt de imagem da capa de um short vertical (D-581).

    Skill separada da capa do TikTok por uma diferenca concreta, e nao por
    organizacao: la a imagem sai SEM texto, porque o sistema desenha a
    etiqueta e o selo por cima com a tipografia do canal. Aqui nao ha
    montagem nenhuma — a capa do short e a imagem inteira —, entao a frase
    precisa nascer dentro da arte, com cor e contorno declarados.

    A outra diferenca e o recorte. A capa do corte vive numa vitrine so; a
    do short aparece em tres, e as duas grades de perfil (Instagram e TikTok)
    mostram apenas o QUADRADO CENTRAL do quadro 9:16. E isso que a skill
    precisa conciliar, e e por isso que ela pensa um pouco mais que a vizinha.

    A cor explicita nao e capricho: a D-343 mediu que 90% dos prompts sem cor
    declarada voltaram com texto branco — e branco sobre fundo claro e uma
    capa que nao diz nada.

    O estilo e herdado do prompt da thumbnail do YouTube quando ele existe,
    pelo motivo da D-524: a identidade do canal em dois corpos de skill e a
    garantia de que um dia os dois discordem.

    NAO grava — quem grava e `gerar_prompt`, que e quem sabe onde o metadado
    do short mora.

    Levanta `LookupError` (short inexistente).
    """
    contexto = await montar_contexto_da_capa(short_id)

    skill = editorial_skills.resolver_skill(_SKILL_CAPA_SHORT)
    scaffold = editorial_scaffolds.resolver_scaffold("capa-short-imagem")
    prompt = scaffold.format(
        titulo=contexto.titulo or "(sem titulo)",
        tema_central=contexto.tema_central or "(sem tema)",
        gancho_tela=contexto.gancho_tela or "(este short nao tem gancho escrito)",
        gancho=contexto.gancho_da_curadoria or "(sem nota da curadoria)",
        duracao_humana=contexto.duracao_humana,
        texto_transcricao=contexto.texto_transcricao or "(trecho sem fala transcrita)",
        prompt_thumbnail=contexto.prompt_thumbnail or "(o Capista ainda nao escreveu)",
        texto_capa=texto_da_capa(contexto.gancho_tela, contexto.titulo),
    )
    registrar_skill_usada(_SKILL_CAPA_SHORT, skill, scaffold)
    bruto = await gerar_texto(
        provider,
        prompt,
        skill,
        _SKILL_CAPA_SHORT,
        projeto_id=contexto.projeto_id,
        corte_id=contexto.corte_id,
        short_id=short_id,
    )
    # D-584: o parser do SHORT, e nao o da capa do TikTok.
    #
    # Aquele exige o literal "no text" na resposta, porque a arte DELE nasce
    # sem texto — o sistema desenha a etiqueta por cima. Aqui e o contrario:
    # a frase nasce DENTRO da imagem, entao um prompt bom nunca contem essa
    # marca. O reuso errado fazia toda geracao voltar 502 dizendo que a
    # skill nao devolveu prompt valido, com um prompt perfeito na mao.
    prompt_valido = prompt_da_capa(bruto)
    if not prompt_valido:
        # D-587: o llm_calls registra a chamada como sucesso, e a recusa
        # acontece depois dele. Sem este aviso, o log diz "deu certo" sobre
        # uma geracao que nunca chegou a tela.
        logger.warning(
            "[CapaShort] short=%s resposta recusada pelo validador (%d chars): %.160r",
            short_id[:8],
            len(bruto or ""),
            bruto,
        )
    return prompt_valido


async def gerar_prompt(short_id: str, provider: ProviderIA = "claude") -> str:
    """Escreve o prompt da arte da capa e o guarda no metadado.

    GRAVA, e não só devolve, pelo mesmo motivo da D-524: é isso que torna o
    fluxo retomável. O operador gera aqui, sai do app para desenhar no agente
    dele e volta minutos depois — sem gravar, o prompt morreria no fechar do
    modal, como as variações do gancho morriam antes da D-573.

    Levanta `LookupError` (short inexistente) e `CapaShortError` (a skill não
    devolveu prompt utilizável).
    """
    try:
        prompt = await _escrever_prompt_da_capa(short_id, provider)
    except LookupError:
        raise
    except Exception as exc:  # noqa: BLE001 — a mensagem vai inteira para a tela
        raise CapaShortError(f"Nao consegui escrever o prompt da capa: {exc}") from exc

    if not prompt:
        raise CapaShortError(
            "A resposta da skill nao parece um prompt de imagem (curta demais, uma "
            "pergunta ou conversa em portugues). Tente de novo; se repetir, confira o "
            "corpo de 'Capa do short' em /canais."
        )

    async with AsyncSessionLocal() as db:
        meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == short_id))
        if not meta:
            meta = MetadadoShort(id=str(uuid.uuid4()), short_id=short_id)
            db.add(meta)
        meta.prompt_capa = prompt
        await db.commit()

    logger.info("[CapaShort] short=%s prompt escrito (%d chars)", short_id[:8], len(prompt))
    return prompt


async def subir_arte(short_id: str, conteudo: bytes, nome_original: str) -> dict:
    """Grava a arte que o operador desenhou como a capa deste short.

    Ela SUBSTITUI o quadro extraído do vídeo — as duas são a mesma coisa para
    quem publica (o arquivo apontado por `capa_path`), e manter as duas em
    paralelo faria a tela ter de perguntar qual vale na hora de subir.

    `capa_instante_seg` vai a zero de propósito: esse campo descreve DE ONDE o
    quadro saiu, e uma arte desenhada não saiu de instante nenhum. Deixar o
    valor antigo faria a tela dizer "o quadro de 00:04" sobre uma imagem que
    nunca esteve no vídeo.

    Levanta `LookupError` (short/corte inexistente) e `ValueError` (arquivo
    vazio ou de formato que não serve como capa).
    """
    extensao = Path(nome_original or "").suffix.lower()
    if extensao not in EXTENSOES_DA_ARTE:
        aceitos = ", ".join(sorted(EXTENSOES_DA_ARTE))
        rotulo = extensao or "(sem extensao)"
        raise ValueError(f"Formato {rotulo} nao serve como capa. Use: {aceitos}.")
    if not conteudo:
        raise ValueError("O arquivo da arte chegou vazio.")

    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")
        projeto_id = corte.projeto_id
        relativo_do_video = short.arquivo_short_path

    # A arte mora ao lado do MP4 quando ele existe, e na pasta do short quando
    # ainda não — a capa pode ser escolhida antes do render final, e recusá-la
    # por isso obrigaria a renderizar para poder desenhar.
    if relativo_do_video:
        destino_dir = resolver_do_projeto(relativo_do_video, projeto_id).parent
    else:
        destino_dir = resolver_do_projeto(f"shorts/{short_id}", projeto_id)
    destino_dir.mkdir(parents=True, exist_ok=True)
    destino = destino_dir / f"capa_arte{extensao}"
    destino.write_bytes(conteudo)

    async with AsyncSessionLocal() as db:
        meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == short_id))
        if not meta:
            meta = MetadadoShort(id=str(uuid.uuid4()), short_id=short_id)
            db.add(meta)
        meta.capa_path = para_relativo_ao_projeto(destino, projeto_id)
        meta.capa_instante_seg = 0.0
        await db.commit()
        resultado = CapaDoShort(meta.capa_path, 0.0)

    logger.info("[CapaShort] short=%s arte subida -> %s", short_id[:8], destino.name)
    return resultado.como_dict()
