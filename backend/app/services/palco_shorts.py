"""Resolve o palco vertical de um corte: de onde vêm as regiões (E-036, D-487).

A geometria vive em `domain/palco_short`. Aqui mora a pergunta anterior a ela:
**quais regiões este corte tem, e de onde saíram?**

Três origens, nesta ordem de preferência:

  1. **preset escolhido** — o operador apontou um dos presets do canal para este
     corte. É o caminho normal, e o que ele pediu: poucos padrões, porque o
     cenário da live não muda muito.
  2. **layout do próprio corte** — se o corte já foi posicionado para o
     horizontal, os crops estão lá e servem sem cadastro nenhum.
  3. **nenhuma** — o corte nunca foi posicionado. Aqui está a armadilha que
     motivou esta demanda: sem região, o palco cairia em "pessoa cheia" usando
     o quadro INTEIRO, e o chrome verde da live voltaria — exatamente o que o
     palco existe para evitar.

Por isso `origem` volta na resposta. Um palco montado do jeito errado precisa
dizer POR QUE está assim, senão o operador ajusta o modelo achando que o
problema é o arranjo, quando o problema é a falta de região.
"""

from __future__ import annotations

import json
import logging

from app.channel_assets_sync import cor_do_tema, paleta_do_tema
from app.database import AsyncSessionLocal
from app.domain import gancho_short
from app.domain.arranjo_short import catalogo as catalogo_de_arranjos
from app.domain.arranjo_short import de_chave as arranjo_de_chave
from app.domain.arranjo_short import fonte_efetiva, montar_modelo
from app.domain.arranjo_short import sugerir as arranjo_sugerido
from app.domain.fundo_short import fundos_disponiveis
from app.domain.fundo_short import resolver as resolver_fundo
from app.domain.moldura_short import COR_PADRAO, faixas
from app.domain.palco_short import CANVAS, montar_plano, regioes_do_layout

# A textura do palco vertical: a MESMA que o render usa para rasterizar o PNG
# (`render_short._palco_em_png`). Duas fontes para este id fariam a previa e o
# arquivo divergirem sem nada quebrar.
from app.domain.youtube_layout import FUNDO_PADRAO as FUNDO_EDITORIAL
from app.domain.youtube_layout import _normalizar_fundo as textura_valida
from app.models import Corte, LayoutPreset, Short
from sqlalchemy import select

logger = logging.getLogger(__name__)

ORIGEM_PRESET_SHORT = "preset_do_short"
ORIGEM_PRESET = "preset"
ORIGEM_LAYOUT = "layout_do_corte"
ORIGEM_NENHUMA = "nenhuma"
# D-499: o short marcou o proprio recorte. Precisa de nome porque a tela explica
# a origem, e "preset" seria mentira depois de o operador ter arrastado o
# retangulo com a mao.
ORIGEM_RECORTE_DO_SHORT = "recorte_do_short"
# Os recortes vieram do palco padrao do corte, que o trecho segue sem ter sido
# tocado. Dizer "layout do corte" ali mandaria o operador procurar a causa no
# lugar errado.
ORIGEM_PALCO_PADRAO = "palco_padrao_do_corte"

TIPO_PALCO = "palco_short"
TIPO_GANCHO = "gancho_short"


def catalogo_arranjos(regioes: dict | None = None) -> list[dict]:
    """Os arranjos possíveis, com o porquê e o que falta quando não dá (D-507).

    Recebe as REGIÕES de propósito: sem elas a tela ofereceria tela dividida a
    um corte que só tem a pessoa marcada, o operador escolheria, e o palco cairia
    no sugerido sem nada explicando o pulo.
    """
    return catalogo_de_arranjos(regioes)


def _payload_do_preset(presets: list, preset_id: str, tipo: str = TIPO_PALCO) -> dict | None:
    """O payload do preset apontado, do tipo pedido, ou None quando nao ha.

    Preset apagado depois de escolhido devolve None, e o short volta aos
    defaults do sistema — degradar, e nao quebrar, e a regra desta cascata
    inteira (D-554).
    """
    if not preset_id:
        return None
    for preset in presets:
        if preset.id == preset_id and preset.tipo == tipo:
            return _json_dict(preset.payload)
    return None


