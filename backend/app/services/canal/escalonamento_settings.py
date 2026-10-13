"""A referência do público e os blocos de publicação, por canal, no banco (D-908).

O mesmo desenho do `ranking_settings`: o DOMÍNIO
(`domain/publicacao/escalonamento`) é dono das formas, dos padrões e da
validação; aqui mora a camada que resolve o valor do canal (banco ou padrão) e
a fachada de gestão que a tela de Canais consome (descrever, definir, resetar).

Diferença deliberada do ranking: NÃO há seed. Ausência de linha é "segue o
padrão", e o reset apaga a linha — a cascata parcial da RN-10. Assim, um
padrão melhorado numa versão futura chega aos canais que nunca mexeram, em
vez de ficar congelado numa linha semeada no primeiro acesso.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.core import channel_paths
from app.domain.publicacao.escalonamento import (
    DESTINOS_ESCALONADOS,
    DIAS_DA_SEMANA,
    PADRAO_DO_PUBLICO,
    PADRAO_POR_DESTINO,
    EscalonamentoInvalido,
    FaixaDoPublico,
    Intensidade,
    ParametrosDoDestino,
    sugerir_blocos,
    validar_parametros,
    validar_referencia,
)
from app.infrastructure import escalonamento_store

CHAVE_PUBLICO = "publico"

ROTULO_DO_DESTINO = {
    "youtube": "YouTube (vídeos)",
    "youtube_shorts": "YouTube Shorts",
    "tiktok": "TikTok",
}


def _banco_e_canal(db_path: Path | None, channel_id: str | None) -> tuple[Path, str]:
    db = db_path if db_path is not None else channel_paths.settings_db_path()
    cid = channel_id if channel_id is not None else channel_paths.active_channel_root().name
    return db, cid


# --------------------------------------------------------------------------- #
# Formas de transporte (JSON ↔ dataclasses do domínio)
# --------------------------------------------------------------------------- #


def faixa_para_dict(faixa: FaixaDoPublico) -> dict:
    return {
        "dia": faixa.dia,
        "inicio": faixa.inicio,
        "fim": faixa.fim,
        "intensidade": faixa.intensidade.value,
    }


def dict_para_faixa(dados: dict) -> FaixaDoPublico:
    try:
        return FaixaDoPublico(
            dia=int(dados["dia"]),
            inicio=int(dados["inicio"]),
            fim=int(dados["fim"]),
            intensidade=Intensidade(str(dados["intensidade"])),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise EscalonamentoInvalido(f"faixa do público ilegível: {dados!r}") from exc


def parametros_para_dict(parametros: ParametrosDoDestino) -> dict:
    return {
        "blocos": list(parametros.blocos),
        "itens_por_bloco": parametros.itens_por_bloco,
        "teto_por_dia": parametros.teto_por_dia,
        "intervalo_minimo_min": parametros.intervalo_minimo_min,
        "dias_ativos": sorted(parametros.dias_ativos),
    }


def dict_para_parametros(dados: dict) -> ParametrosDoDestino:
    try:
        return ParametrosDoDestino(
            blocos=tuple(str(b) for b in dados["blocos"]),
            itens_por_bloco=int(dados["itens_por_bloco"]),
            teto_por_dia=int(dados["teto_por_dia"]),
            intervalo_minimo_min=int(dados["intervalo_minimo_min"]),
            dias_ativos=frozenset(int(d) for d in dados["dias_ativos"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise EscalonamentoInvalido(f"parâmetros do destino ilegíveis: {dados!r}") from exc


# --------------------------------------------------------------------------- #
# Resolução (runtime): o que o lote usa
# --------------------------------------------------------------------------- #


def resolver_referencia(
    *, db_path: Path | None = None, channel_id: str | None = None
) -> tuple[FaixaDoPublico, ...]:
    """As faixas do canal ativo — as gravadas, ou o padrão quando ele nunca mexeu."""
    db, cid = _banco_e_canal(db_path, channel_id)
    gravado = escalonamento_store.ler(db, cid, CHAVE_PUBLICO)
    if gravado is None:
        return PADRAO_DO_PUBLICO
    return tuple(dict_para_faixa(f) for f in gravado.get("faixas", []))


def resolver_parametros(
    destino: str, *, db_path: Path | None = None, channel_id: str | None = None
) -> ParametrosDoDestino:
    """Os blocos deste destino no canal ativo — os gravados, ou o padrão."""
    if destino not in PADRAO_POR_DESTINO:
        raise EscalonamentoInvalido(f"destino desconhecido para escalonar: {destino!r}")
    db, cid = _banco_e_canal(db_path, channel_id)
    gravado = escalonamento_store.ler(db, cid, destino)
    if gravado is None:
        return PADRAO_POR_DESTINO[destino]
    return dict_para_parametros(gravado)


# --------------------------------------------------------------------------- #
# Fachada de gestão (tela de Canais)
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class DestinoDescrito:
    destino: str
    rotulo: str
    parametros: dict
    padrao: dict
    personalizado: bool
    """True quando o canal gravou os próprios blocos; False quando segue o padrão."""


@dataclass(frozen=True)
class EscalonamentoDescrito:
    faixas: list[dict]
    faixas_padrao: list[dict]
    publico_personalizado: bool
    dias_da_semana: tuple[str, ...]
    destinos: list[DestinoDescrito]


def descrever(
    *, db_path: Path | None = None, channel_id: str | None = None
) -> EscalonamentoDescrito:
    """Tudo o que a tela de Canais mostra: o do canal, o padrão e se há diferença."""
    db, cid = _banco_e_canal(db_path, channel_id)
    faixas = resolver_referencia(db_path=db, channel_id=cid)
    return EscalonamentoDescrito(
        faixas=[faixa_para_dict(f) for f in faixas],
        faixas_padrao=[faixa_para_dict(f) for f in PADRAO_DO_PUBLICO],
        publico_personalizado=escalonamento_store.ler(db, cid, CHAVE_PUBLICO) is not None,
        dias_da_semana=DIAS_DA_SEMANA,
        destinos=[
            DestinoDescrito(
                destino=destino,
                rotulo=ROTULO_DO_DESTINO[destino],
                parametros=parametros_para_dict(
                    resolver_parametros(destino, db_path=db, channel_id=cid)
                ),
                padrao=parametros_para_dict(PADRAO_POR_DESTINO[destino]),
                personalizado=escalonamento_store.ler(db, cid, destino) is not None,
            )
            for destino in DESTINOS_ESCALONADOS
        ],
    )


def definir_referencia(
    faixas: list[dict], *, db_path: Path | None = None, channel_id: str | None = None
) -> EscalonamentoDescrito:
    """Grava as faixas do público do canal, validando antes."""
    lidas = [dict_para_faixa(f) for f in faixas]
    validar_referencia(lidas)
    db, cid = _banco_e_canal(db_path, channel_id)
    escalonamento_store.gravar(
        db, cid, CHAVE_PUBLICO, {"faixas": [faixa_para_dict(f) for f in lidas]}
    )
    return descrever(db_path=db, channel_id=cid)


def definir_parametros(
    destino: str, valores: dict, *, db_path: Path | None = None, channel_id: str | None = None
) -> EscalonamentoDescrito:
    """Grava os blocos de um destino, validando contra a grade dele."""
    parametros = dict_para_parametros(valores)
    validar_parametros(parametros, destino)
    db, cid = _banco_e_canal(db_path, channel_id)
    escalonamento_store.gravar(db, cid, destino, parametros_para_dict(parametros))
    return descrever(db_path=db, channel_id=cid)


def resetar(
    chave: str, *, db_path: Path | None = None, channel_id: str | None = None
) -> EscalonamentoDescrito:
    """Volta a chave (`publico` ou um destino) ao padrão: apaga a linha do canal."""
    if chave != CHAVE_PUBLICO and chave not in PADRAO_POR_DESTINO:
        raise EscalonamentoInvalido(f"não há o que resetar em {chave!r}")
    db, cid = _banco_e_canal(db_path, channel_id)
    escalonamento_store.apagar(db, cid, chave)
    return descrever(db_path=db, channel_id=cid)


def sugerir_blocos_do_canal(
    destino: str, *, db_path: Path | None = None, channel_id: str | None = None
) -> list[str]:
    """Blocos espalhados pela janela forte da referência do canal, para o destino.

    Mantém a quantidade de blocos que o destino já tem: o operador pede "sugira
    pela referência" e recebe as MESMAS N horas, agora alinhadas ao público.
    """
    db, cid = _banco_e_canal(db_path, channel_id)
    parametros = resolver_parametros(destino, db_path=db, channel_id=cid)
    faixas = resolver_referencia(db_path=db, channel_id=cid)
    return list(sugerir_blocos(faixas, len(parametros.blocos), parametros.dias_ativos))
