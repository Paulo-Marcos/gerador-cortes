"""A capa no TikTok Studio: aplicar, provar que ficou e tentar de novo (D-537, D-545, D-799).

Saiu do `tiktok_studio` por dois motivos. A capa é o passo que mais falha, e o
único que ganhou lógica própria de insistência; e o roteiro já estava no teto
de tamanho que o CI confere.

## O que é "salvou"

O TikTok SEMPRE mostra alguma capa — um quadro do vídeo. Então "existe capa"
não prova nada; o que prova é a miniatura ter MUDADO (D-545). A leitura única
logo depois do Salvar dava falso negativo quando a miniatura se atualizava com
atraso; agora a conferência espera alguns segundos pela troca.

## Por que tentar de novo

O relato do operador (28/09/2026) era "vira e mexe não salva". Um clique que
chega enquanto a página redesenha não falha com erro — ele só não acontece.
Uma segunda passada, com o editor reaberto do zero, cobre esse acaso sem
esconder o defeito de verdade: se as duas falharem, o motivo chega à tela.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

from app.services.navegador_assistido import Pagina

logger = logging.getLogger(__name__)

SEGUNDOS_PARA_CAPA = 20.0
# Quanto esperamos a miniatura trocar depois do Salvar, e de quanto em quanto.
SEGUNDOS_PARA_A_MINIATURA = 5.0
INTERVALO_DA_MINIATURA = 0.25
TENTATIVAS = 2

CAPA_FORA_DO_DISCO = "A capa nao esta mais em disco; o TikTok vai congelar um frame."


def aplicar_no_roteiro(pagina: Pagina, capa: Path | None) -> tuple[bool, str]:
    """A capa como passo do roteiro: `(aplicada, aviso)`. Nunca levanta.

    Sem capa pedida, não há o que fazer nem o que avisar. Capa pedida e fora do
    disco vira aviso: o vídeo sobe do mesmo jeito, com um quadro qualquer.
    """
    if capa is None:
        return False, ""
    if not capa.is_file():
        return False, CAPA_FORA_DO_DISCO
    erro = aplicar(pagina, capa)
    if erro:
        logger.warning("[TikTokStudio] capa nao entrou: %s", erro)
        return False, erro
    return True, ""


def aplicar(pagina: Pagina, capa: Path) -> str:
    """Troca a capa em até `TENTATIVAS` passadas; vazio quando entrou, ou o motivo."""
    motivo = ""
    for tentativa in range(1, TENTATIVAS + 1):
        motivo = _tentar(pagina, capa)
        if not motivo:
            if tentativa > 1:
                logger.info("[TikTokStudio] capa entrou na tentativa %d", tentativa)
            return ""
        logger.info("[TikTokStudio] capa, tentativa %d: %s", tentativa, motivo)
        _preparar_nova_tentativa(pagina)
    return motivo


def _preparar_nova_tentativa(pagina: Pagina) -> None:
    """Tira da frente o que pode ter engolido o clique da passada anterior.

    O tour de novidades nasce tarde e cobre a página com um overlay que
    intercepta cliques (ver `_dispensar_tutorial`); se ele chegou depois da
    primeira dispensa, é ele quem estava no caminho.
    """
    try:
        pagina.remover("overlay_do_tutorial")
    except Exception as exc:  # noqa: BLE001 — faxina, nunca decide
        logger.debug("[TikTokStudio] overlay: %s", exc)


def _tentar(pagina: Pagina, capa: Path) -> str:
    """Uma passada: abrir o editor, entregar a imagem, salvar e conferir.

    Não há passo de "clicar em Upload cover": o `<input type=file>` do modal já
    nasce no DOM, e entregar o arquivo direto a ele dispensa o clique na área
    de arrastar — que é só a fachada dele.
    """
    try:
        if not pagina.existe("botao_da_capa", segundos=SEGUNDOS_PARA_CAPA):
            return "Nao achei o botao de editar capa."
        pagina.clicar("botao_da_capa", segundos=SEGUNDOS_PARA_CAPA)

        # A miniatura de ANTES: é ela que dirá se a troca pegou.
        antes = _miniatura(pagina)

        pagina.enviar_arquivo("campo_da_capa", capa, segundos=SEGUNDOS_PARA_CAPA)

        if not pagina.existe("confirmar_capa", segundos=SEGUNDOS_PARA_CAPA):
            return "O modal da capa abriu, mas nao achei o botao de salvar."

        # D-545: ESPERAR o Salvar habilitar antes de clicar. O TikTok o mantém
        # desabilitado enquanto processa a imagem, e um clique nesse intervalo
        # não é recusado com erro — ele simplesmente não acontece.
        pagina.esperar_habilitado("confirmar_capa", segundos=SEGUNDOS_PARA_CAPA)
        pagina.clicar("confirmar_capa", segundos=SEGUNDOS_PARA_CAPA)
        pagina.esperar_sumir("dialogo", segundos=SEGUNDOS_PARA_CAPA)

        # Diálogo ainda aberto = o clique não fechou nada. Um segundo clique
        # cobre o caso de o primeiro ter pego o botão no meio da habilitação.
        if pagina.existe("dialogo", segundos=1.0):
            pagina.clicar("confirmar_capa", segundos=SEGUNDOS_PARA_CAPA)
            pagina.esperar_sumir("dialogo", segundos=SEGUNDOS_PARA_CAPA)

        if not _miniatura_mudou(pagina, antes):
            return "Cliquei em salvar, mas a capa na pagina continua a mesma."
        return ""
    except Exception as exc:  # noqa: BLE001 — qualquer falha aqui vira aviso
        return f"{type(exc).__name__}: {exc}"


def _miniatura(pagina: Pagina) -> str:
    """O `src` da miniatura da capa, ou vazio quando não dá para ler."""
    try:
        return pagina.atributo_de("miniatura_da_capa", "src")
    except Exception:  # noqa: BLE001 — sem miniatura a comparação é inconclusiva
        return ""


def _miniatura_mudou(pagina: Pagina, antes: str) -> bool:
    """A miniatura trocou de imagem, dentro do prazo? Vazia não conta como troca."""
    limite = time.monotonic() + SEGUNDOS_PARA_A_MINIATURA
    while True:
        atual = _miniatura(pagina)
        if atual and atual != antes:
            return True
        if time.monotonic() >= limite:
            return False
        time.sleep(INTERVALO_DA_MINIATURA)