def _campos_de_palco(short: Short, rascunho: dict | None) -> dict:
    """Os campos do short que descrevem o palco — gravados, ou os do rascunho.

    D-594: o editor de PRESET monta o palco sobre um trecho sem gravar nele. O
    rascunho substitui campo a campo o que o short tem; o que ele nao trouxer
    continua o do short, que e o quadro de onde a previa tira o video.
    """
    gravados = {
        "arranjo_palco": short.arranjo_palco,
        "janela_cheia": short.janela_cheia,
        "ajustes_palco": _json_dict(short.ajustes_palco),
        "recortes_palco": _json_dict(short.recortes_palco),
        "fundo_editorial": short.fundo_editorial,
        "legenda_cor": short.legenda_cor,
        "legenda_fonte": short.legenda_fonte,
        "palco_preset": short.palco_preset,
        "moldura": short.moldura,
    }
    if rascunho is None:
        return gravados
    return {campo: rascunho.get(campo, valor) for campo, valor in gravados.items()}


def _aparencia(moldura: str, fundo: str, textura: str, herdado: dict, gancho: dict) -> dict:
    """Tudo que descreve como o palco SE PARECE, num objeto só.

    Existe por dois motivos, e o segundo e o que importa.

    O primeiro e que estes campos eram escritos DUAS vezes — no retorno com
    palco e no `_sem_palco` —, e uma lista repetida em dois literais diverge no
    dia em que um campo entra. Aconteceu tres vezes ja: `fundo_editorial` na
    D-549, a legenda na D-570, o gancho na D-585.

    O segundo: sem este objeto, `_sem_palco` chegou a SETE parametros, seis
    deles `str`, passados por POSICAO nos dois pontos de chamada. Trocar
    `legenda_cor` com `gancho_cor` ali nao produz erro nenhum — produz uma
    previa pintando a cor errada, em silencio. Um agrupamento que o tipo nao
    distingue e um bug esperando a proxima edicao distraida.

    A HERANCA ja vem resolvida em `herdado` e em `gancho`: aqui so se le.
    """
    return {
        "moldura": moldura,
        "fundo": fundo,
        # D-549: a TEXTURA do palco, que ate aqui so o PNG do render conhecia.
        # A previa pintava `fundo` (uma cor chapada da paleta) e por isso
        # mostrava uma moldura que o arquivo nao teria. Mandando o mesmo id que
        # o PNG usa, a tela passa a desenhar o que vai sair.
        "fundo_editorial": textura,
        # D-570: a legenda vem pelo plano, e nao lida do short no `render_short`.
        # Um lugar so resolve a heranca; dois a resolveriam diferente.
        "legenda_cor": herdado.get("legenda_cor", ""),
        "legenda_fonte": herdado.get("legenda_fonte", ""),
        # D-585: a aparencia do gancho, pela mesma razao e pelo mesmo caminho.
        # D-594: e ela vem do GANCHO PADRAO do corte, nao mais do palco.
        "gancho_cor": gancho["cor"],
        "gancho_realce": gancho["realce"],
        "gancho_ate_seg": gancho["ate_seg"],
        "gancho_fonte": gancho["fonte"],
        "gancho_tamanho": gancho["tamanho"],
    }


def _sem_palco(aparencia: dict, regioes: dict) -> dict:
    """A resposta de quando não há palco a montar.

    Uma função só, porque os dois caminhos que chegam aqui — sem região marcada,
    e arranjo que não monta nem no sugerido — precisam devolver EXATAMENTE o
    mesmo formato. Dois literais divergiriam no dia em que um campo entrasse.
    """
    return {
        "plano": None,
        "origem": ORIGEM_NENHUMA,
        "arranjo": "",
        "janela_cheia": "",
        "modelo": None,
        "ajustes": {},
        "regioes": regioes,
        **aparencia,
    }


