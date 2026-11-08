"""O ajuste de uma cena só, pedido à IA pelo operador (D-1074, RN-40).

Gerar de novo troca o plano inteiro para mudar uma frase. Aqui o operador cita uma cena
e diz o que quer ("encurte para caber em duas linhas"): a IA devolve aquela cena ajustada,
e a resposta é uma PROPOSTA. Nada grava até o Aceitar, e o Aceitar troca só aquela cena,
sobre o plano que o pedido leu.

A cena manual é do operador e a riscada está fora do vídeo: nenhuma das duas recebe
ajuste (RN-39). A ajustada continua cena da IA, e não manual: o operador pediu, mas quem
escreveu foi a IA, e virar manual tiraria o próximo ajuste da mesma cena.
"""

from __future__ import annotations

import json

from app.domain.compartilhado.provider_ia import ProviderIA
from app.domain.corte.corte_mapper import extrair_cenas_remotion, normalizar_cena_remotion

# A etapa na telemetria das chamadas de IA (D-353): o uso do ajuste se conta à parte da
# geração do plano, e o selo Claude/Gemini das cenas continua sendo o da geração.
ETAPA_DO_AJUSTE = "ajuste-de-cena"

CENA_MANUAL_NAO_SE_AJUSTA = (
    "Esta cena é manual: a IA não mexe nela. Edite-a no card ou peça o ajuste de outra."
)
CENA_RISCADA_NAO_SE_AJUSTA = "Esta cena está riscada, fora do vídeo. Traga-a de volta antes."
CENA_FORA_DO_PLANO = "Esta cena não está mais no plano salvo. Salve as cenas e peça de novo."
AJUSTE_FORA_DO_CORTE = "A IA devolveu a cena fora do corte. Peça o ajuste de novo."
AJUSTE_SEM_CENA = "A IA não devolveu a cena ajustada. Peça o ajuste de novo."
PLANO_MUDOU_NO_AJUSTE = (
    "O plano de cenas mudou desde o pedido de ajuste e a cena não foi trocada. Peça de novo."
)

# Legendas de cada lado da cena que vão no pedido: a janela em que a geração ancora a cena
# ("5 antes, o próprio, 8 depois" no scaffold), com folga para a IA ler o assunto em volta.
LEGENDAS_EM_VOLTA = 10

# Quanto o tempo da IA pode diferir do enviado e ainda ser "o mesmo" (a cena voltou onde
# estava). É o centésimo com que a cena é identificada no plano.
_MESMO_TEMPO_SEG = 0.01

# O visual que o operador escolhe no card: a IA não o menciona ao ajustar o texto, e o
# padrão da conversão ("auto", "card") não pode passar por cima da escolha dele.
_VISUAL_DO_OPERADOR = ("layout_card", "sombra_nivel", "modelo_cena")
_TEMPOS = ("inicio", "fim", "inicio_seg", "fim_seg")


def provider_do_ajuste(origem_do_plano: str | None) -> ProviderIA:
    """O mesmo provedor que gerou o plano atual; plano manual ou antigo vai ao Claude."""
    return "gemini" if origem_do_plano == "gemini" else "claude"


def achar_a_cena(cenas: list, tipo: str, inicio: float) -> int | None:
    """A posição da cena no plano, pela identidade da conferência: `tipo` + início ao centésimo."""
    for indice, cena in enumerate(cenas):
        if not isinstance(cena, dict):
            continue
        normalizada = normalizar_cena_remotion(cena)
        if (
            normalizada.get("tipo") == tipo
            and abs(normalizada["inicio"] - inicio) < _MESMO_TEMPO_SEG
        ):
            return indice
    return None


def recusa_do_ajuste(cena: dict) -> str | None:
    """Por que esta cena não recebe ajuste, ou `None` se ela pode receber."""
    if cena.get("manual") is True:
        return CENA_MANUAL_NAO_SE_AJUSTA
    if cena.get("riscada") is True:
        return CENA_RISCADA_NAO_SE_AJUSTA
    return None


def janela_de_legendas(granular: list, inicio: float, fim: float) -> tuple[int, list]:
    """A legenda onde a cena começa e as legendas em volta dela, para o pedido.

    A cena começa na última legenda que começa até o início dela; a janela vai de
    `LEGENDAS_EM_VOLTA` antes dela a `LEGENDAS_EM_VOLTA` depois da última sob a cena.
    """
    inicios = [_inicio_da_legenda(legenda) for legenda in granular]
    primeira = max((i for i, t in enumerate(inicios) if t <= inicio + _MESMO_TEMPO_SEG), default=0)
    ultima = max((i for i, t in enumerate(inicios) if t < fim), default=primeira)
    de = max(0, primeira - LEGENDAS_EM_VOLTA)
    ate = min(len(granular), max(ultima, primeira) + LEGENDAS_EM_VOLTA + 1)
    return primeira, granular[de:ate]


