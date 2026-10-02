import os
import subprocess
import tempfile
import time
from pathlib import Path

import pytest

from karaoke.download import baixar_audio
from karaoke.cancelamento import Cancelada
from karaoke.faixas import INSTRUMENTAL, VOCAIS_DE_APOIO, VOZ_PRINCIPAL, Faixa
from karaoke.separacao import (
    MODOS,
    detectar_dispositivo,
    estimar_segundos,
    modo_padrao,
    obter_modo,
    separar,
    separar_em_processo,
)

# ---------- download ----------


def baixar_falso(url, modelo_nome, ao_progredir):
    """Faz o papel do yt-dlp: avisa o progresso e cria o arquivo."""
    baixar_falso.url = url
    ao_progredir(0.5)
    ao_progredir(1.0)
    open(modelo_nome.replace("%(ext)s", "wav"), "wb").close()


def test_baixa_o_audio_para_a_pasta_da_musica(tmp_path):
    progresso = []
    caminho = baixar_audio("dQw4w9WgXcQ", tmp_path / "musica", progresso.append, baixar=baixar_falso)
    assert caminho == tmp_path / "musica" / "original.wav"
    assert caminho.exists()
    assert baixar_falso.url == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert progresso == [0.5, 1.0]


@pytest.mark.parametrize("id_video", ["", "curto", "dQw4w9WgXcQ&list=x", "../../etc/x"])
def test_download_recusa_id_invalido(tmp_path, id_video):
    with pytest.raises(ValueError):
        baixar_audio(id_video, tmp_path, baixar=baixar_falso)


def recusar_vezes(vezes):
    """yt-dlp falso que leva 403 nas primeiras `vezes` e depois baixa."""
    chamadas = []

    def baixar(url, modelo_nome, ao_progredir):
        chamadas.append(url)
        if len(chamadas) <= vezes:
            raise Exception("ERROR: unable to download video data: HTTP Error 403: Forbidden")
        baixar_falso(url, modelo_nome, ao_progredir)

    baixar.chamadas = chamadas
    return baixar


def test_download_tenta_de_novo_quando_o_youtube_recusa(tmp_path):
    baixar, esperas = recusar_vezes(1), []
    caminho = baixar_audio("dQw4w9WgXcQ", tmp_path, baixar=baixar, esperar=esperas.append)
    assert caminho.exists()
    assert len(baixar.chamadas) == 2
    assert esperas == [3]


def test_download_explica_quando_o_youtube_recusa_sempre(tmp_path):
    baixar = recusar_vezes(99)
    with pytest.raises(RuntimeError, match="403.*yt-dlp"):
        baixar_audio("dQw4w9WgXcQ", tmp_path, baixar=baixar, esperar=lambda s: None)
    assert len(baixar.chamadas) == 2


@pytest.mark.parametrize("id_video", ["dQw4w9WgXcQ", "ab403cdEFgh"])  # "403" no id não é recusa
def test_download_nao_repete_outros_erros(tmp_path, id_video):
    chamadas = []

    def baixar(url, modelo_nome, ao_progredir):
        chamadas.append(url)
        raise Exception(f"ERROR: [youtube] {id_video}: Video unavailable")

    with pytest.raises(Exception, match="unavailable"):
        baixar_audio(id_video, tmp_path, baixar=baixar, esperar=lambda s: None)
    assert len(chamadas) == 1


def test_download_avisa_quando_o_audio_nao_aparece(tmp_path):
    with pytest.raises(RuntimeError, match="ffmpeg"):
        baixar_audio("dQw4w9WgXcQ", tmp_path, baixar=lambda url, modelo, progresso: None)


# ---------- separação ----------


class SeparadorFalso:
    """Imita o Separator do audio-separator: cria os arquivos pedidos."""

    def __init__(self, pasta, gerar=True):
        self.pasta = pasta
        self.gerar = gerar
        self.chamadas = []

    def load_model(self, model_filename):
        self.modelo = model_filename

    def separate(self, entrada, custom_output_names):
        self.chamadas.append((self.modelo, entrada))
        self.temporarios = tempfile.gettempdir()
        if self.gerar:
            for nome in custom_output_names.values():
                (self.pasta / f"{nome}.wav").write_bytes(b"audio")


def separar_com_falso(tmp_path, modo="rapido", **extra):
    separadores = []

    def criar(pasta, pasta_modelos):
        separadores.append(SeparadorFalso(pasta, **extra))
        return separadores[-1]

    etapas = []
    faixas = separar(tmp_path / "original.wav", tmp_path, modo,
                     ao_mudar_etapa=lambda n, total: etapas.append((n, total)), criar_separador=criar)
    return faixas, separadores[0], etapas


def test_separa_em_duas_etapas_usando_a_voz_da_primeira(tmp_path):
    faixas, separador, etapas = separar_com_falso(tmp_path)
    modo = MODOS["rapido"]
    assert separador.chamadas == [
        (modo.modelo_voz, str(tmp_path / "original.wav")),
        (modo.modelo_karaoke, str(tmp_path / "voz.wav")),
    ]
    assert etapas == [(1, 2), (2, 2)]


def test_devolve_as_tres_faixas_do_karaoke(tmp_path):
    faixas, _, _ = separar_com_falso(tmp_path)
    assert [(f.nome, f.arquivo) for f in faixas] == [
        (VOZ_PRINCIPAL, "voz-principal.wav"),
        (VOCAIS_DE_APOIO, "vocais-de-apoio.wav"),
        (INSTRUMENTAL, "instrumental.wav"),
    ]
    assert all((tmp_path / f.arquivo).exists() for f in faixas)


def test_apaga_a_voz_inteira_depois_de_dividir(tmp_path):
    separar_com_falso(tmp_path)
    assert not (tmp_path / "voz.wav").exists()


