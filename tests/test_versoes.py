import numpy as np
import pytest

from karaoke.busca import Resultado
from karaoke.faixas import INSTRUMENTAL
from karaoke.versoes import (
    DIFERENCA_DE_DURACAO,
    MAX_CANDIDATOS,
    QUADRO,
    Comparacao,
    alinhar_amostras,
    comparar,
    estimar_segundos,
    normalizar,
    preparar_versao_pronta,
    procurar_candidatos,
    texto_da_busca,
)

# ---------- cromagramas de mentira ----------
# Música de verdade muda de acorde aos poucos: blocos de ~4 s com o mesmo acorde,
# mais um pouco de ruído. Com colunas totalmente aleatórias nada encaixaria.


def musica(segundos=150, semente=1):
    gerador = np.random.default_rng(semente)
    blocos = gerador.random((12, int(segundos / QUADRO / 40) + 1)) ** 4
    croma = np.repeat(blocos, 40, axis=1)[:, : int(segundos / QUADRO)]
    return normalizar(croma + 0.05 * gerador.random(croma.shape))


def acelerada(croma, fator):
    """Mesma música tocada `fator` vezes mais rápido (menos colunas)."""
    colunas = np.minimum((np.arange(int(croma.shape[1] / fator)) * fator).round().astype(int), croma.shape[1] - 1)
    return croma[:, colunas]


# ---------- comparar ----------


def test_mesma_gravacao_comecando_depois():
    original = musica()
    candidato = original[:, 25:]  # o candidato pula os primeiros 25 quadros
    resultado = comparar(original, candidato)
    assert resultado.aceitavel and resultado.excelente
    assert resultado.inclinacao == pytest.approx(0, abs=1e-3)
    assert resultado.intercepto == pytest.approx(25 * QUADRO, abs=QUADRO)
    assert resultado.semelhanca > 0.99


def test_upload_acelerado_e_aceito_com_a_velocidade_medida():
    original = musica()
    resultado = comparar(original, acelerada(original, 1.02))
    # 2% mais rápido: a cada segundo da original o candidato anda 1/1,02 s
    assert resultado.inclinacao == pytest.approx(1 - 1 / 1.02, abs=0.003)
    assert resultado.aceitavel


def test_regravacao_com_outro_andamento_e_recusada():
    # semelhança de regravação (abaixo da mesma gravação) e 1,4% mais rápida: reamostrar desafinaria
    assert not Comparacao(0.014, -9.0, 0.88, 0.08).aceitavel
    assert Comparacao(0.014, -9.0, 0.97, 0.08).aceitavel  # mesma gravação acelerada: corrige
    assert Comparacao(0.001, -9.0, 0.88, 0.08).aceitavel  # regravação no mesmo andamento: serve


def test_outra_edicao_e_recusada():
    original = musica()
    meio = original.shape[1] // 2
    cortada = np.concatenate([original[:, :meio], original[:, meio + 40:]], axis=1)  # tirou ~3,7 s
    resultado = comparar(original, cortada)
    assert resultado.residuo > 1
    assert not resultado.aceitavel


def test_outra_musica_e_recusada():
    assert not comparar(musica(semente=1), musica(semente=2)).aceitavel


def test_original_curta_demais_nao_compara():
    assert comparar(musica(segundos=5), musica(segundos=5)) is None


# ---------- alinhar ----------


def test_candidato_atrasado_ganha_silencio_no_comeco():
    amostras = np.arange(1, 11, dtype="float32").reshape(-1, 1)
    alinhadas = alinhar_amostras(amostras, 1, Comparacao(0.0, 2.0, 1.0, 0.0))
    assert alinhadas[:, 0].tolist() == [0, 0] + list(range(1, 11))


def test_candidato_adiantado_perde_o_comeco():
    amostras = np.arange(1, 11, dtype="float32").reshape(-1, 2)  # estéreo
    alinhadas = alinhar_amostras(amostras, 1, Comparacao(0.0, -2.0, 1.0, 0.0))
    assert alinhadas.tolist() == amostras[2:].tolist()


def test_velocidade_diferente_reamostra_antes_de_deslocar():
    pedidos = []

    def reamostrar(amostras, de, para):
        pedidos.append((de, para))
        return amostras

    alinhar_amostras(np.zeros((100, 2)), 44100, Comparacao(0.02, 0.0, 1.0, 0.0), reamostrar)
    # acelerado 2%: vira mais amostras na mesma taxa, ou seja, mais lento
    assert pedidos == [(44100, round(44100 / 0.98))]


def test_diferenca_minuscula_de_velocidade_nao_reamostra():
    alinhar_amostras(np.zeros((10, 1)), 1, Comparacao(0.0005, 0.0, 1.0, 0.0),
                     lambda *args: pytest.fail("não devia reamostrar"))


# ---------- buscar candidatos ----------


def resultado(id_, duracao=140, titulo="Help! (Instrumental)", canal="Canal"):
    return Resultado(id_.ljust(11, "x"), titulo, canal, duracao, None)


def test_texto_da_busca():
    assert texto_da_busca("Help! (Remastered 2009)", "The Beatles") == "The Beatles Help!"
    # canal que não é o artista: o título "Artista - Música" basta
    assert texto_da_busca("Avenged Sevenfold - Bat Country", "lavenged7xl") == "Avenged Sevenfold - Bat Country"
    assert texto_da_busca("Coldplay - Yellow - Remastered", "Brian Martens Music") == "Coldplay - Yellow"
    assert texto_da_busca("Yellow - Coldplay HQ Audio", "HypeMusic") == "Yellow - Coldplay"