def catalogo_fundos() -> list[dict]:
    """As cores do canal oferecíveis como fundo do short (D-499).

    A `chave` é o que se grava; a `cor` é só para a tela pintar a amostra.
    Gravar o hex congelaria a paleta do dia — trocar o tema do canal deixaria os
    shorts antigos com a cor velha, e ninguém ligaria uma coisa à outra.
    """
    paleta = paleta_do_tema()
    padrao = resolver_fundo("", paleta)
    cores = [
        {"chave": fundo.chave, "cor": fundo.cor, "padrao": fundo.cor == padrao}
        for fundo in fundos_disponiveis(paleta)
    ]
    # O default primeiro. O domínio preserva a ordem da paleta, que é a ordem
    # em que o tema declara as cores; num seletor, porém, o primeiro item é o
    # que a maioria vai manter, e deixá-lo no fim faria procurar por ele.
    cores.sort(key=lambda c: not c["padrao"])
    return cores


# D-570: os campos que o short herda do palco padrao do corte.
#
# So os de COMO A TELA MONTA. Os `recortes` nao passam por aqui: eles respondem
# DE ONDE VEM cada janela e sao herdados REGIAO A REGIAO, na cascata propria
# (`regioes_do_short`). Campo a campo, um padrao com so a pessoa apagaria a tela
# que o corte ja tinha marcado.
# D-594: o gancho SAIU daqui. A D-585 o pos na heranca do palco para a
# aparencia ser definida uma vez por corte — a intencao continua, o dono mudou.
# Ele agora tem preset proprio (`Corte.gancho_padrao`, resolvido em
# `gancho_short.aparencia_resolvida`): o palco cuida da tela, o preset de gancho
# cuida do letreiro, e cada um se troca sem arrastar o outro.
CAMPOS_HERDADOS = (
    "arranjo",
    "janela_cheia",
    "ajustes",
    "fundo",
    "legenda_cor",
    "legenda_fonte",
)


def com_palco_do_corte(proprio: dict, padrao: dict | None) -> dict:
    """Os campos do short, com os do palco do corte onde ele nao decidiu.

    HERANCA VIVA: vazio no short significa "nao decidi", e nao "quero o default
    do sistema". Trocar o palco do corte reflete na hora em todos os trechos que
    ninguem customizou; os customizados ficam intocados.

    E a mesma regra do resto da cascata de layout — chave ausente e heranca. A
    alternativa, copiar os valores para cada short no momento de escolher,
    congelaria o palco do dia e faria "trocar o padrao" virar uma operacao sem
    efeito sobre o que ja existe.

    >>> com_palco_do_corte({"arranjo": "cheia"}, {"arranjo": "dividida", "fundo": "topographic"})
    {'arranjo': 'cheia', 'fundo': 'topographic'}
    >>> com_palco_do_corte({"arranjo": ""}, {"arranjo": "dividida"})
    {'arranjo': 'dividida'}
    >>> com_palco_do_corte({"arranjo": "cheia"}, None)
    {'arranjo': 'cheia'}
    """
    if not padrao:
        return dict(proprio)

    resolvido = dict(proprio)
    for campo in CAMPOS_HERDADOS:
        if campo not in proprio and campo not in padrao:
            continue
        # `{}` e `""` sao "nao decidi". `0` nao aparece nestes campos, entao a
        # falsidade generica nao esconde nenhum valor legitimo aqui.
        if not proprio.get(campo):
            herdado = padrao.get(campo)
            if herdado:
                resolvido[campo] = herdado
    return resolvido


def _e_retangulo(valor: object) -> bool:
    """Um recorte utilizável: as quatro chaves, numéricas e com área.

    Um retângulo de largura zero vira `crop=0:...` e o ffmpeg morre com -22 no
    meio do render — longe daqui, e sem dizer de onde veio o zero.
    """
    if not isinstance(valor, dict):
        return False
    try:
        lados = {chave: float(valor[chave]) for chave in ("x", "y", "w", "h")}
    except (KeyError, TypeError, ValueError):
        return False
    return lados["w"] > 0 and lados["h"] > 0 and lados["x"] >= 0 and lados["y"] >= 0


def _recortes_validos(recortes: object) -> dict:
    """Só os retângulos utilizáveis de um mapa de recortes."""
    if not isinstance(recortes, dict):
        return {}
    return {regiao: ret for regiao, ret in recortes.items() if _e_retangulo(ret)}


