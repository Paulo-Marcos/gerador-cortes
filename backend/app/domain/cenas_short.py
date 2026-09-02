"""Domínio das cenas do short — o que é uma cena válida (E-037, D-494).

As quatro cenas verticais existem no renderer desde a D-465 e o render as
desenha. O que faltava era poder criá-las: `Short.cenas_remotion` nascia `"[]"` e
ficava assim para sempre.

O repertório é DELIBERADAMENTE pequeno — quatro tipos, espelhando
`video-renderer/src/cenas-shorts/schema.ts`. Um short tem 15 a 90 segundos e uma
ideia só: repertório grande aqui não é riqueza, é distração, e cada tipo a mais
é um tipo que a IA (ou o operador com pressa) pode escolher errado.

Reusa `cenas_validator.verificar_sobreposicao` do horizontal: sobreposição é a
mesma pergunta nos dois formatos, e duas respostas divergiriam.

Sem I/O.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.domain.cenas_validator import verificar_sobreposicao


class TipoCenaShort(str, Enum):
    """Cada tipo resolve um momento do short — não são estilos intercambiáveis.

    HOOK    — o cartão de abertura que segura os 3 primeiros segundos.
    NUMERO  — o dado que sustenta o argumento.
    CITACAO — a frase que vale ser lida, não só ouvida.
    CTA     — o convite para o vídeo longo, no fim.
    """

    HOOK = "hook"
    NUMERO = "numero"
    CITACAO = "citacao"
    CTA = "cta"


# Duração mínima de uma cena. Abaixo disso o olho não completa a leitura, e uma
# cena que ninguém lê é overlay tapando o vídeo de graça.
DURACAO_MINIMA_SEG = 0.8

_TEXTO_MAXIMO = 240


@dataclass(frozen=True)
class CenaShort:
    """Uma cena na timeline do SHORT — que começa no zero, não na do bruto."""

    tipo: TipoCenaShort
    inicio: float
    fim: float
    texto: str
    apoio: str = ""

    @property
    def duracao(self) -> float:
        return round(self.fim - self.inicio, 2)

    def para_json(self) -> dict:
        """O formato que o Remotion consome (`schema.ts`)."""
        base = {
            "tipo": self.tipo.value,
            "inicio": self.inicio,
            "fim": self.fim,
            "texto": self.texto,
        }
        # `apoio` só entra quando existe: o schema o declara opcional, e mandar
        # string vazia faria a cena desenhar uma linha de apoio em branco.
        if self.apoio:
            base["apoio"] = self.apoio
        return base


class CenaInvalida(ValueError):
    """A cena não cabe no short, ou não diz nada.

    Erro explícito em vez de correção silenciosa: uma cena que o sistema
    "conserta" sozinho aparece no arquivo diferente do que o operador escreveu,
    e ele só descobre depois do render.
    """


def normalizar(bruta: dict, duracao_short: float) -> CenaShort:
    """Valida e converte uma cena vinda da tela.

    Levanta `CenaInvalida` com o motivo — a tela repete o motivo para o
    operador, então ele precisa dizer o que fazer, não só que deu errado.
    """
    tipo = _tipo_de(bruta.get("tipo"))
    texto = str(bruta.get("texto") or "").strip()
    if not texto:
        raise CenaInvalida("A cena precisa de um texto — é o que ela existe para dizer.")
    if len(texto) > _TEXTO_MAXIMO:
        raise CenaInvalida(
            f"Texto de {len(texto)} caracteres não cabe num short; o limite é {_TEXTO_MAXIMO}."
        )

    inicio = _segundo(bruta.get("inicio"), "início")
    fim = _segundo(bruta.get("fim"), "fim")
    if fim - inicio < DURACAO_MINIMA_SEG:
        raise CenaInvalida(f"A cena tem menos de {DURACAO_MINIMA_SEG}s — ninguém termina de ler.")
    if duracao_short > 0 and fim > duracao_short + 0.01:
        raise CenaInvalida(f"A cena termina em {fim:.1f}s e o short tem {duracao_short:.1f}s.")

    return CenaShort(
        tipo=tipo,
        inicio=round(inicio, 2),
        fim=round(fim, 2),
        texto=texto,
        apoio=str(bruta.get("apoio") or "").strip(),
    )


def normalizar_lista(brutas: list[dict], duracao_short: float) -> list[CenaShort]:
    """As cenas do short, ordenadas e sem sobreposição.

    Sobreposição é RECUSADA, não empilhada: duas cenas no mesmo instante se
    desenham uma sobre a outra, e o resultado é ilegível — o operador veria só a
    de cima e não entenderia por que a outra sumiu.
    """
    cenas = [normalizar(bruta, duracao_short) for bruta in brutas]
    cenas.sort(key=lambda c: c.inicio)

    for anterior, seguinte in zip(cenas, cenas[1:], strict=False):
        if verificar_sobreposicao(
            {"inicio": anterior.inicio, "fim": anterior.fim},
            {"inicio": seguinte.inicio, "fim": seguinte.fim},
        ):
            raise CenaInvalida(
                f"As cenas de {anterior.inicio:.1f}s e {seguinte.inicio:.1f}s se sobrepõem — "
                "uma taparia a outra."
            )
    return cenas


def sugerir_janela(cenas: list[CenaShort], duracao_short: float) -> tuple[float, float]:
    """Onde uma cena nova cabe, dado o que já existe.

    Procura o primeiro vão livre a partir do começo. Nascer sobre uma cena
    existente obrigaria o operador a arrumar antes de escrever, que é a ordem
    inversa da que ele tem em mente.
    """
    padrao = min(3.0, max(DURACAO_MINIMA_SEG, duracao_short))
    cursor = 0.0
    for cena in sorted(cenas, key=lambda c: c.inicio):
        if cena.inicio - cursor >= padrao:
            return (round(cursor, 2), round(cursor + padrao, 2))
        cursor = max(cursor, cena.fim)

    if duracao_short <= 0 or duracao_short - cursor >= padrao:
        return (round(cursor, 2), round(cursor + padrao, 2))

    # Não há vão: encosta no fim, e a validação dirá se ainda cabe.
    return (round(max(0.0, duracao_short - padrao), 2), round(duracao_short, 2))


def _tipo_de(valor: object) -> TipoCenaShort:
    try:
        return TipoCenaShort(str(valor))
    except ValueError as exc:
        validos = ", ".join(t.value for t in TipoCenaShort)
        raise CenaInvalida(f"Tipo {valor!r} não existe. Os tipos são: {validos}.") from exc


def _segundo(valor: object, nome: str) -> float:
    try:
        numero = float(valor)  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise CenaInvalida(f"O {nome} da cena precisa ser um número de segundos.") from exc
    if numero < 0:
        raise CenaInvalida(f"O {nome} da cena não pode ser negativo.")
    return numero
