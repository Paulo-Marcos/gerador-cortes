"""O nome do operador, da aplicação e não do canal (D-1129)."""

from app.routers.resposta_api import RespostaApi
from app.services import operador
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class NomeDoOperador(RespostaApi):
    """ "" quando o operador ainda não disse o nome."""

    nome: str


class DefinirNomeDoOperador(BaseModel):
    nome: str


@router.get("", response_model=NomeDoOperador)
def ler_nome():
    return NomeDoOperador(nome=operador.ler_nome())


@router.put("", response_model=NomeDoOperador)
def definir_nome(body: DefinirNomeDoOperador):
    return NomeDoOperador(nome=operador.definir_nome(body.nome))