def regioes_do_short(
    do_corte: dict, origem: str, do_padrao: dict, proprias: dict
) -> tuple[dict, str]:
    """As regioes de UM short: as do corte, cobertas pelas do palco padrao e pelas dele.

    Regiao a regiao, nesta ordem: o recorte do trecho > o do palco padrao do
    corte > o que o corte ja resolvia (preset de recortes ou layout).

    O padrao entrar aqui e o que faz "escolher o palco do corte" valer para
    todos os trechos. Sem os recortes dele, um corte nunca posicionado nao tinha
    regiao nenhuma: o trecho que ninguem tocou saia sem palco, enquanto o vizinho
    em que o mesmo preset fora aplicado a mao saia montado — e trocar o padrao
    parecia nao fazer nada.

    >>> regioes_do_short({"tela": 1}, "layout_do_corte", {"pessoa": 2}, {})
    ({'tela': 1, 'pessoa': 2}, 'palco_padrao_do_corte')
    >>> regioes_do_short({}, "nenhuma", {"pessoa": 2}, {"pessoa": 3})
    ({'pessoa': 3}, 'recorte_do_short')
    """
    regioes = {**do_corte, **do_padrao, **proprias}
    if proprias:
        return regioes, ORIGEM_RECORTE_DO_SHORT
    if do_padrao:
        return regioes, ORIGEM_PALCO_PADRAO
    return regioes, origem


async def descrever(corte_id: str) -> dict:
    """O estado do palco de um corte: regiões, origem, presets à escolha."""
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")

        presets = (await db.scalars(select(LayoutPreset))).all()
        regioes, origem, preset_nome = _resolver(corte, presets)

    return {
        "preset": preset_nome,
        "origem": origem,
        "regioes": regioes,
        "arranjo_sugerido": arranjo_sugerido(regioes).chave,
        "presets_disponiveis": [
            {"id": p.id, "nome": p.nome, "regioes": sorted(_regioes_do_preset(p))}
            for p in presets
            if _regioes_do_preset(p)
        ],
    }


async def escolher_preset(corte_id: str, preset_id: str) -> dict:
    """Aponta um preset do canal para este corte. `""` volta ao automático.

    Levanta `LookupError` (corte ou preset inexistente) e `ValueError` quando o
    preset não tem crop nenhum — apontar para um preset vazio deixaria o corte
    parecendo configurado e entregando o mesmo resultado de antes.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")

        if preset_id:
            preset = await db.get(LayoutPreset, preset_id)
            if not preset:
                raise LookupError(f"Preset {preset_id!r} nao encontrado")
            if not _regioes_do_preset(preset):
                raise ValueError(
                    f"O preset {preset.nome!r} nao tem regiao de facecam nem de tela — "
                    "com ele o palco continuaria usando o quadro inteiro."
                )

        corte.palco_short_preset = preset_id
        await db.commit()

    return await descrever(corte_id)


async def escolher_palco_padrao(corte_id: str, preset_id: str) -> dict:
    """Aponta um preset de PALCO como o padrao deste corte. `""` volta ao nada.

    Nao copia nada para os shorts: a heranca e resolvida na leitura. Trocar o
    padrao reflete na hora em todos que ninguem customizou — que e o ponto.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")

        if preset_id:
            preset = await db.get(LayoutPreset, preset_id)
            if not preset or preset.tipo != "palco_short":
                raise LookupError(f"Preset de palco {preset_id!r} nao encontrado")

        corte.palco_padrao = preset_id
        await db.commit()

    return {"corte_id": corte_id, "palco_padrao": preset_id}


def _tem_palco_proprio(short: Short) -> bool:
    """O trecho decidiu alguma parte do palco por conta propria.

    Aplicar um preset no trecho COPIA os valores (D-552), entao um trecho com
    o mesmo preset do padrao tambem conta: ele parece seguir, mas congelou o
    preset do dia em que foi aplicado.
    """
    return bool(
        short.arranjo_palco
        or short.janela_cheia
        or short.fundo_editorial
        or short.legenda_cor
        or short.legenda_fonte
        or short.palco_preset
        or _json_dict(short.ajustes_palco)
        or _json_dict(short.recortes_palco)
    )


