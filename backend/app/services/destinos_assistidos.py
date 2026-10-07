"""Os destinos com o robô no volante: TikTok e Instagram Reels (D-564, D-799).

## O terceiro modo, e por que ele não é nenhum dos dois

O pacote manual entrega uma pasta e vai embora; a API sobe e acabou. Este fica
no meio, e é o que as duas plataformas permitem hoje: o robô abre o Chrome do
operador, sobe o MP4, escreve a legenda, põe a capa — e o post só existe quando
alguém aperta *Publicar*.

## Esperar ou não esperar a publicação (D-799)

Até a D-799 o destino BLOQUEAVA até o operador publicar, e isso encadeava o
lote: o item seguinte só subia depois do clique no anterior. Na prática o
operador ficava de babá, um vídeo por vez — o "tenho de fazer um por um".

Com `sem_esperar`, o destino devolve a aba pronta e a MARCA dela, e quem chama
vigia em segundo plano. A raia segue para o próximo vídeo, e o operador revisa
tudo de uma vez no fim. O medo antigo — duas abas de upload confundirem a
vigília e marcarem o vídeo errado (D-512) — acabou quando cada aba ganhou a sua
marca (D-564): a vigília procura a etiqueta, não "a aba que está em /upload".

## `publicar_sozinho`

Desligado por padrão, e ligado por lote — nunca por conta própria. Com ele o
robô também clica em *Publicar*: até esse clique tudo é reversível com um F5, e
depois dele uma legenda errada é um post público no canal. E, desde a D-799,
ele só clica com a capa confirmada (RN-26).
"""

from __future__ import annotations

import asyncio
import threading
from pathlib import Path
from types import ModuleType
from uuid import uuid4

from app.domain.publicacao.agendamento import Agendamento
from app.domain.publicacao.publicacao import ModoPublicacao, Plataforma, legenda_unica
from app.domain.publicacao.tiktok_studio import Passo, RoteiroInterrompido, marca_da_aba
from app.services import janela_do_robo
from app.services.destinos_shorts import DestinoManual
from app.services.navegador_assistido import sessao_no_chrome
from app.services.publicacao_destinos import PacotePublicacao


class ConferirNaAba(RuntimeError):
    """O robô clicou em Publicar e a página não confirmou (D-894).

    Carrega a MARCA da aba, e o destino que sabe vigiá-la, porque o post pode
    ter saído: quem chama vigia aquela aba, e não "a que está em /upload" —
    num lote há várias.
    """

    def __init__(self, destino: DestinoAssistido, marca: str, orientacao: str) -> None:
        self.destino = destino
        self.marca = marca
        super().__init__(orientacao)


class DestinoAssistido(DestinoManual):
    """O que os dois robôs fazem igual: subir, passar a vez e vigiar."""

    modo = ModoPublicacao.ASSISTIDO

    def __init__(
        self,
        plataforma: Plataforma,
        *,
        publicar_sozinho: bool = False,
        ao_ficar_pronta=None,
        segundos_de_vigilia: float | None = None,
        agendamento: Agendamento | None = None,
        parar_espera: threading.Event | None = None,
        sem_esperar: bool = False,
    ) -> None:
        super().__init__(plataforma)
        self.publicar_sozinho = publicar_sozinho
        self.agendamento = agendamento
        # D-591: o lote acende isto para tirar a vigília da espera — cancelando,
        # ou porque o operador já marcou "publiquei".
        self.parar_espera = parar_espera
        # Chamado quando a aba está pronta e a bola passa para o operador. É o
        # que faz a tela dizer "sua vez" DURANTE a espera.
        self.ao_ficar_pronta = ao_ficar_pronta
        self.segundos_de_vigilia = segundos_de_vigilia
        self.sem_esperar = sem_esperar

    def _robo(self) -> ModuleType:
        """O módulo do robô: `subir_assistido`, `aguardar_publicacao`, `perfil_do_chrome`."""
        raise NotImplementedError

    async def _subir(self, pronto: dict, marca: str) -> dict:
        raise NotImplementedError

    @staticmethod
    def _legenda(pronto: dict) -> str:
        return legenda_unica(pronto.get("titulo", ""), pronto.get("descricao", ""))

    @staticmethod
    def _capa(pronto: dict) -> Path | None:
        capa = pronto.get("capa") or ""
        return Path(capa) if capa else None

    async def publicar(self, pacote: PacotePublicacao) -> dict:
        pronto = await super().publicar(pacote)

        # A marca é por ITEM, e não por lote: é ela que diz qual das abas
        # abertas é esta, e duas abas do mesmo lote precisam de nomes diferentes.
        marca = marca_da_aba(uuid4().hex[:12])
        try:
            relatorio = await self._subir(pronto, marca)
        except RoteiroInterrompido as exc:
            if exc.passo == Passo.PUBLICAR:
                raise ConferirNaAba(self, marca, str(exc)) from exc
            raise

        if relatorio.get("publicado"):
            return {**pronto, **relatorio, "modo": self.modo.value}

        if self.ao_ficar_pronta is not None:
            await self.ao_ficar_pronta(relatorio.get("avisos", []))

        if self.sem_esperar:
            # Quem chama vigia com a marca, em segundo plano (`aguardar`).
            return {**pronto, **relatorio, "modo": self.modo.value, "marca": marca}

        publicado = await self.aguardar(marca)
        return {**pronto, **relatorio, "modo": self.modo.value, "publicado": publicado}

    async def aguardar(self, marca: str) -> bool:
        """Vigia a aba desta marca até o operador publicar; `False` é "não sei"."""
        espera = {"segundos": self.segundos_de_vigilia} if self.segundos_de_vigilia else {}
        return await self._robo().aguardar_publicacao(
            marca=marca, parar=self.parar_espera, **espera
        )

    async def mostrar_janela(self) -> bool:
        """Traz o Chrome do robô para a tela, sem pular na frente (D-799)."""
        conexao = sessao_no_chrome(self._robo().perfil_do_chrome())
        return await asyncio.to_thread(janela_do_robo.mostrar, conexao)


