"""API do karaokê (FastAPI). Roda só no próprio computador.

As rotas que chamam o YouTube são `def` (sem async): o FastAPI as roda numa
thread à parte, então uma busca lenta não trava as outras rotas.
"""

from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from karaoke.biblioteca import DESFOQUE_MAXIMO, DESFOQUE_PADRAO, Biblioteca
from karaoke.busca import LIMITE_MAXIMO, LIMITE_PADRAO, buscar
from karaoke.capas import buscar_capas
from karaoke.internet import pedir_json
from karaoke.letras import baixar_letra, buscar_versoes
from karaoke.fila import Fila
from karaoke.separacao import MODOS, detectar_dispositivo, estimar_segundos, modo_padrao


class PedidoFila(BaseModel):
    id_video: str = Field(pattern=r"^[A-Za-z0-9_-]{11}$")
    titulo: str = Field(max_length=300)
    artista: str = Field(default="", max_length=300)
    modo: str | None = None  # sem modo = o padrão do computador
    duracao: int | None = Field(default=None, ge=1, le=6 * 60 * 60)


class PedidoLetra(BaseModel):
    id_lrclib: int = Field(ge=1)


class PedidoFundo(BaseModel):
    url: str | None = Field(default=None, max_length=2000)
    desfoque: int = Field(default=DESFOQUE_PADRAO, ge=0, le=DESFOQUE_MAXIMO)


ERRO_INTERNET = "{servico} não respondeu. Confira a internet e tente de novo."


def _estimativas(dispositivo, duracao):
    return {nome: estimar_segundos(nome, dispositivo, duracao) for nome in MODOS}


def criar_app(pasta_dados, fila=None, buscar=buscar, dispositivo=None, pedir=pedir_json):
    dispositivo = dispositivo or detectar_dispositivo()
    fila = fila or Fila(pasta_dados)
    biblioteca = Biblioteca(pasta_dados)
    app = FastAPI(title="Karaokê Web")
    app.state.fila = fila

    @app.middleware("http")
    async def conferir_origem(request: Request, call_next):
        # Outro site aberto no navegador não pode mandar a API apagar ou baixar nada
        origem = request.headers.get("origin")
        if request.method not in ("GET", "HEAD") and origem and urlparse(origem).netloc != request.headers.get("host"):
            return JSONResponse({"detail": "Pedido de outra origem recusado."}, status_code=403)
        return await call_next(request)

    @app.get("/api/sistema")
    def sistema():
        return {
            "dispositivo": dispositivo,
            "modo_padrao": modo_padrao(dispositivo),
            "modos": [{"nome": m.nome, "descricao": m.descricao} for m in MODOS.values()],
        }

    @app.get("/api/busca")
    def busca(q: str, limite: int = LIMITE_PADRAO):
        if not 1 <= limite <= LIMITE_MAXIMO:
            raise HTTPException(422, f"O limite precisa ficar entre 1 e {LIMITE_MAXIMO}.")
        try:
            resultados = buscar(q, limite)
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None
        except Exception:
            raise HTTPException(502, ERRO_INTERNET.format(servico="O YouTube")) from None
        return [r.para_dict() | {"estimativas": _estimativas(dispositivo, r.duracao)} for r in resultados]

    @app.get("/api/fila")
    def listar_fila():
        return [t.para_dict() for t in fila.tarefas()]

    @app.post("/api/fila", status_code=201)
    def adicionar_na_fila(pedido: PedidoFila):
        try:
            tarefa = fila.adicionar(pedido.id_video, pedido.titulo, pedido.artista,
                                    pedido.modo or modo_padrao(dispositivo), pedido.duracao)
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None
        return tarefa.para_dict()

    @app.delete("/api/fila/{id_tarefa}", status_code=204)
    def esquecer_tarefa(id_tarefa: str):
        try:
            fila.esquecer(id_tarefa)
        except KeyError:
            raise HTTPException(404, "Essa tarefa não está na fila.") from None
        except ValueError as erro:
            raise HTTPException(409, str(erro)) from None

    @app.get("/api/musicas")
    def listar_musicas():
        return biblioteca.listar()

    @app.get("/api/musicas/{id_musica}")
    def obter_musica(id_musica: str):
        try:
            return biblioteca.obter(id_musica)
        except KeyError:
            raise HTTPException(404, "Música não encontrada.") from None

    @app.delete("/api/musicas/{id_musica}", status_code=204)
    def apagar_musica(id_musica: str):
        try:
            biblioteca.apagar(id_musica)
        except KeyError:
            raise HTTPException(404, "Música não encontrada.") from None

    def _musica_ou_404(id_musica):
        try:
            return biblioteca.obter(id_musica)
        except KeyError:
            raise HTTPException(404, "Música não encontrada.") from None

    @app.get("/api/musicas/{id_musica}/letras")
    def versoes_da_letra(id_musica: str):
        musica = _musica_ou_404(id_musica)
        try:
            versoes = buscar_versoes(musica["titulo"], musica.get("artista", ""), musica.get("duracao"), pedir)
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None
        except Exception:
            raise HTTPException(502, ERRO_INTERNET.format(servico="O LRCLIB")) from None
        return [v.para_dict(musica.get("duracao")) for v in versoes]

    @app.put("/api/musicas/{id_musica}/letra")
    def escolher_letra(id_musica: str, pedido: PedidoLetra):
        _musica_ou_404(id_musica)
        try:
            texto = baixar_letra(pedido.id_lrclib, pedir)
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None
        except Exception:
            raise HTTPException(502, ERRO_INTERNET.format(servico="O LRCLIB")) from None
        try:
            return biblioteca.salvar_letra(id_musica, texto, pedido.id_lrclib)
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None

    @app.get("/api/musicas/{id_musica}/letra")
    def letra(id_musica: str):
        _musica_ou_404(id_musica)
        try:
            return biblioteca.letra(id_musica)
        except KeyError:
            raise HTTPException(404, "Essa música ainda não tem letra.") from None

    @app.delete("/api/musicas/{id_musica}/letra", status_code=204)
    def apagar_letra(id_musica: str):
        _musica_ou_404(id_musica)
        biblioteca.apagar_letra(id_musica)

    @app.get("/api/musicas/{id_musica}/capas")
    def capas(id_musica: str):
        musica = _musica_ou_404(id_musica)
        try:
            return buscar_capas(musica["titulo"], musica.get("artista", ""), pedir=pedir)
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None
        except Exception:
            raise HTTPException(502, ERRO_INTERNET.format(servico="O iTunes")) from None

    @app.put("/api/musicas/{id_musica}/fundo")
    def fundo(id_musica: str, pedido: PedidoFundo):
        _musica_ou_404(id_musica)
        try:
            return biblioteca.definir_fundo(id_musica, pedido.url, pedido.desfoque)
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None

    @app.get("/api/musicas/{id_musica}/faixas/{arquivo}")
    def faixa(id_musica: str, arquivo: str):
        try:
            caminho = biblioteca.caminho_da_faixa(id_musica, arquivo)
        except KeyError:
            raise HTTPException(404, "Faixa não encontrada.") from None
        # FileResponse aceita pedidos parciais (Range): o player pode pular para qualquer ponto
        return FileResponse(caminho, media_type="audio/wav")

    return app
