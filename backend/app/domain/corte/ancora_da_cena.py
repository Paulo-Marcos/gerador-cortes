"""A cena segue a frase quando o corte muda (D-1018, RN-36).

WHY: a cena guarda segundos do corte. Tirar um trecho antes dela refaz a
transcrição e deixa a cena no segundo antigo, sem aviso. Aqui as duas transcrições
são alinhadas palavra a palavra, e a cena vai com as palavras que estão sob ela.
Sem elas, a cena fica onde estava, com o aviso e a frase guardada, para voltar se
o trecho voltar. Nunca apaga cena.

Alinhar, e não procurar a frase pelo texto: o apresentador repete o que reage (em
um corte real, a citação cortada "a agenda dela é agenda do crime organizado"
reaparecia 27 s depois), e a busca levava a cena para a repetição em vez de avisar.
"""

import json
from difflib import SequenceMatcher

from app.domain.corte.ancora_match import _tokenizar
from app.domain.corte.corte_mapper import extrair_cenas_remotion, normalizar_cena_remotion
from app.domain.corte.snap_desvios import achatar_palavras

_PALAVRAS_DA_FRASE = 8
# Menos que isto entre trechos diferentes é acaso ("que eu tô"), não a mesma fala.
_MENOR_BLOCO_ALINHADO = 4
_MENOR_TRECHO_DA_FRASE_GUARDADA = 3
_FRACAO_DA_FRASE_GUARDADA = 0.6
# A abertura (ponte, pergunta do chat) pertence ao começo do corte, não a uma frase.
_ABERTURA_SEG = 1.0
# Nenhuma outra cena entra nela: tempo negativo sumiria com a cena, e cair aqui a
# prenderia ao começo para sempre, mesmo desfazendo o recorte.
_PRIMEIRO_INSTANTE_FORA_DA_ABERTURA = _ABERTURA_SEG + 0.01
# O início gravado tem 2 casas: sem a folga, a palavra da própria cena ficaria para trás.
_FOLGA_DO_ARREDONDAMENTO_SEG = 0.01

Tokens = list[tuple[str, float]]


def _tokens(transcricao: list) -> Tokens:
    """(palavra normalizada, tempo) de cada palavra; a pontuação não atrapalha o alinhamento."""
    tokens = []
    for palavra in achatar_palavras(transcricao):
        for token in _tokenizar(palavra.get("texto", "")):
            tokens.append((token, float(palavra["inicio_seg"])))
    return tokens


def _alinhar_livres(velhas: list[str], atuais: list[str], mapa: dict[int, int]) -> None:
    """Alinha o que sobrou: o SequenceMatcher não cruza, então um bloco que mudou de lugar
    (arranjo de blocos) fica de fora da primeira passada."""
    usadas = set(mapa.values())
    livres_velhas = [i for i in range(len(velhas)) if i not in mapa]
    livres_atuais = [i for i in range(len(atuais)) if i not in usadas]
    if not livres_velhas or not livres_atuais:
        return
    blocos = SequenceMatcher(
        None,
        [velhas[i] for i in livres_velhas],
        [atuais[i] for i in livres_atuais],
        autojunk=False,
    ).get_matching_blocks()
    for bloco in blocos:
        if bloco.size >= _MENOR_BLOCO_ALINHADO:
            for i in range(bloco.size):
                mapa[livres_velhas[bloco.a + i]] = livres_atuais[bloco.b + i]


def _alinhar(antigos: Tokens, novos: Tokens) -> dict[int, int]:
    """Posição antiga → posição nova das palavras que continuam no corte.

    Tira antes o começo e o fim iguais: o caso comum é um trecho só, e sem isso
    a comparação da sincronia, que roda no event loop, percorreria o corte inteiro.
    """
    velhas, atuais = [t for t, _ in antigos], [t for t, _ in novos]
    limite = min(len(velhas), len(atuais))
    comeco = 0
    while comeco < limite and velhas[comeco] == atuais[comeco]:
        comeco += 1
    fim = 0
    while fim < limite - comeco and velhas[-1 - fim] == atuais[-1 - fim]:
        fim += 1
    mapa = {i: i for i in range(comeco)}
    mapa.update({len(velhas) - 1 - i: len(atuais) - 1 - i for i in range(fim)})
    miolo_velho = velhas[comeco : len(velhas) - fim]
    miolo_atual = atuais[comeco : len(atuais) - fim]
    blocos = SequenceMatcher(None, miolo_velho, miolo_atual, autojunk=False).get_matching_blocks()
    for bloco in blocos:
        if bloco.size >= _MENOR_BLOCO_ALINHADO:
            mapa.update({comeco + bloco.a + i: comeco + bloco.b + i for i in range(bloco.size)})
    _alinhar_livres(velhas, atuais, mapa)
    return mapa


