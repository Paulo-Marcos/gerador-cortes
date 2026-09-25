"""
Serviço de Thumbnail — geração via Gemini Imagen API
"""

import asyncio
import os
from pathlib import Path

import aiofiles
from app.config import settings
from app.core.channel_paths import (
    moldura_thumbnail_path,
    para_relativo_ao_projeto,
    projetos_dir,
    resolver_do_projeto,
)
from app.core.logging import operational_error, operational_info
from app.database import AsyncSessionLocal
from app.domain.canal.variacao_prompt import strip_variation_tags
from app.domain.corte.moldura_thumbnail import arquivos_da_moldura, nomes_das_molduras
from app.infrastructure import gemini_client
from app.infrastructure.imagem.moldura import emoldurar
from app.infrastructure.imagem.thumbnail_encode import LIMITE_YOUTUBE_BYTES, preparar_para_youtube
from app.models import Corte, MetadadoCorte
from sqlalchemy import select


async def _ler_bytes(caminho: str) -> bytes:
    async with aiofiles.open(caminho, "rb") as arquivo:
        return await arquivo.read()


async def _gravar_bytes(caminho: str, dados: bytes) -> None:
    async with aiofiles.open(caminho, "wb") as arquivo:
        await arquivo.write(dados)


def _caminho_da_arte(thumb_path: str) -> str:
    """Onde a capa SEM moldura fica guardada, ao lado da publicada.

    Mesma convenção da capa do TikTok (`capa_tiktok_arte`): a arte sobrevive à
    montagem. Sem ela, reemoldurar — moldura nova, canal novo — exigiria pedir
    a imagem de volta ao operador, e emoldurar a já emoldurada carimbaria duas
    faixas uma sobre a outra.
    """
    raiz, extensao = os.path.splitext(thumb_path)
    return f"{raiz}_arte{extensao}"


def _moldura_do_corte(is_fire: bool, is_leitura: bool) -> Path | None:
    """O PNG da moldura correspondente às marcas do corte, ou None se faltarem todas.

    Percorre a ordem de preferência que o domínio dita: a moldura exata, depois
    a padrão, depois o nome legado.
    """
    for arquivo in arquivos_da_moldura(is_fire, is_leitura):
        caminho = moldura_thumbnail_path(arquivo)
        if caminho is not None:
            return caminho
    return None


async def _emoldurar_capa(conteudo: bytes, is_fire: bool, is_leitura: bool) -> bytes:
    """A capa com a moldura das marcas do corte — ou como veio, se algo faltar.

    Canal sem moldura nenhuma publica a capa como veio: moldura é identidade, e
    um canal recém-criado não tem uma. Se a colagem falhar, também publica a capa
    crua — capa sem moldura é um deslize de marca; capa que não sobe é uma perda.

    A colagem vai para uma thread porque PIL é síncrono e a capa chega a
    2752x1536: fazer isso no event loop trava o backend inteiro enquanto durar.
    """
    moldura = _moldura_do_corte(is_fire, is_leitura)
    if moldura is None:
        return conteudo
    try:
        return await asyncio.to_thread(emoldurar, conteudo, moldura.read_bytes())
    except Exception as erro:  # noqa: BLE001 — capa crua vale mais que capa nenhuma
        operational_error(
            "Thumbnail", f"Falha ao aplicar a moldura ({erro}); publicando a capa crua"
        )
        return conteudo


