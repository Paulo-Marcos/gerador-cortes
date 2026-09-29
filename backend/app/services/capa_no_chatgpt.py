"""Gerar a capa no ChatGPT do operador, sem copiar e colar (D-804).

O fluxo que o operador fazia à mão, agora feito pelo robô na janela dele:
abrir o projeto do ChatGPT, anexar as fichas do mascote, colar o prompt, esperar
a imagem e trazê-la de volta. O porquê de ser o navegador está em
`domain/compartilhado/chatgpt_imagem.py`.

## O que este módulo NÃO faz

Não salva a capa. Devolve os bytes da imagem, e quem pediu entrega ao mesmo
caminho que o Ctrl+V usa (thumbnail do YouTube com moldura, arte do TikTok
montada, arte do short). Assim o robô não precisa conhecer as três capas, e o
que acontece com a imagem depois continua num lugar só.

Não sabe senha: o operador loga uma vez na janela do robô, e o perfil guarda a
sessão (ver `navegador_assistido`).
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import shutil
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

from app.core import channel_paths
from app.domain.compartilhado.chatgpt_imagem import (
    EXTENSOES_DE_FICHA,
    MAXIMO_DE_FICHAS,
    SELETORES,
    TRECHO_DA_TELA_DE_LOGIN,
    montar_pedido,
    nome_de_ficha_valido,
    tipo_da_imagem,
    url_do_projeto_valida,
)
from app.domain.compartilhado.erros import NaoEncontrado, PedidoInvalido, ServicoExternoFalhou
from app.infrastructure import capa_chatgpt_store
from app.services import janela_do_robo, navegador_assistido

logger = logging.getLogger(__name__)

# Segundos. A geração medida em 28/09/2026 levou ~50 s no plano Go; o prazo
# folga para fila e horário de pico sem prender a tela para sempre.
PRAZO_PARA_ABRIR = 45
PRAZO_PARA_O_CAMPO = 30
PRAZO_PARA_ANEXAR = 90
PRAZO_PARA_GERAR = 300
# Depois que a resposta termina sem imagem, quanto esperar antes de desistir: o
# botão de parar demora um instante a aparecer logo após o envio.
TOLERANCIA_SEM_IMAGEM = 20
INTERVALO_DE_CONFERENCIA = 2
# A imagem troca de versão (prévia borrada → final) no fim; um respiro evita
# baixar a prévia.
RESPIRO_ANTES_DE_BAIXAR = 2

PLATAFORMA = "chatgpt"

# Uma geração por vez: duas abas disputando o mesmo perfil e a mesma cota do
# plano não ganham nada, e o operador perderia de vista qual aba é de qual capa.
_UMA_POR_VEZ = threading.Lock()


class PaginaDoChatGPT(Protocol):
    """Os verbos de que o roteiro precisa — nenhum seletor (ver `SELETORES`)."""

    def abrir(self, url: str, *, segundos: float) -> None: ...
    def url_atual(self) -> str: ...
    def existe(self, alvo: str, *, segundos: float, visivel: bool = True) -> bool: ...
    def enviar_arquivos(self, alvo: str, caminhos: list[Path], *, segundos: float) -> None: ...
    def escrever(self, alvo: str, texto: str, *, segundos: float) -> None: ...
    def esperar_habilitado(self, alvo: str, *, segundos: float) -> None: ...
    def clicar(self, alvo: str, *, segundos: float) -> None: ...
    def baixar_imagem(self, alvo: str) -> bytes: ...
    def fechar(self) -> None: ...


class PaginaDoPlaywrightNoChatGPT(navegador_assistido.PaginaDoPlaywright):
    """A `PaginaDoPlaywright` com os dois verbos que só o ChatGPT pede, por ora."""

    def enviar_arquivos(self, alvo: str, caminhos: list[Path], *, segundos: float) -> None:
        """Todas as fichas no mesmo `<input multiple>`, numa entrega só.

        Uma por vez não serve: cada entrega SUBSTITUI a anterior no input, e o
        ChatGPT receberia só a última. Por CDP pelo mesmo motivo da entrega de
        um arquivo só (`PaginaDoPlaywright.enviar_arquivo`): vai o caminho, e o
        navegador lê do disco.
        """
        css = self._css(alvo)
        self._page.locator(css).first.wait_for(state="attached", timeout=segundos * 1000)
        sessao = self._page.context.new_cdp_session(self._page)
        try:
            achado = sessao.send(
                "Runtime.evaluate", {"expression": f"document.querySelector({json.dumps(css)})"}
            )
            sessao.send(
                "DOM.setFileInputFiles",
                {
                    "files": [str(c.resolve()) for c in caminhos],
                    "objectId": achado["result"]["objectId"],
                },
            )
        finally:
            sessao.detach()

    def baixar_imagem(self, alvo: str) -> bytes:
        """Os bytes da ÚLTIMA imagem que casa com `alvo`, lidos de dentro da página.

        De dentro, e não por uma requisição nossa: o ChatGPT entrega a imagem
        como `blob:`, uma URL que só existe no documento que a criou. O `fetch`
        roda lá e devolve base64, que é o que atravessa o CDP sem virar texto.
        """
        codificado = self._page.evaluate(
            """async (css) => {
              const imagens = document.querySelectorAll(css);
              const img = imagens[imagens.length - 1];
              if (!img) return "";
              const blob = await (await fetch(img.src)).blob();
              const bytes = new Uint8Array(await blob.arrayBuffer());
              let bin = "";
              for (let i = 0; i < bytes.length; i += 0x8000) {
                bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
              }
              return btoa(bin);
            }""",
            self._css(alvo),
        )
        return base64.b64decode(codificado) if codificado else b""

    def fechar(self) -> None:
        """Fecha a aba. Falhar aqui não pode custar a imagem que já veio."""
        try:
            self._page.close()
        except Exception as exc:  # noqa: BLE001 — aba já fechada pelo operador
            logger.info("[ChatGPT] não consegui fechar a aba: %s", exc)


def edge_no_disco() -> Path | None:
    """O Edge da máquina, ou None (aí o robô abre no Chrome, como os outros).

    Edge porque é o navegador do dia a dia do operador. Para o CDP tanto faz:
    os dois são Chromium, e porta, perfil e conexão seguem iguais.
    """
    candidatos = [
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    ]
    achado = next((c for c in candidatos if c.is_file()), None)
    if achado is None and (no_path := shutil.which("msedge")):
        achado = Path(no_path)
    return achado


# --------------------------------------------------------------------------- #
# Configuração do canal: o link do projeto (banco) e as fichas (pasta)
# --------------------------------------------------------------------------- #


def _banco_e_canal() -> tuple[Path, str]:
    return channel_paths.settings_db_path(), channel_paths.active_channel_root().name


def _fichas() -> list[Path]:
    pasta = channel_paths.fichas_do_chatgpt_dir()
    if not pasta.is_dir():
        return []
    return sorted(
        (p for p in pasta.iterdir() if p.is_file() and p.suffix.lower() in EXTENSOES_DE_FICHA),
        key=lambda p: p.name,
    )


def ler_configuracao() -> dict:
    """O que a tela de Canais mostra: o link do projeto e as fichas do canal ativo."""
    banco, canal = _banco_e_canal()
    return {
        "projeto_url": capa_chatgpt_store.ler_projeto(banco, canal),
        "fichas": [p.name for p in _fichas()],
        "maximo_de_fichas": MAXIMO_DE_FICHAS,
    }


def gravar_projeto(projeto_url: str) -> dict:
    """Grava o link do projeto (vazio desliga a integração) e devolve a configuração."""
    banco, canal = _banco_e_canal()
    capa_chatgpt_store.gravar_projeto(banco, canal, url_do_projeto_valida(projeto_url))
    return ler_configuracao()


def salvar_ficha(nome_original: str, conteudo: bytes) -> dict:
    """Guarda uma ficha do mascote; o mesmo nome substitui a anterior."""
    nome = nome_de_ficha_valido(nome_original)
    if not tipo_da_imagem(conteudo):
        raise PedidoInvalido("O arquivo não é uma imagem PNG, JPG ou WEBP.")
    existentes = {p.name for p in _fichas()}
    if nome not in existentes and len(existentes) >= MAXIMO_DE_FICHAS:
        raise PedidoInvalido(f"No máximo {MAXIMO_DE_FICHAS} fichas: remova uma antes.")
    pasta = channel_paths.fichas_do_chatgpt_dir()
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / nome).write_bytes(conteudo)
    return ler_configuracao()


def caminho_da_ficha(nome: str) -> Path:
    """O arquivo de uma ficha pelo nome, ou `NaoEncontrado`."""
    alvo = next((p for p in _fichas() if p.name == nome), None)
    if alvo is None:
        raise NaoEncontrado(f"Ficha não encontrada: {nome}")
    return alvo


def remover_ficha(nome: str) -> dict:
    caminho_da_ficha(nome).unlink()
    return ler_configuracao()


# --------------------------------------------------------------------------- #
# O roteiro
# --------------------------------------------------------------------------- #


def executar_roteiro(
    pagina: PaginaDoChatGPT,
    *,
    projeto_url: str,
    pedido: str,
    fichas: list[Path],
    dormir: Callable[[float], None] = time.sleep,
    agora: Callable[[], float] = time.monotonic,
) -> bytes:
    """Chat novo no projeto → fichas → pedido → enviar → esperar → baixar.

    Cada falha diz ao operador o que fazer, porque é ele quem está olhando a
    janela: o texto chega inteiro à tela.
    """
    pagina.abrir(projeto_url, segundos=PRAZO_PARA_ABRIR)
    if TRECHO_DA_TELA_DE_LOGIN in pagina.url_atual():
        raise ServicoExternoFalhou(
            "O ChatGPT pediu login na janela do robô. Entre na sua conta ali uma vez "
            "e tente de novo — a sessão fica guardada."
        )
    if not pagina.existe("campo_do_prompt", segundos=PRAZO_PARA_O_CAMPO):
        raise ServicoExternoFalhou(
            "Não achei a caixa de mensagem do projeto. Confira na janela do robô se o "
            "projeto abriu; se a tela do ChatGPT mudou, o robô precisa de ajuste."
        )

    if fichas:
        pagina.enviar_arquivos("anexo_de_fotos", fichas, segundos=PRAZO_PARA_O_CAMPO)
    pagina.escrever("campo_do_prompt", pedido, segundos=PRAZO_PARA_O_CAMPO)
    try:
        # O botão só habilita quando as fichas terminam de subir.
        pagina.esperar_habilitado("enviar", segundos=PRAZO_PARA_ANEXAR)
    except Exception as exc:  # noqa: BLE001 — o do Playwright não é o TimeoutError do Python
        raise ServicoExternoFalhou(
            "O ChatGPT não liberou o envio (as fichas não terminaram de subir?). "
            "A mensagem ficou pronta na janela do robô: envie por lá se quiser."
        ) from exc
    pagina.clicar("enviar", segundos=PRAZO_PARA_O_CAMPO)

    _esperar_a_imagem(pagina, dormir=dormir, agora=agora)
    dormir(RESPIRO_ANTES_DE_BAIXAR)
    imagem = pagina.baixar_imagem("imagem_gerada")
    if not imagem:
        raise ServicoExternoFalhou(
            "A imagem apareceu, mas não consegui baixá-la. Copie pela janela do robô."
        )
    # D-821: uma aba por capa acumulava dezenas abertas. Com a imagem em mãos a
    # aba não serve mais (a conversa fica no histórico do projeto); nos erros
    # acima ela FICA, porque é nela que o operador vê o motivo.
    pagina.fechar()
    return imagem


def _esperar_a_imagem(
    pagina: PaginaDoChatGPT, *, dormir: Callable[[float], None], agora: Callable[[], float]
) -> None:
    """Até a imagem existir E a resposta terminar.

    Só a imagem não basta: a prévia borrada aparece antes da final. Só o fim da
    resposta também não: uma recusa ou o limite do plano terminam sem imagem, e
    esperar o prazo inteiro por ela prenderia a tela à toa.
    """
    limite = agora() + PRAZO_PARA_GERAR
    parado_desde: float | None = None
    while agora() < limite:
        tem_imagem = pagina.existe("imagem_gerada", segundos=0.5, visivel=False)
        gerando = pagina.existe("parar", segundos=0.5)
        if tem_imagem and not gerando:
            return
        if gerando or tem_imagem:
            parado_desde = None
        else:
            if parado_desde is None:
                parado_desde = agora()
            if agora() - parado_desde >= TOLERANCIA_SEM_IMAGEM:
                raise ServicoExternoFalhou(
                    "O ChatGPT respondeu sem imagem — recusa ou limite do plano. "
                    "A resposta está na janela do robô."
                )
        dormir(INTERVALO_DE_CONFERENCIA)
    raise ServicoExternoFalhou(
        f"A imagem não ficou pronta em {PRAZO_PARA_GERAR // 60} minutos. "
        "Se ela aparecer na janela do robô, copie e cole na capa."
    )


def _gerar_no_navegador(projeto_url: str, pedido: str, fichas: list[Path]) -> bytes:
    """A parte síncrona: Playwright sync numa thread (o async quebra no uvicorn/Windows, D-369)."""
    perfil = navegador_assistido.perfil_do_canal(PLATAFORMA)
    with _UMA_POR_VEZ:
        try:
            # Abre pelo `garantir_chrome` (a fila de abertura e a porta do perfil
            # são as dos outros robôs) e só depois conecta.
            abriu_agora = navegador_assistido.garantir_chrome(
                perfil, projeto_url, executavel=edge_no_disco()
            )
            with navegador_assistido.sessao_no_chrome(perfil) as (navegador, _):
                contexto = navegador.contexts[0]
                # A janela recém-aberta já está no projeto; senão, aba nova — a
                # anterior pode ser a conversa que o operador ainda está usando.
                aba = contexto.pages[0] if abriu_agora and contexto.pages else contexto.new_page()
                aba.bring_to_front()
                pagina = PaginaDoPlaywrightNoChatGPT(aba, SELETORES, escapar_apos_escrever=False)
                return executar_roteiro(
                    pagina, projeto_url=projeto_url, pedido=pedido, fichas=fichas
                )
        except (
            navegador_assistido.NavegadorIndisponivel,
            navegador_assistido.PlaywrightAusente,
        ) as exc:
            raise ServicoExternoFalhou(f"Não consegui abrir o navegador do robô: {exc}") from exc
        except ServicoExternoFalhou:
            _mostrar_janela(perfil)
            raise
        except Exception as exc:  # noqa: BLE001 — aba fechada, tela mudou: dizer onde parou
            logger.warning("[ChatGPT] o robô parou: %s", exc)
            _mostrar_janela(perfil)
            # Exceção sem mensagem não pode virar um IndexError aqui dentro.
            motivo = (str(exc).splitlines() or [type(exc).__name__])[0]
            raise ServicoExternoFalhou(
                f"O robô parou no meio, na janela do ChatGPT: {motivo}"
            ) from exc


def _mostrar_janela(perfil: Path) -> None:
    """Traz a janela do robô de volta quando só o operador resolve (D-799).

    Ela nasce fora da tela; login, recusa e prazo estourado são lidos NELA.
    """
    janela_do_robo.mostrar(navegador_assistido.sessao_no_chrome(perfil))


async def gerar_imagem(prompt: str, proporcao: str) -> tuple[bytes, str]:
    """A imagem gerada no ChatGPT e o tipo dela (`image/png`, ...)."""
    pedido = montar_pedido(prompt, proporcao)
    projeto_url = ler_configuracao()["projeto_url"]
    if not projeto_url:
        raise PedidoInvalido("Configure o link do projeto do ChatGPT em Canais → Capas no ChatGPT.")
    fichas = _fichas()
    logger.info("[ChatGPT] gerando capa %s com %d ficha(s)", proporcao, len(fichas))
    imagem = await asyncio.to_thread(_gerar_no_navegador, projeto_url, pedido, fichas)
    tipo = tipo_da_imagem(imagem)
    if not tipo:
        raise ServicoExternoFalhou("O ChatGPT devolveu um arquivo que não é imagem.")
    return imagem, tipo
