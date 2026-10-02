"""API do karaokê (FastAPI). Roda só no próprio computador.

As rotas que chamam o YouTube são `def` (sem async): o FastAPI as roda numa
thread à parte, então uma busca lenta não trava as outras rotas.
"""

import uuid
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from karaoke.biblioteca import DESFOQUE_MAXIMO, DESFOQUE_PADRAO, Biblioteca
from karaoke.busca import LIMITE_MAXIMO, LIMITE_PADRAO, buscar
from karaoke.capas import buscar_capas
from karaoke.internet import pedir_json
from karaoke.letras import baixar_letra, buscar_versoes, limpar_titulo
from karaoke.previa import Previas
from karaoke.fila import Fila
from karaoke.separacao import MODOS, detectar_dispositivo, estimar_segundos, modo_padrao
from karaoke import pacote, versoes


class PedidoFila(BaseModel):
    id_video: str = Field(pattern=r"^[A-Za-z0-9_-]{11}$")
    titulo: str = Field(max_length=300)
    artista: str = Field(default="", max_length=300)
    modo: str | None = None  # sem modo = o padrão do computador
    duracao: int | None = Field(default=None, ge=1, le=6 * 60 * 60)


class PedidoLetra(BaseModel):
    id_lrclib: int = Field(ge=1)


class PedidoVolumes(BaseModel):
    # arquivo da faixa -> volume de 0 a 1 (só as faixas que mudaram)
    volumes: dict[str, float] = Field(max_length=50)


class PedidoAtraso(BaseModel):
    atraso: float | None = None  # None = automático


class PedidoFundo(BaseModel):
    url: str | None = Field(default=None, max_length=2000)
    desfoque: int = Field(default=DESFOQUE_PADRAO, ge=0, le=DESFOQUE_MAXIMO)


ERRO_INTERNET = "{servico} não respondeu. Confira a internet e tente de novo."


def _estimativas(dispositivo, duracao):
    estimativas = {versoes.MODO_PRONTA: versoes.estimar_segundos(duracao)}
    return estimativas | {nome: estimar_segundos(nome, dispositivo, duracao) for nome in MODOS}


def _com_titulo_limpo(musica):
    """Junta o título sem os enfeites do YouTube ("Bat Country" em vez de
    "Avenged Sevenfold - Bat Country [Official Music Video]"), só para a tela mostrar.
    Serve para músicas e tarefas da fila. Não é salvo: o título original continua
    sendo o que vale para letra e capa. Se a limpeza não sobrar nada, fica o original."""
    titulo, _ = limpar_titulo(musica.get("titulo", ""), musica.get("artista", ""))
    return {**musica, "titulo_limpo": titulo or musica.get("titulo", "")}


