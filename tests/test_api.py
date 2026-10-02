import io
import json
import threading
import zipfile

import pytest
from fastapi.testclient import TestClient

from karaoke.api import criar_app
from karaoke.busca import Resultado
from karaoke.fila import Fila
from karaoke.versoes import estimar_segundos as estimar_versao

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
    assert [m["descricao"] for m in resposta["modos"]] == ["Versão pronta", "Rápida", "Alta"]
    assert resposta["modo_reserva"] == "rapido"


def test_busca_traz_a_estimativa_de_cada_modo(pasta):
    resultado = cliente(pasta).get("/api/busca", params={"q": "help"}).json()[0]
    assert resultado["id"] == "2Q_ZzBGPdqE"
    assert resultado["inicio_previa"] == 40
    assert resultado["estimativas"] == {"pronta": estimar_versao(120), "rapido": 840, "qualidade": 7320}


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


def test_cancelar_tarefa_rodando(pasta):
    comecou, soltar = threading.Event(), threading.Event()

    def baixar(id_video, pasta_musica, ao_progredir):
        pasta_musica.mkdir(parents=True)
        (pasta_musica / "original.wav").write_bytes(b"x")
        return pasta_musica / "original.wav"

    def separar(audio, pasta_musica, modo, pasta_modelos, ao_mudar_etapa, verificar):
        comecou.set()
        soltar.wait(5)
        verificar()  # como a separação de verdade, que confere a cada meio segundo
        raise AssertionError("devia ter sido cancelada")

    fila = Fila(pasta, baixar=baixar, separar=separar)
    api = TestClient(criar_app(pasta, fila, None, "cpu"))
    tarefa = api.post("/api/fila", json={"id_video": "2Q_ZzBGPdqE", "titulo": "Help!"}).json()
    trabalho = threading.Thread(target=fila.processar_proxima)
    trabalho.start()
    assert comecou.wait(5)

    assert api.delete(f"/api/fila/{tarefa['id']}").status_code == 204
    assert [t["estado"] for t in api.get("/api/fila").json()] == ["cancelando"]
    soltar.set()
    trabalho.join(5)
    assert api.get("/api/fila").json() == []
    assert not (pasta / tarefa["id"]).exists()


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


def test_aceita_o_modo_versao_pronta_na_fila(pasta):
    resposta = cliente(pasta).post("/api/fila", json={"id_video": "2Q_ZzBGPdqE", "titulo": "Help!", "modo": "pronta"})
    assert resposta.status_code == 201
    assert resposta.json()["modo"] == "pronta"
    assert resposta.json()["aviso"] is None


# ---------- volumes ----------


def test_salva_o_volume_das_faixas(pasta):
    musica_salva(pasta)
    app = cliente(pasta)
    resposta = app.put(f"/api/musicas/{ID_MUSICA}/volumes", json={"volumes": {"instrumental.wav": 0.25}})
    assert resposta.status_code == 200
    assert resposta.json() == [{"nome": "instrumental", "arquivo": "instrumental.wav", "volume": 0.25}]
    assert app.get(f"/api/musicas/{ID_MUSICA}").json()["faixas"][0]["volume"] == 0.25


@pytest.mark.parametrize("volumes", [{"instrumental.wav": 1.5}, {"instrumental.wav": -0.1},
                                     {"segredo.txt": 0.5}, {"instrumental.wav": 0.5, "nao-existe.wav": 0.5}])
def test_volume_errado_e_recusado_sem_gravar_nada(pasta, volumes):
    musica_salva(pasta)
    app = cliente(pasta)
    assert app.put(f"/api/musicas/{ID_MUSICA}/volumes", json={"volumes": volumes}).status_code == 422
    assert app.get(f"/api/musicas/{ID_MUSICA}").json()["faixas"][0]["volume"] == 1.0


def test_volumes_de_musica_inexistente_dao_404(pasta):
    assert cliente(pasta).put(f"/api/musicas/{ID_MUSICA}/volumes", json={"volumes": {}}).status_code == 404


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


# ---------- exportar e importar ----------


