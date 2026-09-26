"""A base dos modelos de RESPOSTA do contrato HTTP (D-722).

O frontend consome um cliente gerado do `openapi.json`. Por padrão, o Pydantic
lista no schema como obrigatório só o campo sem valor padrão — `x: str | None =
None` sai opcional (`x?:`). Mas na resposta o campo SEMPRE vem (o FastAPI
serializa os padrões), e o tipo opcional obrigaria cada tela a tratar um
`undefined` que nunca chega.

`json_schema_serialization_defaults_required` corrige o que o schema DIZ, sem
mudar nada em tempo de execução: no schema de saída, campo com padrão é
obrigatório. Use só em modelo de resposta — num modelo que também é corpo de
pedido o FastAPI dividiria o schema em `-Input`/`-Output` e mudaria os nomes.
"""

from pydantic import BaseModel, ConfigDict


class RespostaApi(BaseModel):
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class RespostaComCamposOpcionais(RespostaApi):
    """Resposta com campo que só EXISTE num dos ramos do serviço (D-722).

    Ex.: a candidata já promovida não tem `pontuacao_ranking`; a resposta do cache
    do ranking não tem `janela_meses`. Aqui o campo com padrão fica opcional no
    schema (é a verdade), e a rota precisa de `response_model_exclude_unset=True`
    para quem não mandou a chave continuar sem mandar — sem isso a resposta
    ganharia um `null` que nunca existiu.
    """

    model_config = ConfigDict(json_schema_serialization_defaults_required=False)
