import json

import pytest
from fastapi.testclient import TestClient

from karaoke.api import criar_app
from karaoke.busca import Resultado
from karaoke.fila import Fila

ID_MUSICA = "abcdef123456"


def musica_salva(pasta, id_musica=ID_MUSICA, titulo="Help!"):
    pasta_musica = pasta / id_musica
    pasta_musica.mkdir(parents=True)
    (pasta_musica / "instrumental.wav").write_bytes(b"RIFF" + b"0" * 96)
    (pasta_musica / "segredo.txt").write_text("não é faixa")
    dados = {"id": id_musica, "titulo": titulo, "artista": "The Beatles", "tom": "A", "escala": "maior",
             "tem_letra": False, "faixas": [{"nome": "instrumental", "arquivo": "instrumental.wav", "volume": 1.0}]}
    (pasta_musica / "musica.json").write_text(json.dumps(dados), encoding="utf-8")
    return dados


@pytest.fixture
def pasta(tmp_path):
    return tmp_path / "dados"


def cliente(pasta, dispositivo="cpu", buscar=None):
    def buscar_falso(texto, limite):
        if not texto.strip():
            raise ValueError("Digite o nome da música.")
        return [Resultado("2Q_ZzBGPdqE", "Help!", "The Beatles", 120, None)][:limite]

    fila = Fila(pasta)  # sem iniciar(): nada é baixado de verdade
    return TestClient(criar_app(pasta, fila, buscar or buscar_falso, dispositivo))


def test_sistema_diz_o_dispositivo_e_o_modo_padrao(pasta):
    assert cliente(pasta, "cpu").get("/api/sistema").json()["modo_padrao"] == "rapido"
    resposta = cliente(pasta, "cuda").get("/api/sistema").json()
    assert resposta["modo_padrao"] == "qualidade"
    assert [m["descricao"] for m in resposta["modos"]] == ["Rápida", "Alta"]


def test_busca_traz_a_estimativa_de_cada_modo(pasta):
    resultado = cliente(pasta).get("/api/busca", params={"q": "help"}).json()[0]
    assert resultado["id"] == "2Q_ZzBGPdqE"
    assert resultado["inicio_previa"] == 40
    assert resultado["estimativas"] == {"rapido": 840, "qualidade": 7320}


def test_busca_vazia_e_limite_invalido_dao_422(pasta):
    api = cliente(pasta)
    assert api.get("/api/busca", params={"q": " "}).status_code == 422
    assert api.get("/api/busca", params={"q": "help", "limite": 99}).status_code == 422


def test_youtube_fora_do_ar_da_502(pasta):
    def buscar_quebrado(texto, limite):
        raise ConnectionError("sem internet")

    resposta = cliente(pasta, buscar=buscar_quebrado).get("/api/busca", params={"q": "help"})
    assert resposta.status_code == 502
    assert "internet" in resposta.json()["detail"]


def test_adiciona_na_fila_com_o_modo_padrao(pasta):
    api = cliente(pasta, "cuda")
    resposta = api.post("/api/fila", json={"id_video": "2Q_ZzBGPdqE", "titulo": "Help!", "duracao": 140})
    assert resposta.status_code == 201
    assert resposta.json()["modo"] == "qualidade"
    assert [t["estado"] for t in api.get("/api/fila").json()] == ["na fila"]


@pytest.mark.parametrize("pedido", [
    {"id_video": "curto", "titulo": "Help!"},
    {"id_video": "2Q_ZzBGPdqE", "titulo": "Help!", "modo": "ultra"},
    {"id_video": "2Q_ZzBGPdqE", "titulo": "Help!", "duracao": 0},
    {"id_video": "2Q_ZzBGPdqE"},
])
def test_recusa_pedido_invalido_para_a_fila(pasta, pedido):
    assert cliente(pasta).post("/api/fila", json=pedido).status_code == 422


