"""Descobre o tom e a escala (maior/menor) de uma música.

Método de Krumhansl-Schmuckler: mede quanto cada uma das 12 notas soa na
música (o "cromagrama", feito pelo librosa) e compara com o perfil típico de
cada um dos 24 tons. O tom cujo perfil mais se parece com a música vence.

A comparação é Python puro (testável sem librosa); só a leitura do áudio
usa o librosa.
"""

from karaoke.faixas import NOTAS

# Peso de cada grau da escala, a partir da tônica (Krumhansl e Kessler, 1982)
PERFIL_MAIOR = (6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
PERFIL_MENOR = (6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)


def _correlacao(a, b):
    media_a, media_b = sum(a) / len(a), sum(b) / len(b)
    da = [x - media_a for x in a]
    db = [y - media_b for y in b]
    cima = sum(x * y for x, y in zip(da, db))
    baixo = (sum(x * x for x in da) * sum(y * y for y in db)) ** 0.5
    return cima / baixo if baixo else 0.0


def tom_do_cromagrama(intensidades, perfil_maior=PERFIL_MAIOR, perfil_menor=PERFIL_MENOR):
    """Recebe a intensidade das 12 notas (C, C#, ..., B) e devolve (tom, escala)."""
    if len(intensidades) != len(NOTAS):
        raise ValueError("O cromagrama precisa ter 12 valores, um por nota.")
    if max(intensidades) == min(intensidades):
        raise ValueError("Não dá para descobrir o tom: o áudio está em silêncio ou é só ruído.")

    melhor = None
    for tonica, nota in enumerate(NOTAS):
        # Gira a música para a tônica candidata ficar na posição 0
        girado = [intensidades[(tonica + i) % 12] for i in range(12)]
        for escala, perfil in (("maior", perfil_maior), ("menor", perfil_menor)):
            pontos = _correlacao(girado, perfil)
            if melhor is None or pontos > melhor[0]:
                melhor = (pontos, nota, escala)
    return melhor[1], melhor[2]


def _cromagrama_com_librosa(caminho):
    import librosa

    audio, taxa = librosa.load(str(caminho), sr=22050, mono=True)
    # Tira a parte percussiva antes: a bateria espalha energia por todas as
    # notas e, nos testes, fazia o Help! (Lá maior) sair como Dó# menor
    harmonico = librosa.effects.harmonic(audio)
    croma = librosa.feature.chroma_cqt(y=harmonico, sr=taxa)
    return croma.mean(axis=1).tolist()


def analisar_tom(caminho, cromagrama=_cromagrama_com_librosa):
    """Lê o áudio e devolve (tom, escala), ex.: ('A', 'maior')."""
    return tom_do_cromagrama(cromagrama(caminho))