def test_candidatos_sem_repetir_sem_a_original_e_com_duracao_parecida():
    pedidos = []

    def buscar(texto, limite):
        pedidos.append(texto)
        if texto.endswith("instrumental"):
            return [resultado("orig"), resultado("a"), resultado("b", duracao=140 + DIFERENCA_DE_DURACAO + 1)]
        return [resultado("a"), resultado("c", duracao=None), resultado("d", duracao=150)]

    ids = [c.id for c in procurar_candidatos("Help!", "The Beatles", 140, "origxxxxxxx", buscar)]
    assert pedidos == ["The Beatles Help! instrumental", "The Beatles Help! karaoke"]
    assert ids == ["axxxxxxxxxx", "dxxxxxxxxxx"]


@pytest.mark.parametrize("titulo, aceito", [
    ("Coldplay - Yellow (Official Video)", False),
    ("Yellow - Coldplay HQ Audio", False),
    ("Coldplay - Yellow (official instrumental)", True),
    ("The Beatles - Help! (Karaoke Version)", True),
    ("Coldplay • Yellow 🎤 [Karaokê]", True),
    ("Bat Country Backing Track", True),
    ("Yellow sem voz", True),
])
def test_so_aceita_titulo_de_versao_sem_voz(titulo, aceito):
    candidatos = procurar_candidatos("Yellow", "Coldplay", 269, "x" * 11,
                                     lambda texto, limite: [resultado("a", 269, titulo)])
    assert bool(candidatos) == aceito


def test_no_maximo_alguns_candidatos():
    candidatos = procurar_candidatos("Help!", "", 140, "x" * 11,
                                     lambda texto, limite: [resultado(f"{texto[-1]}{i}") for i in range(limite)])
    assert len(candidatos) == MAX_CANDIDATOS


def test_estimativa():
    assert estimar_segundos(None) is None
    assert 60 < estimar_segundos(240) < 240


# ---------- preparar (tudo trocado por falsos) ----------


class Cenario:
    def __init__(self, tmp_path, cromas):
        self.tmp_path, self.cromas = tmp_path, cromas
        self.baixados, self.alinhado = [], None

    def buscar(self, texto, limite):
        return [resultado(id_) for id_ in self.cromas if id_ != "orig"] if texto.endswith("instrumental") else []

    def baixar(self, id_video, pasta):
        self.baixados.append(id_video)
        if id_video.startswith("quebrado"):
            raise RuntimeError("vídeo indisponível")
        pasta.mkdir(parents=True)
        caminho = pasta / "original.wav"
        caminho.write_bytes(b"x")
        return caminho

    def cromagrama(self, caminho):
        nome = "orig" if caminho.name == "original.wav" and caminho.parent == self.tmp_path else caminho.parent.name
        return self.cromas[nome.rstrip("x")]

    def alinhar(self, entrada, saida, comparacao):
        self.alinhado = (entrada.parent.name, comparacao)
        saida.write_bytes(b"alinhado")

    def preparar(self):
        original = self.tmp_path / "original.wav"
        original.write_bytes(b"x")
        progresso = []
        versao = preparar_versao_pronta(original, self.tmp_path, "Help!", "The Beatles", 140, "orig".ljust(11, "x"),
                                        progresso.append, self.buscar, self.baixar, self.cromagrama, self.alinhar)
        return versao, progresso


def test_escolhe_a_que_bate_alinha_e_apaga_os_candidatos(tmp_path):
    original = musica()
    cenario = Cenario(tmp_path, {"orig": original, "quebrado": original, "outra": musica(semente=9),
                                 "boa": acelerada(original, 1.02)})
    versao, progresso = cenario.preparar()
    assert versao.id_video == "boa".ljust(11, "x")
    assert versao.faixa.nome == INSTRUMENTAL and versao.faixa.arquivo == "instrumental.wav"
    assert (tmp_path / "instrumental.wav").read_bytes() == b"alinhado"
    assert cenario.alinhado[0] == "boa".ljust(11, "x")
    assert versao.para_dict()["velocidade_corrigida"] == pytest.approx(2.0, abs=0.3)
    assert not (tmp_path / "candidatos").exists()
    assert progresso[0] == 0 and progresso[-1] == 1.0


def test_para_de_procurar_quando_acha_uma_excelente(tmp_path):
    original = musica()
    cenario = Cenario(tmp_path, {"orig": original, "igual": original[:, 10:], "outra": musica(semente=9)})
    versao, _ = cenario.preparar()
    assert versao.id_video == "igual".ljust(11, "x")
    assert cenario.baixados == ["igual".ljust(11, "x")]


def test_nenhuma_serviu(tmp_path):
    cenario = Cenario(tmp_path, {"orig": musica(), "outra": musica(semente=9)})
    versao, _ = cenario.preparar()
    assert versao is None
    assert not (tmp_path / "instrumental.wav").exists()
    assert not (tmp_path / "candidatos").exists()


def test_candidato_com_fade_out_mais_cedo_nao_engana_a_medida():
    original = musica()
    resultado = comparar(original, original[:, : int(original.shape[1] * 0.95)])  # acaba ~7 s antes
    assert resultado.aceitavel
    assert resultado.intercepto == pytest.approx(0, abs=QUADRO)