async def descrever_palco_padrao(corte_id: str) -> dict:
    """Qual palco este corte usa por padrao, os que existem, e quantos fogem dele."""
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")
        presets = (
            await db.scalars(select(LayoutPreset).where(LayoutPreset.tipo == "palco_short"))
        ).all()
        shorts = (await db.scalars(select(Short).where(Short.corte_id == corte_id))).all()
        escolhido = corte.palco_padrao

    return {
        "palco_padrao": escolhido,
        "nome": next((p.nome for p in presets if p.id == escolhido), ""),
        "disponiveis": [{"id": p.id, "nome": p.nome} for p in presets],
        # Mesmo motivo do gancho: sem o numero, trocar o padrao "nao muda nada"
        # justamente nos trechos em que um preset ja tinha sido aplicado.
        "customizados": sum(1 for s in shorts if _tem_palco_proprio(s)),
    }


async def seguir_palco_padrao_em_todos(corte_id: str) -> dict:
    """Limpa o palco proprio de todos os trechos do corte: todos passam a herdar.

    So o PALCO — arranjo, janelas, recortes, textura e legenda. Bordas, gancho e
    moldura ficam: nao sao do preset de palco.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")
        shorts = (await db.scalars(select(Short).where(Short.corte_id == corte_id))).all()
        liberados = 0
        for short in shorts:
            if _tem_palco_proprio(short):
                liberados += 1
            short.arranjo_palco = ""
            short.janela_cheia = ""
            short.ajustes_palco = "{}"
            short.recortes_palco = "{}"
            short.fundo_editorial = ""
            short.legenda_cor = ""
            short.legenda_fonte = ""
            short.palco_preset = ""
            short.palco_short_preset = ""
        await db.commit()

    return {"corte_id": corte_id, "liberados": liberados}


async def escolher_gancho_padrao(corte_id: str, preset_id: str) -> dict:
    """Aponta um preset de GANCHO como o padrao deste corte. `""` volta ao nada.

    D-594. Mesma regra do palco: nada e copiado para os shorts, a heranca e
    resolvida na leitura.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")

        if preset_id:
            preset = await db.get(LayoutPreset, preset_id)
            if not preset or preset.tipo != TIPO_GANCHO:
                raise LookupError(f"Preset de gancho {preset_id!r} nao encontrado")

        corte.gancho_padrao = preset_id
        await db.commit()

    return {"corte_id": corte_id, "gancho_padrao": preset_id}


def _tem_aparencia_propria(short: Short) -> bool:
    """O trecho decidiu alguma parte da aparencia do gancho por conta propria."""
    return bool(short.gancho_cor or short.gancho_realce or (short.gancho_ate_seg or 0) > 0)


async def descrever_gancho_padrao(corte_id: str) -> dict:
    """Qual gancho o corte usa, os que existem, e quantos trechos fogem dele.

    `customizados` existe porque, antes da D-594, gravar o gancho carimbava o
    veu e os 2,5s no trecho — e um trecho carimbado nao segue padrao nenhum. A
    tela precisa dizer isso, senao o operador escolhe um preset e nada muda.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")
        presets = (
            await db.scalars(select(LayoutPreset).where(LayoutPreset.tipo == TIPO_GANCHO))
        ).all()
        shorts = (await db.scalars(select(Short).where(Short.corte_id == corte_id))).all()
        escolhido = corte.gancho_padrao

    preset = next((p for p in presets if p.id == escolhido), None)
    return {
        "gancho_padrao": escolhido,
        "nome": preset.nome if preset else "",
        # O payload vai junto: o modal do trecho mostra "do padrao" com a cor e
        # o realce DELE, e sem isto teria de cruzar a lista de presets sozinho.
        "payload": _json_dict(preset.payload) if preset else {},
        "disponiveis": [{"id": p.id, "nome": p.nome} for p in presets],
        "customizados": sum(1 for s in shorts if _tem_aparencia_propria(s)),
    }


async def seguir_gancho_padrao_em_todos(corte_id: str) -> dict:
    """Limpa a aparencia propria do gancho em todos os trechos do corte (D-594).

    So a APARENCIA: cor, realce e duracao. O texto de cada trecho fica — cada
    short promete uma coisa, e apagar oito ganchos escritos para "seguir o
    padrao" seria destruir o trabalho mais editorial da tela.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")
        shorts = (await db.scalars(select(Short).where(Short.corte_id == corte_id))).all()
        liberados = 0
        for short in shorts:
            if _tem_aparencia_propria(short):
                liberados += 1
            short.gancho_cor = ""
            short.gancho_realce = ""
            short.gancho_ate_seg = 0.0
        await db.commit()

    return {"corte_id": corte_id, "liberados": liberados}