def test_exporta_a_musica_num_zip(pasta):
    musica_salva(pasta, titulo="Like a Stone")
    resposta = cliente(pasta).get(f"/api/musicas/{ID_MUSICA}/exportar")
    assert resposta.status_code == 200
    assert resposta.headers["content-type"] == "application/zip"
    assert resposta.headers["content-disposition"] == 'attachment; filename="Like-a-Stone.karaoke.zip"'
    with zipfile.ZipFile(io.BytesIO(resposta.content)) as pacote:
        assert sorted(pacote.namelist()) == ["instrumental.wav", "musica.json"]


def test_exportar_musica_que_nao_existe_da_404(pasta):
    assert cliente(pasta).get("/api/musicas/000000000000/exportar").status_code == 404
    assert cliente(pasta).get("/api/musicas/..%2F..%2Fetc/exportar").status_code == 404


def test_importa_e_a_musica_aparece_na_lista(pasta, tmp_path):
    dados = musica_salva(tmp_path / "outro-pc")
    conteudo = cliente(tmp_path / "outro-pc").get(f"/api/musicas/{ID_MUSICA}/exportar").content
    api = cliente(pasta)
    resposta = api.post("/api/musicas/importar", content=conteudo, headers={"Content-Type": "application/zip"})
    assert resposta.status_code == 201
    assert resposta.json() == dados
    assert [m["id"] for m in api.get("/api/musicas").json()] == [ID_MUSICA]
    assert sorted(p.name for p in pasta.iterdir()) == [ID_MUSICA]  # o .zip recebido não fica para trás


def test_importar_repetida_pergunta_e_substitui_se_pedir(pasta, tmp_path):
    musica_salva(pasta, titulo="Antiga")
    musica_salva(tmp_path / "outro-pc", titulo="Nova")
    conteudo = cliente(tmp_path / "outro-pc").get(f"/api/musicas/{ID_MUSICA}/exportar").content
    api = cliente(pasta)
    resposta = api.post("/api/musicas/importar", content=conteudo)
    assert resposta.status_code == 409
    assert resposta.json()["detail"] == 'Já existe a música "Antiga". Substituir pela do pacote?'
    assert api.post("/api/musicas/importar?substituir=true", content=conteudo).status_code == 201
    assert api.get(f"/api/musicas/{ID_MUSICA}").json()["titulo"] == "Nova"


def test_importar_o_que_nao_serve_da_422(pasta):
    api = cliente(pasta)
    resposta = api.post("/api/musicas/importar", content=b"isto nao e um zip")
    assert resposta.status_code == 422
    assert resposta.json()["detail"] == "O arquivo enviado não é um .zip válido."
    assert api.post("/api/musicas/importar", content=b"").json()["detail"] == "Nenhum arquivo foi enviado."
    assert list(pasta.iterdir()) == []


def test_importar_grande_demais_da_413(pasta, monkeypatch):
    monkeypatch.setattr("karaoke.pacote.TAMANHO_MAXIMO", 10)
    resposta = cliente(pasta).post("/api/musicas/importar", content=b"x" * 11)
    assert resposta.status_code == 413  # pelo Content-Length, antes de receber
    assert not pasta.exists() or list(pasta.iterdir()) == []

    def aos_pedacos():  # sem Content-Length: conta enquanto recebe
        yield b"x" * 6
        yield b"x" * 6

    resposta = cliente(pasta).post("/api/musicas/importar", content=aos_pedacos())
    assert resposta.status_code == 413
    assert list(pasta.iterdir()) == []


def test_importar_de_outro_site_e_recusado(pasta):
    resposta = cliente(pasta).post("/api/musicas/importar", content=b"x", headers={"Origin": "https://malvado.example"})
    assert resposta.status_code == 403


def test_ao_subir_apaga_sobras_de_importacao(pasta):
    musica_salva(pasta)
    (pasta / ".importando-abc.zip").write_bytes(b"x")
    cliente(pasta)
    assert sorted(p.name for p in pasta.iterdir()) == [ID_MUSICA]