def test_esquecer_tarefa(pasta):
    api = cliente(pasta)
    tarefa = api.post("/api/fila", json={"id_video": "2Q_ZzBGPdqE", "titulo": "Help!"}).json()
    assert api.delete(f"/api/fila/{tarefa['id']}").status_code == 204
    assert api.delete(f"/api/fila/{tarefa['id']}").status_code == 404


def test_lista_obtem_e_apaga_musicas(pasta):
    dados = musica_salva(pasta)
    api = cliente(pasta)
    assert api.get("/api/musicas").json() == [dados]
    assert api.get(f"/api/musicas/{ID_MUSICA}").json()["titulo"] == "Help!"
    assert api.delete(f"/api/musicas/{ID_MUSICA}").status_code == 204
    assert api.get("/api/musicas").json() == []
    assert api.get(f"/api/musicas/{ID_MUSICA}").status_code == 404
    assert api.delete(f"/api/musicas/{ID_MUSICA}").status_code == 404


def test_lista_ignora_json_estragado(pasta):
    musica_salva(pasta)
    (pasta / "fedcba654321").mkdir()
    (pasta / "fedcba654321" / "musica.json").write_text("{quebrado")
    assert [m["id"] for m in cliente(pasta).get("/api/musicas").json()] == [ID_MUSICA]


def test_serve_a_faixa_inteira_e_em_partes(pasta):
    musica_salva(pasta)
    api = cliente(pasta)
    inteira = api.get(f"/api/musicas/{ID_MUSICA}/faixas/instrumental.wav")
    assert inteira.status_code == 200
    assert inteira.headers["content-type"] == "audio/wav"
    parte = api.get(f"/api/musicas/{ID_MUSICA}/faixas/instrumental.wav", headers={"Range": "bytes=0-3"})
    assert parte.status_code == 206
    assert parte.content == b"RIFF"


@pytest.mark.parametrize("caminho", [
    f"/api/musicas/{ID_MUSICA}/faixas/segredo.txt",       # existe, mas não é faixa
    f"/api/musicas/{ID_MUSICA}/faixas/musica.json",
    f"/api/musicas/{ID_MUSICA}/faixas/..%2F..%2Fsegredo.txt",
    "/api/musicas/..%2F..%2Fetc/faixas/passwd",
    "/api/musicas/naoexiste000/faixas/instrumental.wav",
])
def test_so_serve_arquivos_que_sao_faixas(pasta, caminho):
    musica_salva(pasta)
    assert cliente(pasta).get(caminho).status_code == 404


def test_recusa_pedido_de_outro_site(pasta):
    musica_salva(pasta)
    api = cliente(pasta)
    resposta = api.delete(f"/api/musicas/{ID_MUSICA}", headers={"Origin": "https://site-malvado.com"})
    assert resposta.status_code == 403
    assert api.get(f"/api/musicas/{ID_MUSICA}").status_code == 200
    # O próprio app (mesma origem) pode
    assert api.delete(f"/api/musicas/{ID_MUSICA}", headers={"Origin": "http://testserver"}).status_code == 204


# ---------- site ----------


def test_serve_o_site_compilado_sem_esconder_a_api(pasta, tmp_path):
    site = tmp_path / "dist"
    site.mkdir()
    (site / "index.html").write_text("<h1>Karaokê</h1>", encoding="utf-8")
    app = TestClient(criar_app(pasta, Fila(pasta), dispositivo="cpu", pasta_site=site))
    assert "Karaokê" in app.get("/").text
    assert app.get("/api/sistema").status_code == 200
    assert app.get("/api/nao-existe").status_code == 404
    assert app.post("/api/sistema").status_code == 405


def test_sem_site_compilado_so_a_api_responde(pasta, tmp_path):
    app = TestClient(criar_app(pasta, Fila(pasta), dispositivo="cpu", pasta_site=tmp_path / "nao-existe"))
    assert app.get("/").status_code == 404
    assert app.get("/api/sistema").status_code == 200