class DestinoTikTokAssistido(DestinoAssistido):
    """O TikTok: sobe, legenda, capa e, pedido, agenda no próprio Studio (D-580)."""

    agenda_sozinho = True

    def _robo(self) -> ModuleType:
        from app.services import tiktok_studio

        return tiktok_studio

    async def _subir(self, pronto: dict, marca: str) -> dict:
        return await self._robo().subir_assistido(
            video=Path(pronto["video"]),
            legenda=self._legenda(pronto),
            capa=self._capa(pronto),
            marca=marca,
            publicar_sozinho=self.publicar_sozinho,
            agendamento=self.agendamento,
        )


class DestinoInstagramReelsAssistido(DestinoAssistido):
    """O Reels, no compositor do instagram.com.

    Mesmo contrato do TikTok assistido, e as diferenças estão todas debaixo:

      - o compositor é um MODAL, então não há navegação para provar que saiu.
        A vigília espera o modal fechar e procura o aviso de sucesso, porque
        fechar sozinho também é o que acontece quando alguém descarta;
      - a capa entra na etapa "Editar" do compositor (D-589), e como no TikTok
        é o único passo que reporta em vez de interromper.
    """

    # D-580: `False`, e por um motivo MEDIDO e nao suposto. Em 12/09/2026, no
    # Chrome do robo ja logado, o compositor de Reels do instagram.com foi
    # varrido controle a controle: nao existe agendamento naquela tela, e nao e
    # falta de conta profissional. Agendar Reels mora no Meta Business Suite.
    agenda_sozinho = False

    def __init__(self, plataforma: Plataforma = Plataforma.INSTAGRAM_REELS, **opcoes) -> None:
        super().__init__(plataforma, **opcoes)

    def _robo(self) -> ModuleType:
        from app.services import instagram_reels

        return instagram_reels

    async def _subir(self, pronto: dict, marca: str) -> dict:
        relatorio = await self._robo().subir_assistido(
            video=Path(pronto["video"]),
            legenda=self._legenda(pronto),
            capa=self._capa(pronto),
            marca=marca,
            publicar_sozinho=self.publicar_sozinho,
        )
        if not self.agendamento:
            return relatorio
        # Dito em voz alta, e no relatorio que a tela mostra: engolir a data
        # aqui seria o mesmo erro do video que sobe `unlisted` e some.
        return {
            **relatorio,
            "avisos": [
                *relatorio.get("avisos", []),
                f"Este Reel NAO fica agendado para {self.agendamento.legivel()}: o "
                "compositor do instagram.com nao tem agendamento (so o Meta "
                "Business Suite tem). Compartilhe na hora que quiser publicar.",
            ],
        }