async def _capa_e_marcas(corte_id: str) -> tuple[str, bool, bool] | None:
    """Onde está a capa publicada do corte, e sob que marcas ela deve ser lida.

    None quando não há corte, metadado ou capa — os três casos em que não existe
    nada para emoldurar. As marcas moram em tabelas diferentes (Fire é
    julgamento do metadado, Leitura é natureza do corte) e são lidas com a
    sessão viva.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            return None

        result = await db.execute(select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id))
        meta = result.scalar_one_or_none()
        if not meta or not meta.thumbnail_path:
            return None

        return (
            str(resolver_do_projeto(meta.thumbnail_path, corte.projeto_id)),
            bool(meta.is_fire),
            bool(corte.is_leitura),
        )


async def _gravar_capa(
    thumb_path: str, conteudo: bytes, *, is_fire: bool, is_leitura: bool
) -> None:
    """Grava a capa emoldurada em `thumb_path` e a arte crua ao lado."""
    await _gravar_bytes(_caminho_da_arte(thumb_path), conteudo)
    await _gravar_bytes(thumb_path, await _emoldurar_capa(conteudo, is_fire, is_leitura))


class ThumbnailService:
    @staticmethod
    async def upload_manual(corte_id: str, content: bytes, filename: str) -> str:
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()
            if not meta:
                raise ValueError("Metadados não encontrados")

            projeto_id = corte.projeto_id
            # Lidas AQUI, com a sessão viva: fora dela as instâncias estão
            # desligadas e qualquer atributo vira um SELECT que não acontece.
            # As duas marcas moram em tabelas diferentes — Fire é julgamento do
            # metadado, Leitura é natureza do corte.
            is_fire = bool(meta.is_fire)
            is_leitura = bool(corte.is_leitura)

        thumb_dir = os.path.join(str(projetos_dir()), projeto_id, "thumbnails")
        os.makedirs(thumb_dir, exist_ok=True)

        extension = filename.split(".")[-1]
        thumb_path = os.path.join(thumb_dir, f"thumb_{corte_id[:8]}.{extension}")

        await _gravar_capa(thumb_path, content, is_fire=is_fire, is_leitura=is_leitura)

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()
            if meta:
                # D-158: persiste RELATIVO ao projeto (reancorável pelo canal ativo).
                meta.thumbnail_path = para_relativo_ao_projeto(thumb_path, projeto_id)
                await db.commit()

        return thumb_path

    @staticmethod
    async def reaplicar_moldura(corte_id: str) -> bool:
        """Recompõe a capa publicada quando as marcas do corte mudam.

        Fire e Leitura costumam ser decididos DEPOIS que a capa entrou: o
        julgamento do corte vem na revisão, e a arte às vezes chega antes. Sem
        isto a moldura ficaria congelada na marca que valia no instante do
        upload — errada e calada, que é a pior forma de errar.

        Só age quando a arte crua está guardada ao lado. Capas anteriores a este
        fluxo não têm original, e reemoldurá-las carimbaria uma moldura sobre a
        outra: o `_arte` é o que atesta que a capa passou por aqui.

        Devolve se a capa foi de fato refeita — quem chama não deve prometer ao
        operador uma troca que não houve.
        """
        dados = await _capa_e_marcas(corte_id)
        if dados is None:
            return False
        thumb_path, is_fire, is_leitura = dados

        arte = _caminho_da_arte(thumb_path)
        if not os.path.exists(arte):
            return False

        original = await _ler_bytes(arte)
        await _gravar_bytes(thumb_path, await _emoldurar_capa(original, is_fire, is_leitura))
        return True

    @staticmethod
    async def aplicar_moldura(corte_id: str) -> dict:
        """Emoldura a capa que já está publicada — a ação do botão na tela.

        Difere de `reaplicar_moldura` num ponto só, e é o ponto que importa:
        aceita capa SEM arte crua ao lado. Uma capa anterior a este fluxo nunca
        passou por aqui, então o arquivo publicado É a arte — guardá-lo como
        `_arte` ANTES de colar é o que impede o segundo clique de empilhar
        moldura sobre moldura.

        `reaplicar_moldura` recusa esse caso de propósito: ela dispara sozinha
        quando uma marca muda, e agir sobre um arquivo de origem desconhecida
        sem ninguém pedir é exatamente como se carimbam capas duas vezes. Aqui
        há um operador clicando e esperando resposta.

        E por isso a falha aqui SOBE, em vez de degradar para capa crua como no
        caminho automático: quem clicou em "aplicar moldura" precisa saber que
        não foi aplicada.
        """
        dados = await _capa_e_marcas(corte_id)
        if dados is None:
            raise ValueError("Nenhuma capa para emoldurar")
        thumb_path, is_fire, is_leitura = dados

        if not os.path.exists(thumb_path):
            raise ValueError("Arquivo da capa não encontrado no disco")

        moldura = _moldura_do_corte(is_fire, is_leitura)
        if moldura is None:
            esperados = ", ".join(nomes_das_molduras())
            raise ValueError(
                f"Este canal não tem moldura cadastrada. Coloque os PNGs em "
                f"assets/moldura/ ({esperados})."
            )

        arte = _caminho_da_arte(thumb_path)
        if os.path.exists(arte):
            original = await _ler_bytes(arte)
        else:
            # A capa publicada É a arte desta: ela nunca passou por aqui. Guardar
            # antes de colar é o que faz o segundo clique ler o original em vez
            # da imagem que o primeiro emoldurou.
            original = await _ler_bytes(thumb_path)
            await _gravar_bytes(arte, original)

        emoldurada = await asyncio.to_thread(emoldurar, original, moldura.read_bytes())
        await _gravar_bytes(thumb_path, emoldurada)

        return {
            "message": f"Moldura aplicada ({moldura.name}).",
            "moldura": moldura.name,
        }

    @staticmethod
    async def remover(corte_id: str) -> dict:
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()
            if not meta:
                raise ValueError("Metadados não encontrados")

            thumb_path = (
                str(resolver_do_projeto(meta.thumbnail_path, corte.projeto_id))
                if meta.thumbnail_path
                else ""
            )
            arquivo_removido = False
            if thumb_path and os.path.exists(thumb_path):
                try:
                    os.remove(thumb_path)
                    arquivo_removido = True
                except OSError as exc:
                    raise RuntimeError(f"Falha ao remover arquivo da thumbnail: {exc}") from exc

            # A arte crua vai junto. Deixá-la para trás encheria a pasta de
            # órfãos que ninguém mais alcança — o metadado só aponta para a
            # capa publicada. Falhar aqui NÃO desfaz a remoção: a capa já saiu,
            # e um arquivo esquecido não vale um erro na cara do operador.
            arte = _caminho_da_arte(thumb_path) if thumb_path else ""
            if arte and os.path.exists(arte):
                try:
                    os.remove(arte)
                except OSError as exc:
                    operational_error("Thumbnail", f"Arte crua não pôde ser removida: {exc}")

            meta.thumbnail_path = ""
            await db.commit()

        return {
            "message": "Thumbnail removida.",
            "arquivo_removido": arquivo_removido,
        }

    @staticmethod
    async def comprimir_manual(corte_id: str) -> dict:
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()

        if not meta or not meta.thumbnail_path:
            raise ValueError("Nenhuma thumbnail para comprimir")

        thumb_path = str(resolver_do_projeto(meta.thumbnail_path, corte.projeto_id))
        if not os.path.exists(thumb_path):
            raise ValueError("Arquivo da thumbnail não encontrado no disco")

        tamanho = os.path.getsize(thumb_path)
        if tamanho <= LIMITE_YOUTUBE_BYTES:
            return {
                "message": f"A capa já está abaixo de 2MB ({tamanho} bytes). Nenhuma ação necessária."
            }

        # Delega ao domínio: croma em 4:4:4 e a melhor qualidade que couber. O que
        # havia aqui usava o subsampling PADRÃO do PIL (4:2:0), que descarta 3/4
        # da informação de cor — o dano concentrado justamente na borda colorida
        # do texto da capa. E descia a qualidade de 1 em 1 a partir de 98,
        # reencodando até 78 vezes para chegar no mesmo lugar.
        with open(thumb_path, "rb") as arquivo:
            dados = arquivo.read()
        convertido, _mimetype, nota = preparar_para_youtube(dados)
        with open(thumb_path, "wb") as arquivo:
            arquivo.write(convertido)

        novo_tamanho = os.path.getsize(thumb_path)
        return {"message": f"Capa comprimida ({nota}). Novo tamanho: {novo_tamanho} bytes."}

    @staticmethod
    async def gerar(corte_id: str):
        """Gera thumbnail via Gemini Imagen a partir do prompt do metadado."""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()

        if not corte:
            operational_error("Thumbnail", f"Corte {corte_id} não encontrado")
            return

        if not meta or not meta.prompt_thumbnail:
            operational_info("Thumbnail", f"Sem prompt de thumbnail para corte {corte_id}")
            return

        if not settings.gemini_api_key:
            operational_error("Thumbnail", "GEMINI_API_KEY não configurada")
            return

        try:
            prompt_para_gerador = strip_variation_tags(meta.prompt_thumbnail)
            imagem_bytes = await gemini_client.generate_image(
                prompt_para_gerador,
                contexto=gemini_client.GeminiCallContext(
                    etapa="thumbnail-imagem",
                    projeto_id=corte.projeto_id,
                    corte_id=corte_id,
                ),
            )

            # Salva a imagem na pasta de thumbnails DO PROJETO (mesma convenção do
            # upload manual), para que o caminho seja reancorável pelo canal ativo.
            thumb_dir = projetos_dir() / corte.projeto_id / "thumbnails"
            thumb_dir.mkdir(parents=True, exist_ok=True)
            thumb_path = thumb_dir / f"thumb_{corte_id[:8]}.jpg"
            await _gravar_capa(
                str(thumb_path),
                imagem_bytes,
                is_fire=bool(meta.is_fire),
                is_leitura=bool(corte.is_leitura),
            )

            # Atualiza metadado com o caminho RELATIVO ao projeto (D-158)
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
                )
                meta = result.scalar_one_or_none()
                if meta:
                    meta.thumbnail_path = para_relativo_ao_projeto(
                        str(thumb_path), corte.projeto_id
                    )
                    await db.commit()

            operational_info("Thumbnail", f"Thumbnail gerada: {thumb_path}")

        except Exception as e:
            operational_error("Thumbnail", f"Erro ao gerar thumbnail para corte {corte_id}: {e}")
