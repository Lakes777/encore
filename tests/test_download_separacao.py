import pytest

from karaoke.download import baixar_audio
from karaoke.faixas import INSTRUMENTAL, VOCAIS_DE_APOIO, VOZ_PRINCIPAL
from karaoke.separacao import (
    MODOS,
    estimar_segundos,
    modo_padrao,
    obter_modo,
    separar,
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


def test_recusa_modo_desconhecido():
    with pytest.raises(ValueError, match="rapido ou qualidade"):
        obter_modo("ultra")


# ---------- escolha do modo e estimativa ----------


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
