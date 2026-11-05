"""Ressincronizar vários cortes numa sessão só, sem que um derrube os outros (D-1029)."""

from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession


async def sincronizar_todos(
    ids: list[str], sincronizar: Callable[[str], Awaitable[None]], db: AsyncSession
) -> int:
    """Roda `sincronizar` para cada id; o corte que falha não impede os seguintes.

    Recebe ids, não objetos: o `rollback` do retry de "database is locked" expira
    todo objeto da sessão, e ler `corte.id` de um expirado estoura MissingGreenlet.
    O `rollback` aqui limpa a sessão para o próximo corte seguir; o primeiro erro é
    relançado ao fim, para a falha não passar por sucesso. Devolve quantos
    cortes foram processados.

    A sessão chega sem nada pendente: o que estiver nela se perde no primeiro
    `rollback`, daqui ou do retry, e os cortes seguintes nem ficam sabendo (D-1039).
    """
    primeira_falha: Exception | None = None
    for corte_id in ids:
        try:
            await sincronizar(corte_id)
        except Exception as e:  # noqa: BLE001 — o erro é relançado ao fim do lote
            await db.rollback()
            primeira_falha = primeira_falha or e
    if primeira_falha:
        raise primeira_falha
    return len(ids)
