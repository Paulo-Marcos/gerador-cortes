"""O estilo das capas do canal ativo (D-909): protagonista, fotos do apresentador e claridade.

Três peças de uma decisão só — como a capa do canal deve sair:

- o PROTAGONISTA (mascote ou apresentador), que vira o bloco `MODO DA CAPA` no
  prompt das três capas e decide o que o robô anexa;
- o BANCO DE FOTOS do apresentador, arquivos na pasta do canal, rotulados pelo
  nome (`pensativo.jpg`);
- a META DE CLARIDADE, a régua do aviso de capa escura.

A configuração vive no `settings.db`, por canal (ADR-0012); as fotos, na pasta.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.core import channel_paths
from app.domain.canal.fotos_do_apresentador import (
    EXTENSOES_DE_FOTO,
    MAXIMO_DE_FOTOS_NO_BANCO,
    escolher_fotos,
    expressoes_do_prompt,
    nome_de_foto_valido,
    rotulos_disponiveis,
    semente_do_prompt,
)
from app.domain.canal.protagonista_da_capa import (
    PROTAGONISTA_PADRAO,
    Protagonista,
    aviso_de_mascote_na_capa,
    bloco_do_modo,
    mascote_descrito,
    protagonista_valido,
)
from app.domain.compartilhado.chatgpt_imagem import tipo_da_imagem
from app.domain.compartilhado.erros import NaoEncontrado, PedidoInvalido, ServicoExternoFalhou
from app.domain.compartilhado.provider_ia import ProviderIA
from app.domain.corte.claridade_da_capa import MetaDeClaridade, meta_valida
from app.infrastructure import capa_do_canal_store
from app.services.canal import editorial_skills
from app.services.canal.editorial_identity import identidade_do_mascote
from app.services.claude_ia import gerar_texto

logger = logging.getLogger(__name__)


def _banco_e_canal() -> tuple[Path, str]:
    return channel_paths.settings_db_path(), channel_paths.active_channel_root().name


# --------------------------------------------------------------------------- #
# Protagonista e meta de claridade
# --------------------------------------------------------------------------- #


def ler_estilo() -> dict:
    """O que a tela de Canais mostra; o canal nunca configurado sai com os padrões."""
    gravado = capa_do_canal_store.ler(*_banco_e_canal())
    meta = MetaDeClaridade()
    fotos = [p.name for p in _fotos()]
    return {
        "protagonista": gravado["protagonista"] if gravado else PROTAGONISTA_PADRAO,
        "luminancia_minima": gravado["luminancia_minima"] if gravado else meta.luminancia_minima,
        "escuros_maximo": gravado["escuros_maximo"] if gravado else meta.escuros_maximo,
        "fotos_do_apresentador": fotos,
        "expressoes": rotulos_disponiveis(fotos),
        "maximo_de_fotos": MAXIMO_DE_FOTOS_NO_BANCO,
    }


def gravar_estilo(protagonista: str, luminancia_minima: float, escuros_maximo: float) -> dict:
    """Grava o protagonista e a meta; nada se apaga ao trocar de modo."""
    meta = meta_valida(luminancia_minima, escuros_maximo)
    capa_do_canal_store.gravar(
        *_banco_e_canal(),
        protagonista=protagonista_valido(protagonista),
        luminancia_minima=meta.luminancia_minima,
        escuros_maximo=meta.escuros_maximo,
    )
    return ler_estilo()


def protagonista() -> Protagonista:
    return ler_estilo()["protagonista"]


def meta_de_claridade() -> MetaDeClaridade:
    estilo = ler_estilo()
    return MetaDeClaridade(estilo["luminancia_minima"], estilo["escuros_maximo"])


def bloco_do_modo_da_capa() -> str:
    """O bloco `MODO DA CAPA` que abre o prompt das três capas."""
    estilo = ler_estilo()
    return bloco_do_modo(
        estilo["protagonista"],
        mascote=identidade_do_mascote().nome,
        expressoes=estilo["expressoes"],
    )


async def gerar_texto_sem_mascote(
    provider: ProviderIA,
    prompt: str,
    skill: editorial_skills.SkillResolvida,
    skill_key: str,
    **ids: str | None,
) -> str:
    """O `gerar_texto` de uma capa vertical, sem o mascote no modo apresentador (D-974).

    O envelope leva o prompt do YouTube e a skill fala do mascote em várias seções;
    o modelo às vezes segue a maioria e ignora o bloco do modo. A resposta que o
    descreve volta UMA vez, com um aviso; se voltar com ele de novo, a geração falha.
    """
    bruto = await gerar_texto(provider, prompt, skill, skill_key, **ids)
    if protagonista() != "apresentador":
        return bruto
    mascote = identidade_do_mascote().nome
    termos = mascote_descrito(bruto, mascote=mascote)
    if not termos:
        return bruto
    logger.warning(
        "[CapaDoCanal] %s: prompt com o mascote no modo apresentador %s", skill_key, termos
    )
    aviso = aviso_de_mascote_na_capa(termos, mascote=mascote)
    bruto = await gerar_texto(provider, aviso + prompt, skill, skill_key, **ids)
    if termos := mascote_descrito(bruto, mascote=mascote):
        raise ServicoExternoFalhou(
            f"A IA pôs o {mascote} na capa duas vezes ({', '.join(termos)}), e o modo "
            "apresentador não aceita mascote. Gere de novo; se repetir, confira o corpo "
            "da skill em /canais."
        )
    return bruto


# --------------------------------------------------------------------------- #
# Banco de fotos do apresentador
# --------------------------------------------------------------------------- #


def _fotos() -> list[Path]:
    pasta = channel_paths.fotos_do_apresentador_dir()
    if not pasta.is_dir():
        return []
    return sorted(
        (p for p in pasta.iterdir() if p.is_file() and p.suffix.lower() in EXTENSOES_DE_FOTO),
        key=lambda p: p.name,
    )


def salvar_foto(nome_original: str, conteudo: bytes) -> dict:
    """Guarda uma foto; o mesmo nome (a mesma expressão e número) substitui a anterior."""
    nome = nome_de_foto_valido(nome_original)
    if not tipo_da_imagem(conteudo):
        raise PedidoInvalido("O arquivo não é uma imagem PNG, JPG ou WEBP.")
    existentes = {p.name for p in _fotos()}
    if nome not in existentes and len(existentes) >= MAXIMO_DE_FOTOS_NO_BANCO:
        raise PedidoInvalido(f"No máximo {MAXIMO_DE_FOTOS_NO_BANCO} fotos: remova uma antes.")
    pasta = channel_paths.fotos_do_apresentador_dir()
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / nome).write_bytes(conteudo)
    return ler_estilo()


def caminho_da_foto(nome: str) -> Path:
    """O arquivo de uma foto pelo nome, ou `NaoEncontrado`."""
    alvo = next((p for p in _fotos() if p.name == nome), None)
    if alvo is None:
        raise NaoEncontrado(f"Foto não encontrada: {nome}")
    return alvo


def remover_foto(nome: str) -> dict:
    caminho_da_foto(nome).unlink()
    return ler_estilo()


def fotos_para_o_prompt(prompt: str) -> list[Path]:
    """As fotos que acompanham este prompt: as expressões pedidas, completadas pela semente."""
    fotos = {p.name: p for p in _fotos()}
    escolhidas = escolher_fotos(
        expressoes_do_prompt(prompt), fotos, semente=semente_do_prompt(prompt)
    )
    return [fotos[nome] for nome in escolhidas]