async def resolver_para_render(
    short_id: str,
    ajustes_hipoteticos: dict | None = None,
    palco_rascunho: dict | None = None,
) -> dict:
    """O plano de palco de UM short, pronto para virar filtro.

    Devolve `plano=None` quando não há região: o render então segue pelo caminho
    antigo (recorte 9:16 do quadro cru). Degradar é melhor que falhar — mas o
    campo `origem` diz que foi degradação, não escolha.

    `ajustes_hipoteticos` (D-500) substitui os ajustes gravados SEM tocar no
    banco. É o que permite a prévia redesenhar durante o arraste: a alternativa
    seria portar a matemática de recorte para o frontend — a segunda
    implementação de geometria que este épico inteiro evitou, e que já custou
    dois bugs de divergência (D-490, D-493).
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        presets = (await db.scalars(select(LayoutPreset))).all()
        campos = _campos_de_palco(short, palco_rascunho)
        regioes, origem, _ = _resolver(corte, presets, campos["palco_preset"])

        # D-570: o palco padrao do corte, se houver. O short que nao decidiu um
        # campo le o daqui — heranca viva, resolvida na LEITURA.
        #
        # D-594: menos quando ha RASCUNHO. Um preset em edicao tem de ser
        # julgado pelo que ELE e: misturado ao padrao, a previa mostraria um
        # fundo que o preset nao guarda, e aplicado noutro corte ele sairia
        # diferente do que foi aprovado.
        padrao = (
            None if palco_rascunho is not None else _payload_do_preset(presets, corte.palco_padrao)
        )
        herdado = com_palco_do_corte(
            {
                "arranjo": campos["arranjo_palco"],
                "janela_cheia": campos["janela_cheia"],
                "ajustes": campos["ajustes_palco"],
                "fundo": campos["fundo_editorial"],
                "legenda_cor": campos["legenda_cor"],
                "legenda_fonte": campos["legenda_fonte"],
            },
            padrao,
        )
        gancho = gancho_short.aparencia_resolvida(
            {
                "cor": short.gancho_cor,
                "realce": short.gancho_realce,
                "ate_seg": short.gancho_ate_seg,
            },
            _payload_do_preset(presets, corte.gancho_padrao, TIPO_GANCHO),
        )
        # D-499: o recorte DESTE short vence o do preset, região a região. O
        # preset segue sendo o atalho que preenche tudo — quem não quer mexer
        # não mexe —, mas quando a facecam anda no meio da live é aqui que um
        # trecho conserta o próprio enquadramento sem estragar os vizinhos.
        #
        # O palco padrão do corte entra no meio da cascata — menos para o trecho
        # que escolheu o próprio preset de recortes (D-498): esse já disse de
        # onde vem cada janela, e o padrão por cima o desfaria em silêncio.
        do_padrao = (
            {}
            if origem == ORIGEM_PRESET_SHORT
            else _recortes_validos((padrao or {}).get("recortes"))
        )
        regioes, origem = regioes_do_short(
            regioes, origem, do_padrao, _recortes_validos(campos["recortes_palco"])
        )
        escolhido = herdado.get("arranjo", "")
        janela = herdado.get("janela_cheia", "")
        # MESCLA, não substitui: o arraste manda só o bloco que está na mão,
        # e trocar o mapa inteiro por ele apagaria da prévia os ajustes dos
        # OUTROS blocos — que voltariam ao lugar padrão enquanto o operador
        # mexe num terceiro, sem nada na tela explicando o pulo.
        ajustes = {**herdado.get("ajustes", {}), **(ajustes_hipoteticos or {})}
        moldura = campos["moldura"]
        fundo = resolver_fundo(short.fundo_palco, paleta_do_tema())
        # D-552: a textura do short, ou a do canal quando ele nao escolheu.
        #
        # D-554: e a do canal tambem quando o que esta gravado NAO E uma
        # textura. A gravacao aceita qualquer string de proposito (o catalogo
        # muda com o tema, e um short antigo nao deve virar erro de escrita) —
        # o preco disso e que a validacao tem de acontecer AQUI, na leitura.
        #
        # Ela nao acontecia, e um preset de palco salvo antes da D-552 trazia no
        # campo `fundo` uma CHAVE DE PALETA ("verdeProfundo"). Aplicar o preset
        # copiava a chave para ca, o payload a entregava intacta, e a previa
        # procurava um componente de textura com esse nome — nao achava, e a
        # tela inteira dos shorts caia com "Element type is invalid".
        textura = textura_valida(herdado.get("fundo", ""), FUNDO_EDITORIAL)
        aparencia = _aparencia(moldura, fundo, textura, herdado, gancho)

    if not regioes:
        return _sem_palco(aparencia, regioes)

    arranjo = arranjo_de_chave(escolhido, janela) if escolhido else arranjo_sugerido(regioes)
    modelo = montar_modelo(arranjo, regioes)
    if modelo is None:
        # O arranjo gravado não monta com as regiões de hoje — o preset mudou,
        # ou o corte perdeu uma marcação. Cair no sugerido é melhor que abortar
        # o render, mas precisa ficar no log: a tela mostra um arranjo e o
        # arquivo sai com outro.
        logger.warning(
            "[Palco] short=%s arranjo=%s nao monta com %s; usando o sugerido",
            short_id[:8],
            arranjo.chave,
            sorted(regioes),
        )
        arranjo = arranjo_sugerido(regioes)
        modelo = montar_modelo(arranjo, regioes)
    if modelo is None:
        return _sem_palco(aparencia, regioes)

    plano = montar_plano(modelo, regioes, ajustes)

    return {
        "plano": plano,
        "origem": origem,
        "arranjo": arranjo.chave,
        "janela_cheia": fonte_efetiva(arranjo.fonte, regioes),
        "modelo": modelo.id,
        "ajustes": ajustes,
        "regioes": regioes,
        **aparencia,
    }


async def plano_desenhavel(
    short_id: str,
    ajustes_hipoteticos: dict | None = None,
    palco_rascunho: dict | None = None,
) -> dict:
    """O palco deste short em coordenadas de DESENHO, para a prévia (D-489).

    A tela não recalcula nada: ela recebe, por recorte, de onde tirar da fonte,
    onde colar e onde cortar — e aplica no canvas. É a mesma conta que virou o
    `filter_complex`, servida noutro vocabulário.

    Reimplementar a geometria no frontend seria criar uma segunda versão dela, e
    aí a prévia poderia discordar do arquivo sem que nada quebrasse. É o risco
    que este épico inteiro existe para evitar.
    """
    resolvido = await resolver_para_render(short_id, ajustes_hipoteticos, palco_rascunho)
    plano = resolvido["plano"]

    return {
        "origem": resolvido["origem"],
        "modelo": resolvido["modelo"],
        # O arranjo RESOLVIDO, e o que as regioes DESTE trecho permitem. O modal
        # marcava o arranjo gravado no short (vazio quando ele herda) e julgava
        # o possivel pelas regioes do CORTE: num corte sem regiao, tudo vinha
        # desabilitado mesmo com o trecho montando palco pelos recortes.
        "arranjo": resolvido["arranjo"],
        "arranjos": catalogo_arranjos(resolvido["regioes"]),
        "canvas": {"largura": CANVAS.largura, "altura": CANVAS.altura},
        "fundo": resolvido["fundo"],
        # D-549: a TEXTURA do palco. A previa pintava so `fundo` — uma cor
        # chapada da paleta — e por isso mostrava uma moldura que o arquivo nao
        # teria: o render sobrepoe um PNG com a textura editorial do canal.
        # Mandando o mesmo id que o PNG usa, as duas telas passam a concordar.
        "fundo_editorial": resolvido["fundo_editorial"],
        # D-570: a previa desenha a legenda com a cor e a fonte JA HERDADAS.
        # Lidas do short, elas ignorariam o palco do corte e a previa mostraria
        # um realce que o arquivo nao teria.
        "legenda_cor": resolvido.get("legenda_cor", ""),
        "legenda_fonte": resolvido.get("legenda_fonte", ""),
        # D-585: a previa desenha o gancho com a aparencia JA HERDADA. Lida do
        # short, ela ignoraria o padrao do corte e a previa mostraria uma cor
        # que o arquivo nao teria.
        "gancho_cor": resolvido.get("gancho_cor", ""),
        "gancho_realce": resolvido.get("gancho_realce", ""),
        # D-594: o resto da aparencia herdada — fonte, corpo e duracao.
        "gancho_ate_seg": resolvido.get("gancho_ate_seg", 0.0),
        "gancho_fonte": resolvido.get("gancho_fonte", ""),
        "gancho_tamanho": resolvido.get("gancho_tamanho", 0.0),
        # A regiao vai JUNTO do desenho: sem ela a tela teria de casar esta
        # lista com `slots` pela posicao, e um acoplamento implicito desses
        # quebra em silencio no dia em que a ordem mudar.
        "recortes": ([{"regiao": r.regiao, **r.desenho} for r in plano.recortes] if plano else []),
        # Os slots RESOLVIDOS (modelo + ajuste), que sao o que o editor arrasta.
        # Mandar o modelo cru obrigaria a tela a reaplicar os ajustes por conta
        # propria — a segunda implementacao de sempre.
        "slots": (
            {
                r.regiao: {"x": r.slot.x, "y": r.slot.y, "w": r.slot.w, "h": r.slot.h}
                for r in plano.recortes
            }
            if plano
            else {}
        ),
        "ajustados": sorted(resolvido["ajustes"]),
        "moldura": resolvido["moldura"],
        # As faixas ja resolvidas, com a cor do CANAL — a tela nao escolhe cor,
        # so desenha. Cravar a cor no frontend faria o canal trocar a paleta e o
        # short sair com a antiga, sem nada indicando por que.
        "faixas": [
            {"x": f.x, "y": f.y, "w": f.w, "h": f.h, "cor": f.cor}
            for f in faixas(resolvido["moldura"], cor_do_tema("verdeMoldura", COR_PADRAO))
        ],
    }


def _resolver(
    corte: Corte, presets: list[LayoutPreset], preset_do_short: str = ""
) -> tuple[dict, str, str]:
    """(regiões, origem, nome do preset) — a cascata, agora de quatro degraus.

    O preset DO SHORT vem primeiro (D-498): numa live longa a cena do OBS muda
    ao longo do tempo, então um trecho pode precisar de regiões diferentes das
    do resto do corte. O corte continua sendo o default — o short só discorda
    quando precisa.
    """
    for candidato, origem in (
        (preset_do_short, ORIGEM_PRESET_SHORT),
        (corte.palco_short_preset, ORIGEM_PRESET),
    ):
        if not candidato:
            continue
        preset = next((p for p in presets if p.id == candidato), None)
        if preset:
            regioes = _regioes_do_preset(preset)
            if regioes:
                return regioes, origem, preset.nome

    regioes = regioes_do_layout(_json_dict(corte.layout_youtube))
    if regioes:
        return regioes, ORIGEM_LAYOUT, ""

    return {}, ORIGEM_NENHUMA, ""


def _regioes_do_preset(preset: LayoutPreset) -> dict:
    return regioes_do_layout(_json_dict(preset.payload))


def _json_dict(bruto: str | None) -> dict:
    try:
        dados = json.loads(bruto or "{}")
    except json.JSONDecodeError:
        return {}
    return dados if isinstance(dados, dict) else {}
