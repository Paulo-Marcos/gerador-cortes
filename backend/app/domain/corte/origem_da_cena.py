"""De onde vem o que a cena afirma, conferido contra a fala (D-1018, RN-35).

WHY: em 175 cenas reais, nenhum card de número mostrava fonte, 10 de 19 eram
hipótese sob o rótulo "DADO" e 4 de 13 citações erravam (paráfrase do apresentador
entre aspas na boca de outra pessoa, frase do narrador atribuída ao autor).

A conferência só AVISA. Quem decide o que a cena afirma é o operador; um card
pode estar certo e contrariar a fala ("hoje senador" contra "governador hoje",
com a posse ainda por vir), então aqui nada é reescrito nem apagado.
"""

import re
from difflib import SequenceMatcher

from app.domain.corte.ancora_match import _tokenizar
from app.domain.corte.corte_mapper import normalizar_cena_remotion
from app.domain.corte.snap_desvios import achatar_palavras

# O scaffold de cenas é por canal e mora no banco: um default novo não chegaria a
# quem já tem o seu. Este bloco vai no prompt pelo código, e a regra vale para todos.
# Vai DEPOIS do scaffold: numa geração real, no topo, a IA seguiu o "FORMATO FINAL"
# dele e devolveu 0 frases em 11 cenas. Passa pelo `.format` do scaffold: sem chaves.
CONTRATO_DA_ORIGEM = """

ORIGEM DE CADA CENA (obrigatório, vale sobre o formato acima):
O operador do canal confere cada cena antes de publicar, e estes campos são o que ele usa para conferir. Inclua-os em CADA cena do JSON, mesmo que o formato acima não os mostre.
- `frase_da_fala`: a frase das LEGENDAS NUMERADAS que justifica a cena, copiada literalmente, em até 25 palavras.
- `quem_disse`: quem pronuncia essa frase: "apresentador" para quem conduz a live, o nome da pessoa se a fala o der, ou "video_reagido" para um trecho de vídeo sem nome conhecido. Quando o apresentador parafraseia alguém, é "apresentador".
- `fonte`: a fonte que a fala nomeia, ou uma obra que você identifica com segurança. Nunca invente fonte; sem ela, omita o campo, e a tela avisa o operador. Escreva `fonte` uma vez só na cena: em fonte_referencia ele já é o campo principal.
- citacao_autor: para o que foi dito ou lido literalmente, com `autor` sendo quem disse. A paráfrase do apresentador vai em enfase ou card_informacao. Nome próprio com grafia errada na legenda se corrige no texto da cena, não em `frase_da_fala`.
- destaque_numerico: para número que a fala dá como fato. Número de exemplo ou hipótese leva "Exemplo" em `subtexto`; o rótulo "Dado" é a tela que põe, nunca o `subtexto`.
- ficha_biografica e marco_historico: datas e obras; cargo ou situação atual só se a fala disser."""

_PEDE_A_FRASE = {"destaque_numerico", "citacao_autor"}
_VEM_DA_MEMORIA = {"ficha_biografica", "marco_historico", "linha_tempo"}

# A frase costuma estar logo ao lado da cena; longe disso, um casamento seria acaso.
_JANELA_DA_FRASE_SEG = 45.0
_MINIMO_DA_FRASE_NA_FALA = 0.6
_MINIMO_DA_CITACAO_LITERAL = 0.8
_QUEM_NAO_ACUSA_AUTOR = "video_reagido"
_MAIOR_CONECTIVO = 3

_POR_EXTENSO = {
    "um": "1",
    "uma": "1",
    "dois": "2",
    "duas": "2",
    "três": "3",
    "quatro": "4",
    "cinco": "5",
    "seis": "6",
    "sete": "7",
    "oito": "8",
    "nove": "9",
    "dez": "10",
    "vinte": "20",
    "trinta": "30",
    "quarenta": "40",
    "cinquenta": "50",
    "cem": "100",
}
_NUMERO = re.compile(r"\d[\d.,/]*\d|\d")
_MILHAR = re.compile(r"(\d+)\s+mil\b")
_PALAVRA_NUMERICA = re.compile(rf"\b({'|'.join(_POR_EXTENSO)})\b")


def _nucleos_numericos(texto: str) -> set[str]:
    """Os números do texto sem separador: "R$ 3.000" e "3 mil" são ambos "3000"."""
    corrigido = re.sub(r"\bum terço\b", "1/3", str(texto).casefold())
    corrigido = _PALAVRA_NUMERICA.sub(lambda m: _POR_EXTENSO[m.group(1)], corrigido)
    corrigido = _MILHAR.sub(r"\g<1>000", corrigido)
    corrigido = re.sub(r"\bmil\b", "1000", corrigido)
    return {re.sub(r"[.,/]", "", numero) for numero in _NUMERO.findall(corrigido)}