def _posicao_da_cena(antigos: Tokens, inicio: float) -> int:
    limite = inicio - _FOLGA_DO_ARREDONDAMENTO_SEG
    return next((i for i, (_, t) in enumerate(antigos) if t >= limite), len(antigos) - 1)


def _novo_inicio(
    cena: dict, posicao: int, antigos: Tokens, novos: Tokens, mapa: dict[int, int]
) -> float | None:
    """Onde a cena cai, ou None se as palavras dela saíram do corte.

    A palavra que abre a cena mantém a distância até ela. Se só as seguintes ficaram,
    a cena abre nelas: o que vinha antes não existe mais. Depois do fim da cena já
    não é a fala dela; no fim do corte, sem palavra depois, vale a anterior.
    """
    inicio, fim = cena["inicio"], cena["fim"]
    if antigos[posicao][1] < inicio - _FOLGA_DO_ARREDONDAMENTO_SEG:
        return novos[mapa[posicao]][1] + inicio - antigos[posicao][1] if posicao in mapa else None
    if posicao in mapa:
        return novos[mapa[posicao]][1] + inicio - antigos[posicao][1]
    for antiga in range(posicao + 1, min(posicao + _PALAVRAS_DA_FRASE, len(antigos))):
        if antigos[antiga][1] >= fim:
            break
        if antiga in mapa:
            return novos[mapa[antiga]][1]
    return None


def _achar_o_que_voltou(frase: list[str], novos: Tokens, mapa: dict[int, int]) -> float | None:
    """O tempo da frase guardada, só entre as palavras que acabaram de entrar no corte.

    As que já estavam não contam: uma repetição da frase não é a frase que saiu.
    """
    if len(frase) < _MENOR_TRECHO_DA_FRASE_GUARDADA:
        return None
    ja_estavam = set(mapa.values())
    tamanho = max(_MENOR_TRECHO_DA_FRASE_GUARDADA, round(len(frase) * _FRACAO_DA_FRASE_GUARDADA))
    for deslocamento in range(len(frase) - tamanho + 1):
        pedaco = frase[deslocamento : deslocamento + tamanho]
        for i in range(len(novos) - tamanho + 1):
            trecho = range(i, i + tamanho)
            if all(j not in ja_estavam for j in trecho) and [novos[j][0] for j in trecho] == pedaco:
                return novos[max(0, i - deslocamento)][1]
    return None


def _mover(cena: dict, novo_inicio: float) -> None:
    normalizada = normalizar_cena_remotion(cena)
    delta = max(novo_inicio, _PRIMEIRO_INSTANTE_FORA_DA_ABERTURA) - normalizada["inicio"]
    for campo in ("inicio", "fim", "inicio_seg", "fim_seg"):
        if campo in cena:
            cena[campo] = round(normalizada[campo] + delta, 2)


def _seguir_cena(cena: dict, antigos: Tokens, novos: Tokens, mapa: dict[int, int]) -> None:
    normalizada = normalizar_cena_remotion(cena)
    if normalizada["inicio"] <= _ABERTURA_SEG:
        return
    guardada = cena.get("frase_ancora")
    if guardada:
        novo = _achar_o_que_voltou(_tokenizar(str(guardada)), novos, mapa)
        if novo is None:
            return
    else:
        posicao = _posicao_da_cena(antigos, normalizada["inicio"])
        novo = _novo_inicio(normalizada, posicao, antigos, novos, mapa)
        if novo is None:
            frase = antigos[posicao : posicao + _PALAVRAS_DA_FRASE]
            cena["ancora_perdida"] = True
            cena["frase_ancora"] = " ".join(token for token, _ in frase)
            return
    cena.pop("ancora_perdida", None)
    cena.pop("frase_ancora", None)
    _mover(cena, novo)


def seguir_recorte(
    cenas_gravadas: str | None, transcricao_antiga: str | None, transcricao_nova: list
) -> str | None:
    """As cenas gravadas depois do recorte, ou None quando não há o que mudar nelas.

    Dado fora do formato também é None: as cenas ficam como estão, e a sincronia,
    que não depende delas, segue.
    """
    try:
        payload = json.loads(cenas_gravadas or "[]")
        antigos = _tokens(json.loads(transcricao_antiga or "[]"))
    except (ValueError, TypeError):
        return None
    cenas = [cena for cena in extrair_cenas_remotion(payload) if isinstance(cena, dict)]
    novos = _tokens(transcricao_nova)
    if not cenas or not antigos or not novos or antigos == novos:
        return None

    mapa = _alinhar(antigos, novos)
    for cena in cenas:
        _seguir_cena(cena, antigos, novos, mapa)
    extrair_cenas_remotion(payload).sort(
        key=lambda c: normalizar_cena_remotion(c)["inicio"] if isinstance(c, dict) else 0.0
    )
    return json.dumps(payload, ensure_ascii=False)