def test_modo_qualidade_usa_os_roformer(tmp_path):
    _, separador, _ = separar_com_falso(tmp_path, "qualidade")
    assert [modelo for modelo, _ in separador.chamadas] == [
        MODOS["qualidade"].modelo_voz, MODOS["qualidade"].modelo_karaoke,
    ]


def test_avisa_quando_o_modelo_nao_gera_os_arquivos(tmp_path):
    with pytest.raises(RuntimeError, match="não gerou"):
        separar_com_falso(tmp_path, gerar=False)


def test_pedacos_temporarios_ficam_na_pasta_da_musica(tmp_path):
    antes = tempfile.gettempdir()
    _, separador, _ = separar_com_falso(tmp_path)
    assert separador.temporarios == str(tmp_path / "temporarios")
    assert tempfile.gettempdir() == antes
    assert not (tmp_path / "temporarios").exists()


def test_volta_a_pasta_temporaria_mesmo_com_erro(tmp_path):
    antes = tempfile.gettempdir()
    with pytest.raises(RuntimeError):
        separar_com_falso(tmp_path, gerar=False)
    assert tempfile.gettempdir() == antes


def test_separador_de_verdade_separa_em_pedacos(tmp_path, monkeypatch):
    import sys
    import types

    from karaoke import separacao

    recebido = {}
    falso = types.ModuleType("audio_separator.separator")
    falso.Separator = lambda **opcoes: recebido.update(opcoes)
    monkeypatch.setitem(sys.modules, "audio_separator", types.ModuleType("audio_separator"))
    monkeypatch.setitem(sys.modules, "audio_separator.separator", falso)
    separacao._criar_separador(tmp_path, tmp_path / "modelos")
    assert recebido["chunk_duration"] == separacao.PEDACO_SEGUNDOS


def test_recusa_modo_desconhecido():
    with pytest.raises(ValueError, match="rapido ou qualidade"):
        obter_modo("ultra")


# ---------- escolha do modo e estimativa ----------


@pytest.mark.parametrize("saida, codigo, esperado", [("True\n", 0, "cuda"), ("False\n", 0, "cpu"), ("", 1, "cpu")])
def test_detecta_a_placa_num_processo_a_parte(saida, codigo, esperado):
    def rodar(comando, **opcoes):
        assert "torch.cuda.is_available()" in comando[-1]
        return subprocess.CompletedProcess(comando, codigo, saida, "")

    assert detectar_dispositivo(rodar) == esperado


def test_sem_python_para_perguntar_fica_na_cpu():
    def rodar(comando, **opcoes):
        raise subprocess.TimeoutExpired(comando, 120)

    assert detectar_dispositivo(rodar) == "cpu"


def test_modo_padrao_depende_da_placa_de_video():
    assert modo_padrao("cuda") == "qualidade"
    assert modo_padrao("cpu") == "rapido"


def test_estimativa_na_cpu_usa_o_que_foi_medido():
    # 4 minutos: ~28 min no rápido e ~4 h no de qualidade
    assert estimar_segundos("rapido", "cpu", 240) == 1680
    assert estimar_segundos("qualidade", "cpu", 240) == 14640


def test_sem_medicao_ou_sem_duracao_nao_estima():
    assert estimar_segundos("qualidade", "cuda", 240) is None  # GPU ainda não medida
    assert estimar_segundos("rapido", "cpu", None) is None


# ---------- separar num processo à parte ----------
# Os "filhos" falsos ficam no nível do módulo: com spawn, o processo filho importa este arquivo.


def filho_que_separa(mensagens, audio, pasta, nome_modo, pasta_modelos):
    mensagens.put(("etapa", (1, 2)))
    mensagens.put(("etapa", (2, 2)))
    mensagens.put(("pronto", [Faixa(INSTRUMENTAL, f"{nome_modo}.wav")]))


def filho_com_erro(mensagens, *args):
    mensagens.put(("erro", "modelo não encontrado"))


def filho_que_morre(mensagens, *args):
    os._exit(9)  # como o kernel matando por falta de memória: sai sem mandar nada


def filho_demorado(mensagens, audio, pasta, *args):
    (Path(pasta) / "pid").write_text(str(os.getpid()))
    mensagens.put(("etapa", (1, 2)))
    time.sleep(60)


def test_processo_avisa_as_etapas_e_devolve_as_faixas(tmp_path):
    etapas = []
    faixas = separar_em_processo(tmp_path / "a.wav", tmp_path, "rapido", "modelos",
                                 lambda numero, total: etapas.append(numero), alvo=filho_que_separa)
    assert etapas == [1, 2]
    assert faixas == [Faixa(INSTRUMENTAL, "rapido.wav")]


def test_erro_no_processo_vira_erro_com_o_texto(tmp_path):
    with pytest.raises(RuntimeError, match="modelo não encontrado"):
        separar_em_processo(tmp_path / "a.wav", tmp_path, alvo=filho_com_erro)


def test_processo_que_morre_sem_avisar_vira_erro(tmp_path):
    with pytest.raises(RuntimeError, match="parou no meio"):
        separar_em_processo(tmp_path / "a.wav", tmp_path, alvo=filho_que_morre)


def test_cancelar_encerra_o_processo(tmp_path):
    def verificar():
        if (tmp_path / "pid").exists():
            raise Cancelada()

    inicio = time.monotonic()
    with pytest.raises(Cancelada):
        separar_em_processo(tmp_path / "a.wav", tmp_path, verificar=verificar, alvo=filho_demorado)
    assert time.monotonic() - inicio < 30
    with pytest.raises(ProcessLookupError):  # o filho não existe mais
        os.kill(int((tmp_path / "pid").read_text()), 0)