def _frase_esta_na_fala(frase: str, inicio: float, palavras: list[dict]) -> bool:
    tokens_frase = _tokenizar(frase)
    if not tokens_frase:
        return False
    janela: list[str] = []
    for palavra in palavras:
        if abs(float(palavra["inicio_seg"]) - inicio) <= _JANELA_DA_FRASE_SEG:
            janela.extend(_tokenizar(str(palavra.get("texto") or "")))
    casamento = SequenceMatcher(None, tokens_frase, janela, autojunk=False).find_longest_match(
        0, len(tokens_frase), 0, len(janela)
    )
    return casamento.size / len(tokens_frase) >= _MINIMO_DA_FRASE_NA_FALA


def _citacao_e_literal(texto: str, frase: str) -> bool:
    tokens_texto = _tokenizar(texto)
    if not tokens_texto:
        return True
    blocos = SequenceMatcher(
        None, tokens_texto, _tokenizar(frase), autojunk=False
    ).get_matching_blocks()
    return sum(bloco.size for bloco in blocos) / len(tokens_texto) >= _MINIMO_DA_CITACAO_LITERAL


def _nomes(texto: str) -> set[str]:
    """As palavras que identificam alguém: "de" e "da" não dizem quem é."""
    return {token for token in _tokenizar(texto) if len(token) > _MAIOR_CONECTIVO}


def _autor_e_quem_disse(autor: str, quem_disse: str) -> bool:
    if quem_disse.strip().casefold() == _QUEM_NAO_ACUSA_AUTOR:
        return True
    return bool(_nomes(autor) & _nomes(quem_disse))


def _avisos_da_frase(cena: dict, frase: str, palavras: list[dict]) -> list[tuple[str, str]]:
    avisos: list[tuple[str, str]] = []
    if palavras and not _frase_esta_na_fala(frase, cena["inicio"], palavras):
        avisos.append(("frase_fora_da_fala", "A frase citada não está na fala perto desta cena."))
    if cena["tipo"] == "destaque_numerico":
        numero = cena.get("numero", cena.get("texto")) or ""
        if not _nucleos_numericos(numero) <= _nucleos_numericos(frase):
            avisos.append(("numero_fora_da_frase", f"O número {numero} não aparece na frase."))
    if cena["tipo"] == "citacao_autor":
        if not _citacao_e_literal(str(cena.get("texto") or ""), frase):
            avisos.append(("citacao_nao_literal", "O texto entre aspas não é o que foi dito."))
        autor, quem_disse = cena.get("autor"), cena.get("quem_disse")
        if autor and quem_disse and not _autor_e_quem_disse(str(autor), str(quem_disse)):
            avisos.append(
                (
                    "autor_nao_e_quem_disse",
                    f"Entre aspas como {autor}, mas quem disse foi {quem_disse}.",
                )
            )
    return avisos


def _avisos_da_cena(cena: dict, palavras: list[dict]) -> list[tuple[str, str]]:
    avisos: list[tuple[str, str]] = []
    frase, fonte = cena.get("frase_da_fala"), cena.get("fonte")
    if cena.get("ancora_perdida"):
        avisos.append(
            ("frase_saiu_do_corte", "A frase desta cena saiu do corte; ela ficou onde estava.")
        )
    if cena.get("tipo") in _VEM_DA_MEMORIA and not fonte:
        avisos.append(
            (
                "ficha_da_memoria",
                "Datas e cargo vêm da memória da IA: confira o que muda com o tempo.",
            )
        )
    if cena.get("tipo") in _PEDE_A_FRASE and not frase and not fonte:
        avisos.append(("sem_fonte", "Sem frase da fala nem fonte: de onde veio?"))
    # A frase que saiu do corte já tem o seu aviso: "fora da fala" seria repeti-lo.
    if frase and not cena.get("ancora_perdida"):
        avisos.extend(_avisos_da_frase(cena, str(frase), palavras))
    return avisos


def conferir_cenas(cenas: list, transcricao_final: list) -> list[dict]:
    """Os avisos de origem de cada cena, identificada por `tipo` + `inicio`. Não altera nada."""
    palavras = achatar_palavras(transcricao_final)
    avisos = []
    for cena in cenas:
        if not isinstance(cena, dict):
            continue
        normalizada = normalizar_cena_remotion(cena)
        avisos.extend(
            {
                "tipo": normalizada.get("tipo"),
                "inicio": normalizada["inicio"],
                "codigo": codigo,
                "mensagem": mensagem,
            }
            for codigo, mensagem in _avisos_da_cena(normalizada, palavras)
        )
    return avisos
