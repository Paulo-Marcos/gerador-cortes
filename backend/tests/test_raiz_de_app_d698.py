"""A raiz de app/ só guarda o que é o próprio app (D-698).

Os contratos do import-linter vigiam as camadas — routers, services,
infrastructure, domain, core —, não a raiz: um módulo solto ali importa e é
importado por qualquer um sem que nada reprove. Por isso ela ficou só com os
quatro que são o app em si. Módulo novo nasce na camada do que ele faz
(ADR-0015): regra pura no domínio, caso de uso nos services, mundo externo na
infraestrutura, o que todas usam e nenhuma possui no core.
"""

from pathlib import Path

_APP = Path(__file__).resolve().parents[1] / "app"
_A_RAIZ_E_O_APP = {"config", "database", "main", "models"}


def test_a_raiz_de_app_so_tem_config_database_main_e_models():
    modulos = {p.stem for p in _APP.glob("*.py")}

    assert modulos == _A_RAIZ_E_O_APP, (
        f"Na raiz de app/ e fora da lista: {sorted(modulos - _A_RAIZ_E_O_APP)}. "
        "Mova o módulo para a camada do que ele faz (ADR-0015). "
        f"Na lista e fora da raiz: {sorted(_A_RAIZ_E_O_APP - modulos)}."
    )
