import io

import pytest
from fastapi.testclient import TestClient

from karaoke.api import criar_app
from karaoke.fila import Fila
from karaoke.previa import VALIDADE, Previas

ID_VIDEO = "2Q_ZzBGPdqE"
AUDIO = b"0123456789" * 10_000


class RespostaFalsa(io.BytesIO):
    """Imita a resposta do urllib: status, headers e read()."""

    def __init__(self, dados, status, headers):
        super().__init__(dados)
        self.status = status
        self.headers = headers
        self.fechada = False

    def close(self):
        self.fechada = True
        super().close()


class YouTubeFalso:
    def __init__(self):
        self.extracoes = 0
        self.pedidos = []
        self.respostas = []

    def extrair(self, id_video):
        self.extracoes += 1
        return f"https://audio.falso/{id_video}", {"User-Agent": "yt-dlp"}

    def abrir(self, url, cabecalhos):
        self.pedidos.append((url, cabecalhos))
        if "Range" in cabecalhos:
            inicio = int(cabecalhos["Range"].removeprefix("bytes=").split("-")[0])
            dados = AUDIO[inicio:]
            headers = {"Content-Type": "audio/mp4", "Content-Length": str(len(dados)), "Accept-Ranges": "bytes",
                       "Content-Range": f"bytes {inicio}-{len(AUDIO) - 1}/{len(AUDIO)}", "Set-Cookie": "x"}
            resposta = RespostaFalsa(dados, 206, headers)
        else:
            resposta = RespostaFalsa(AUDIO, 200, {"Content-Type": "audio/mp4", "Content-Length": str(len(AUDIO))})
        self.respostas.append(resposta)
        return resposta


def test_repassa_o_pedaco_pedido_com_os_cabecalhos_do_audio():
    youtube = YouTubeFalso()
    status, cabecalhos, pedacos = Previas(youtube.extrair, youtube.abrir).abrir(ID_VIDEO, "bytes=50000-")
    assert status == 206
    assert cabecalhos["Content-Range"] == f"bytes 50000-99999/{len(AUDIO)}"
    assert "Set-Cookie" not in cabecalhos  # só o que o navegador precisa para tocar
    assert b"".join(pedacos) == AUDIO[50000:]
    assert youtube.pedidos[0] == (f"https://audio.falso/{ID_VIDEO}", {"User-Agent": "yt-dlp", "Range": "bytes=50000-"})
    assert youtube.respostas[0].fechada


def test_guarda_o_endereco_ate_vencer():
    youtube, agora = YouTubeFalso(), [0.0]
    previas = Previas(youtube.extrair, youtube.abrir, relogio=lambda: agora[0])
    for _ in range(3):
        previas.abrir(ID_VIDEO, "bytes=0-")
    assert youtube.extracoes == 1
    agora[0] = VALIDADE + 1
    previas.abrir(ID_VIDEO)
    assert youtube.extracoes == 2


@pytest.mark.parametrize("id_video", ["curto", "../../etc/pa", "2Q_ZzBGPdqE&x=1"])
def test_recusa_id_invalido(id_video):
    youtube = YouTubeFalso()
    with pytest.raises(ValueError):
        Previas(youtube.extrair, youtube.abrir).abrir(id_video)
    assert youtube.extracoes == 0


def cliente(tmp_path, previas):
    return TestClient(criar_app(tmp_path, Fila(tmp_path), dispositivo="cpu", previas=previas))


def test_rota_da_previa_aceita_range(tmp_path):
    youtube = YouTubeFalso()
    app = cliente(tmp_path, Previas(youtube.extrair, youtube.abrir))
    resposta = app.get(f"/api/previa/{ID_VIDEO}", headers={"Range": "bytes=99990-"})
    assert resposta.status_code == 206
    assert resposta.headers["content-type"] == "audio/mp4"
    assert resposta.content == AUDIO[99990:]
    assert app.get(f"/api/previa/{ID_VIDEO}").content == AUDIO


def test_rota_da_previa_com_erro(tmp_path):
    def sem_internet(id_video):
        raise OSError("sem rede")

    app = cliente(tmp_path, Previas(sem_internet))
    resposta = app.get(f"/api/previa/{ID_VIDEO}")
    assert resposta.status_code == 502
    assert "YouTube" in resposta.json()["detail"]
    assert app.get("/api/previa/curto").status_code == 422