def bloco_do_pedido(cena_para_a_ia: dict, pedido: str) -> str:
    """O que vai DEPOIS do scaffold de cenas do canal: a cena atual e o pedido do operador.

    Depois, e não antes: o scaffold termina no "FORMATO FINAL" do plano inteiro, e a IA
    segue o último formato que lê (a lição do `CONTRATO_DA_ORIGEM`, D-1018).
    """
    cena = json.dumps(cena_para_a_ia, ensure_ascii=False, indent=2)
    return (
        "\n\nAJUSTE DE UMA CENA SÓ (vale sobre tudo o que veio acima):\n"
        "Não gere um plano novo. O operador do canal pediu um ajuste numa cena que já está "
        "no plano, e só ela muda. As legendas acima são a fala em volta dela.\n\n"
        f"A cena como está hoje:\n{cena}\n\n"
        f"O pedido do operador: {pedido.strip()}\n\n"
        "Responda no mesmo JSON do formato acima, com UMA cena só em `cenas`: a cena "
        "ajustada. Mantenha `startLeg` e `duracao_s` se o pedido não for sobre o tempo, e o "
        "`tipo` se o pedido não for sobre ele. Os campos de origem (`frase_da_fala`, "
        "`quem_disse`, `fonte`) continuam valendo."
    )


def mesclar_o_ajuste(
    original: dict, convertida: dict, enviada_pela_ia: dict, *, manteve_o_tempo: bool
) -> dict:
    """A cena ajustada: a original com o que a IA mudou por cima.

    O que a IA não menciona fica como estava (retrato, frase âncora, visual escolhido no
    card), e o visual que a cena não tinha continua sem vir: o padrão da conversão não é
    uma mudança que alguém pediu. Se a IA devolveu a cena na mesma legenda e com a mesma
    duração, o tempo é o da original: a legenda arredonda o início, e um pedido sobre o
    texto não move a cena.
    """
    depois = {**original, **convertida}
    for campo in _VISUAL_DO_OPERADOR:
        if campo in enviada_pela_ia:
            continue
        if campo in original:
            depois[campo] = original[campo]
        else:
            depois.pop(campo, None)
    if manteve_o_tempo:
        for campo in _TEMPOS:
            if campo in original:
                depois[campo] = original[campo]
    else:
        # A original pode trazer os dois pares; o `_seg` velho venceria o tempo novo.
        depois["inicio_seg"], depois["fim_seg"] = convertida["inicio"], convertida["fim"]
    return depois


# O que a cena enviada já diz e a IA pode calar: sem estes, a conversão da resposta usaria
# os padrões dela (`barra_inferior`, legenda 0, 5 s) no lugar da cena que o operador citou.
_IDENTIDADE_E_TEMPO = ("tipo", "startLeg", "duracao_s")


def completar_com_a_enviada(enviada: dict, devolvida: dict) -> dict:
    """A cena devolvida com o tipo, a legenda e a duração da enviada onde a IA os omitiu.

    Ausente ou nulo é omitido: o que a IA omite fica como estava (RN-40).
    """
    faltam = {
        campo: enviada[campo] for campo in _IDENTIDADE_E_TEMPO if devolvida.get(campo) is None
    }
    return {**devolvida, **faltam}


def manteve_o_tempo(enviada: dict, devolvida: dict) -> bool:
    """Se a IA devolveu a cena na mesma legenda e com a mesma duração que recebeu."""
    try:
        mesma_legenda = int(devolvida.get("startLeg", -1)) == enviada["startLeg"]
        duracao = float(devolvida.get("duracao_s", -1))
    except (TypeError, ValueError):
        return False
    return mesma_legenda and abs(duracao - enviada["duracao_s"]) < _MESMO_TEMPO_SEG


def plano_com_a_cena_trocada(payload: list | dict, indice: int, nova: dict) -> list | dict:
    """O plano gravado com uma cena trocada, no mesmo formato (lista ou dict com `cenas`)."""
    cenas = list(extrair_cenas_remotion(payload))
    cenas[indice] = nova
    return cenas if isinstance(payload, list) else {**payload, "cenas": cenas}


def _inicio_da_legenda(legenda: dict) -> float:
    try:
        return float(legenda.get("start", legenda.get("inicio", 0)) or 0)
    except (TypeError, ValueError):
        return 0.0