def criar_app(pasta_dados, fila=None, buscar=buscar, dispositivo=None, pedir=pedir_json, pasta_site=None,
              previas=None):
    """Monta o app. `pasta_site` é o site compilado (web/dist), servido em "/" se existir."""
    dispositivo = dispositivo or detectar_dispositivo()
    fila = fila or Fila(pasta_dados)
    biblioteca = Biblioteca(pasta_dados)
    pacote.limpar_temporarios(pasta_dados)  # sobras de uma importação que o servidor não terminou
    previas = previas or Previas()
    app = FastAPI(title="Encore")
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
            # A versão pronta vem primeiro: quando acha, leva 1-2 min em vez de vários
            "modos": [{"nome": versoes.MODO_PRONTA, "descricao": "Versão pronta"}]
            + [{"nome": m.nome, "descricao": m.descricao} for m in MODOS.values()],
            "modo_reserva": fila.modo_reserva,
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

    @app.get("/api/previa/{id_video}")
    def previa(id_video: str, request: Request):
        # O <audio> pede o arquivo em pedaços (Range); cada pedaço é repassado do YouTube
        try:
            status, cabecalhos, pedacos = previas.abrir(id_video, request.headers.get("range"))
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None
        except Exception:
            raise HTTPException(502, ERRO_INTERNET.format(servico="O YouTube")) from None
        return StreamingResponse(pedacos, status_code=status, headers=cabecalhos,
                                 media_type=cabecalhos.get("Content-Type", "audio/mp4"))

    @app.get("/api/fila")
    def listar_fila():
        return [_com_titulo_limpo(t.para_dict()) for t in fila.tarefas()]

    @app.post("/api/fila", status_code=201)
    def adicionar_na_fila(pedido: PedidoFila):
        try:
            tarefa = fila.adicionar(pedido.id_video, pedido.titulo, pedido.artista,
                                    pedido.modo or modo_padrao(dispositivo), pedido.duracao)
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None
        return _com_titulo_limpo(tarefa.para_dict())

    @app.delete("/api/fila/{id_tarefa}", status_code=204)
    def esquecer_tarefa(id_tarefa: str):
        """Tira da fila; se a música estiver sendo preparada, cancela (fica "cancelando" e some)."""
        try:
            fila.esquecer(id_tarefa)
        except KeyError:
            raise HTTPException(404, "Essa tarefa não está na fila.") from None

    @app.get("/api/musicas")
    def listar_musicas():
        return [_com_titulo_limpo(musica) for musica in biblioteca.listar()]

    @app.get("/api/musicas/{id_musica}")
    def obter_musica(id_musica: str):
        try:
            return _com_titulo_limpo(biblioteca.obter(id_musica))
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

    @app.put("/api/musicas/{id_musica}/atraso-letra")
    def atraso_letra(id_musica: str, pedido: PedidoAtraso):
        _musica_ou_404(id_musica)
        try:
            return {"atraso": biblioteca.definir_atraso_letra(id_musica, pedido.atraso)}
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None

    @app.get("/api/musicas/{id_musica}/capas")
    def capas(id_musica: str):
        musica = _musica_ou_404(id_musica)
        try:
            return buscar_capas(musica["titulo"], musica.get("artista", ""), pedir=pedir)
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None
        except Exception:
            raise HTTPException(502, ERRO_INTERNET.format(servico="O iTunes")) from None

    @app.put("/api/musicas/{id_musica}/volumes")
    def volumes(id_musica: str, pedido: PedidoVolumes):
        _musica_ou_404(id_musica)
        try:
            return biblioteca.definir_volumes(id_musica, pedido.volumes)
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None

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

    @app.get("/api/musicas/{id_musica}/exportar")
    def exportar(id_musica: str):
        dados = _musica_ou_404(id_musica)
        nome = pacote.nome_do_pacote(dados)
        return StreamingResponse(
            pacote.exportar(Path(pasta_dados) / id_musica, dados),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{nome}"'},
        )

    @app.post("/api/musicas/importar", status_code=201)
    async def importar(request: Request, substituir: bool = False):
        # O .zip vem cru no corpo (sem formulário) e vai direto para o disco, ao lado das
        # músicas: nada de guardar centenas de MB na memória
        tamanho = request.headers.get("content-length")
        if tamanho and tamanho.isdigit() and int(tamanho) > pacote.TAMANHO_MAXIMO:
            raise HTTPException(413, "O pacote é grande demais.")
        Path(pasta_dados).mkdir(parents=True, exist_ok=True)
        recebido = Path(pasta_dados) / f"{pacote.PREFIXO_TEMPORARIO}{uuid.uuid4().hex}.zip"
        try:
            total = 0
            with open(recebido, "wb") as arquivo:
                async for pedaco in request.stream():
                    total += len(pedaco)
                    if total > pacote.TAMANHO_MAXIMO:
                        raise HTTPException(413, "O pacote é grande demais.")
                    arquivo.write(pedaco)
            if total == 0:
                raise HTTPException(422, "Nenhum arquivo foi enviado.")
            return await run_in_threadpool(pacote.importar, biblioteca, recebido, substituir)
        except pacote.JaExiste as erro:
            raise HTTPException(409, f'Já existe a música "{erro.titulo}". Substituir pela do pacote?') from None
        except ValueError as erro:
            raise HTTPException(422, str(erro)) from None
        finally:
            recebido.unlink(missing_ok=True)

    @app.get("/api/{resto:path}", include_in_schema=False)
    def rota_inexistente(resto: str):
        # Sem isto, um GET /api errado cairia no site abaixo e voltaria a página em vez
        # de 404. Só GET: assim um POST numa rota que existe continua dando 405.
        raise HTTPException(404, "Rota da API não encontrada.")

    if pasta_site and (Path(pasta_site) / "index.html").is_file():
        # Fica por último: as rotas /api acima têm prioridade
        app.mount("/", StaticFiles(directory=pasta_site, html=True), name="site")

    return app
