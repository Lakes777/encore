import json

import numpy as np
import pytest

from karaoke import ritmo
from karaoke.ritmo import (
    QUADRO,
    TAXA,
    analisar_ritmo,
    completar_musica,
    completar_pasta,
    energia_db,
    limiar_da_voz,
    ritmo_das_batidas,
    tempo_plausivel,
    trechos_com_voz,
    trechos_da_energia,
)

# ---------- sinais sintéticos ----------


def seno(segundos, amplitude=0.5, frequencia=220.0):
    t = np.arange(int(segundos * TAXA)) / TAXA
    return amplitude * np.sin(2 * np.pi * frequencia * t)


def silencio(segundos):
    return np.zeros(int(segundos * TAXA))


def com_vazamento(audio, db=-60.0):
    """Ruído baixinho por baixo de tudo, como o que sobra na faixa separada."""
    ruido = np.random.default_rng(0).normal(0, 10 ** (db / 20), len(audio))
    return audio + ruido


def perto(trechos, esperado, tolerancia=0.06):
    """Os trechos batem com os esperados, com folga de ~2 quadros nas bordas."""
    return len(trechos) == len(esperado) and all(
        abs(a - ea) <= tolerancia and abs(b - eb) <= tolerancia for (a, b), (ea, eb) in zip(trechos, esperado))


# ---------- energia ----------


def test_energia_do_seno_e_do_silencio():
    db = energia_db(np.concatenate([seno(1.0, amplitude=1.0), silencio(1.0)]))
    assert len(db) == 1 + int(2.0 * TAXA) // 512
    meio_do_seno = db[int(0.5 / QUADRO)]
    assert meio_do_seno == pytest.approx(-3.01, abs=0.1)  # RMS de um seno = amplitude / raiz de 2
    assert db[int(1.5 / QUADRO)] == -100.0  # silêncio digital tem piso, não -infinito


def test_energia_de_audio_vazio():
    assert len(energia_db([])) == 0
    assert trechos_da_energia([]) == []


# ---------- trechos com voz ----------


def test_acha_as_palavras_separadas_por_pausas():
    audio = com_vazamento(np.concatenate([
        silencio(0.5), seno(1.0), silencio(0.4), seno(0.6), silencio(0.3), seno(0.5), silencio(0.5),
    ]))
    trechos = trechos_da_energia(energia_db(audio))
    assert perto(trechos, [[0.5, 1.5], [1.9, 2.5], [2.8, 3.3]]), trechos


def test_buraco_curto_entre_silabas_nao_corta_o_trecho():
    audio = com_vazamento(np.concatenate([silencio(0.5), seno(0.5), silencio(0.08), seno(0.5), silencio(0.5)]))
    assert perto(trechos_da_energia(energia_db(audio)), [[0.5, 1.58]])


def test_estalo_curto_e_descartado():
    audio = com_vazamento(np.concatenate([silencio(0.5), seno(1.0), silencio(1.0), seno(0.02), silencio(0.5)]))
    assert perto(trechos_da_energia(energia_db(audio)), [[0.5, 1.5]])


def test_voz_fraca_conta_mas_o_vazamento_nao():
    # Uma palavra 12 dB mais baixa ainda é voz; o vazamento a -60 dB fica de fora
    fraca = 0.5 * 10 ** (-12 / 20)
    audio = com_vazamento(np.concatenate([silencio(0.5), seno(1.0), silencio(0.5), seno(0.5, fraca), silencio(0.5)]))
    trechos = trechos_da_energia(energia_db(audio))
    assert perto(trechos, [[0.5, 1.5], [2.0, 2.5]]), trechos


def test_respiracao_bem_abaixo_do_canto_nao_conta():
    # Faixa limpa (sem vazamento): o limiar vem do pico, e um som 30 dB abaixo fica de fora
    respiracao = 0.5 * 10 ** (-30 / 20)
    audio = np.concatenate([silencio(0.5), seno(1.0), silencio(0.3), seno(0.4, respiracao), silencio(0.3), seno(1.0)])
    trechos = trechos_da_energia(energia_db(audio))
    assert perto(trechos, [[0.5, 1.5], [2.5, 3.5]]), trechos


def test_limiar_respeita_o_fundo_e_o_pico():
    fundo_alto = np.array([-50.0] * 50 + [-15.0] * 50)  # vazamento forte: fundo + 15 manda
    assert limiar_da_voz(fundo_alto) == pytest.approx(-35.0)
    fundo_mudo = np.array([-100.0] * 50 + [-15.0] * 50)  # silêncio total: pico - 20 manda
    assert limiar_da_voz(fundo_mudo) == pytest.approx(-35.0)


def test_voz_do_comeco_ao_fim_vira_um_trecho_so():
    # Sem silêncio nenhum o "fundo" é a própria voz; nem por isso tudo some
    assert perto(trechos_da_energia(energia_db(seno(2.0))), [[0.0, 2.0]], tolerancia=0.01)


def test_silencio_ou_chiado_nao_tem_voz():
    assert trechos_da_energia(energia_db(silencio(2.0))) == []
    assert trechos_da_energia(energia_db(com_vazamento(silencio(2.0), db=-70))) == []


def test_trechos_vem_em_segundos_com_3_casas():
    trechos = trechos_da_energia(energia_db(com_vazamento(np.concatenate([silencio(0.3), seno(0.7), silencio(0.3)]))))
    assert all(isinstance(t, float) and round(t, 3) == t for trecho in trechos for t in trecho)


def test_trechos_com_voz_le_o_arquivo_pedido():
    lidos = []
    audio = com_vazamento(np.concatenate([silencio(0.5), seno(1.0), silencio(0.5)]))
    trechos = trechos_com_voz("voz-principal.wav", ler=lambda caminho: lidos.append(caminho) or audio)
    assert lidos == ["voz-principal.wav"]
    assert perto(trechos, [[0.5, 1.5]])


# ---------- ritmo ----------


def cliques(bpm, segundos, sobra=0.0, tremor=0.0):
    """Instantes de um clique periódico, como o detector de batidas devolveria."""
    intervalo = 60 / bpm
    instantes = np.arange(sobra, segundos, intervalo)
    return instantes + np.random.default_rng(1).uniform(-tremor, tremor, len(instantes))


def test_bpm_do_clique_periodico():
    resultado = ritmo_das_batidas(cliques(95, 30, sobra=0.4))
    assert resultado["bpm"] == pytest.approx(95.0, abs=0.2)
    assert resultado["batidas"][0] == 0.4
    assert len(resultado["batidas"]) == 47  # 0,4 s + 46 intervalos de 0,63 s


def test_bpm_aguenta_tremor_e_batida_perdida():
    batidas = list(cliques(120, 20, tremor=0.01))
    del batidas[10]  # o detector pulou uma batida
    batidas.insert(5, batidas[4] + 0.2)  # e achou uma a mais
    assert ritmo_das_batidas(batidas)["bpm"] == pytest.approx(120.0, abs=2)


def test_batidas_com_3_casas():
    resultado = ritmo_das_batidas([0.12345, 0.75, 1.3759])
    assert resultado["batidas"] == [0.123, 0.75, 1.376]


@pytest.mark.parametrize("batidas", [[], [1.5], [1.0, 1.0]])
def test_sem_batidas_nao_tem_bpm(batidas):
    assert ritmo_das_batidas(batidas) == {"bpm": None, "batidas": []}


def test_andamento_rapido_demais_vale_a_metade():
    assert tempo_plausivel(198.7) == pytest.approx(99.35)
    assert tempo_plausivel(400.0) == pytest.approx(100.0)
    assert tempo_plausivel(95.7) == 95.7
    assert tempo_plausivel(180.0) == 180.0


def test_analisar_ritmo_le_o_arquivo_pedido():
    lidos = []
    resultado = analisar_ritmo("instrumental.wav", batidas=lambda c: lidos.append(c) or [0.5, 1.0, 1.5])
    assert lidos == ["instrumental.wav"]
    assert resultado == {"bpm": 120.0, "batidas": [0.5, 1.0, 1.5]}


def test_librosa_acha_o_clique_de_verdade():
    pytest.importorskip("librosa")  # o CI não instala o librosa
    audio = np.zeros(20 * TAXA)
    for instante in cliques(100, 19.5, sobra=0.3):
        inicio = int(instante * TAXA)
        audio[inicio:inicio + 200] = np.hanning(400)[200:]  # um "tique" que decai rápido
    resultado = ritmo_das_batidas(ritmo._batidas_do_audio(audio))
    assert resultado["bpm"] == pytest.approx(100, abs=3)


# ---------- comando para as músicas que já existem ----------

FAIXAS_SEPARADAS = [
    {"nome": "voz principal", "arquivo": "voz-principal.wav", "volume": 1.0},
    {"nome": "instrumental", "arquivo": "instrumental.wav", "volume": 1.0},
    {"nome": "original", "arquivo": "original.wav", "volume": 0.0},
]
FAIXAS_VERSAO_PRONTA = [
    {"nome": "instrumental", "arquivo": "instrumental.wav", "volume": 1.0},
    {"nome": "original", "arquivo": "original.wav", "volume": 0.0},
]


def criar_musica(pasta_dados, id_musica, titulo, faixas, **extras):
    pasta = pasta_dados / id_musica
    pasta.mkdir(parents=True)
    dados = {"titulo": titulo, "artista": "The Beatles", "tom": "A", "escala": "maior", "faixas": faixas,
             "id": id_musica} | extras
    (pasta / "musica.json").write_text(json.dumps(dados), encoding="utf-8")
    return pasta


def ler(pasta):
    return json.loads((pasta / "musica.json").read_text(encoding="utf-8"))


class Analises:
    """Falsos que anotam os arquivos lidos."""

    def __init__(self):
        self.lidos = []

    def ritmo(self, caminho):
        self.lidos.append(caminho.name)
        return {"bpm": 95.7, "batidas": [0.5, 1.127]}

    def voz(self, caminho):
        self.lidos.append(caminho.name)
        return [[1.0, 2.5]]


def test_completa_musica_separada(tmp_path):
    pasta = criar_musica(tmp_path, "aaaaaaaaaaaa", "Help!", FAIXAS_SEPARADAS)
    analises = Analises()
    dados, feito, erros = completar_musica(pasta, ritmo=analises.ritmo, voz=analises.voz)
    assert analises.lidos == ["instrumental.wav", "voz-principal.wav"]
    assert erros == []
    gravado = ler(pasta)
    assert gravado == dados
    assert (gravado["bpm"], gravado["batidas"], gravado["trechos_voz"]) == (95.7, [0.5, 1.127], [[1.0, 2.5]])
    assert gravado["tom"] == "A"  # o resto continua lá
    assert not list(pasta.glob(".*.tmp"))


def test_versao_pronta_so_ganha_o_ritmo(tmp_path):
    pasta = criar_musica(tmp_path, "aaaaaaaaaaaa", "Yellow", FAIXAS_VERSAO_PRONTA, modo="pronta")
    analises = Analises()
    completar_musica(pasta, ritmo=analises.ritmo, voz=analises.voz)
    assert analises.lidos == ["instrumental.wav"]
    assert "trechos_voz" not in ler(pasta)


def test_nao_recalcula_o_que_ja_tem_a_nao_ser_com_refazer(tmp_path):
    pasta = criar_musica(tmp_path, "aaaaaaaaaaaa", "Help!", FAIXAS_SEPARADAS, bpm=None, batidas=[],
                         trechos_voz=[[0.0, 1.0]])
    analises = Analises()
    _, feito, _ = completar_musica(pasta, ritmo=analises.ritmo, voz=analises.voz)
    assert (analises.lidos, feito) == ([], [])

    completar_musica(pasta, refazer=True, ritmo=analises.ritmo, voz=analises.voz)
    assert analises.lidos == ["instrumental.wav", "voz-principal.wav"]
    assert ler(pasta)["trechos_voz"] == [[1.0, 2.5]]


def test_so_calcula_a_parte_que_falta(tmp_path):
    pasta = criar_musica(tmp_path, "aaaaaaaaaaaa", "Help!", FAIXAS_SEPARADAS, bpm=95.7, batidas=[0.5])
    analises = Analises()
    completar_musica(pasta, ritmo=analises.ritmo, voz=analises.voz)
    assert analises.lidos == ["voz-principal.wav"]


def test_falha_numa_analise_grava_a_outra(tmp_path):
    pasta = criar_musica(tmp_path, "aaaaaaaaaaaa", "Help!", FAIXAS_SEPARADAS)

    def ritmo_quebrado(caminho):
        raise RuntimeError("arquivo estragado")

    _, feito, erros = completar_musica(pasta, ritmo=ritmo_quebrado, voz=Analises().voz)
    assert erros == ["ritmo: arquivo estragado"]
    assert "bpm" not in ler(pasta)
    assert ler(pasta)["trechos_voz"] == [[1.0, 2.5]]


def test_nao_perde_o_que_o_servidor_gravou_durante_a_analise(tmp_path):
    pasta = criar_musica(tmp_path, "aaaaaaaaaaaa", "Help!", FAIXAS_SEPARADAS)

    def voz_demorada(caminho):
        # Enquanto analisa, o usuário mexe no volume pelo site
        dados = ler(pasta)
        dados["faixas"][0]["volume"] = 0.3
        (pasta / "musica.json").write_text(json.dumps(dados), encoding="utf-8")
        return [[1.0, 2.5]]

    completar_musica(pasta, ritmo=Analises().ritmo, voz=voz_demorada)
    gravado = ler(pasta)
    assert gravado["faixas"][0]["volume"] == 0.3
    assert gravado["trechos_voz"] == [[1.0, 2.5]]


def test_comando_percorre_a_pasta_e_escreve_uma_linha_por_musica(tmp_path):
    criar_musica(tmp_path, "aaaaaaaaaaaa", "Help!", FAIXAS_SEPARADAS)
    criar_musica(tmp_path, "bbbbbbbbbbbb", "Yellow", FAIXAS_VERSAO_PRONTA)
    criar_musica(tmp_path, "cccccccccccc", "Her Majesty", FAIXAS_SEPARADAS, bpm=99.4, batidas=[], trechos_voz=[])
    quebrada = tmp_path / "dddddddddddd"
    quebrada.mkdir()
    (quebrada / "musica.json").write_text("{pela metade", encoding="utf-8")
    (tmp_path / "temporarios").mkdir()  # pasta sem musica.json é ignorada

    linhas = []
    analises = Analises()
    falhas = completar_pasta(tmp_path, ritmo=analises.ritmo, voz=analises.voz, escrever=linhas.append)

    assert falhas == 1
    assert linhas[0] == "aaaaaaaaaaaa Help!: 95.7 BPM, 2 batidas; 1 trechos com voz"
    assert linhas[1] == "bbbbbbbbbbbb Yellow: 95.7 BPM, 2 batidas"
    assert linhas[2] == "cccccccccccc Her Majesty: já tinha tudo"
    assert linhas[3].startswith("dddddddddddd ?: ERRO")
    assert len(linhas) == 4


def test_main_usa_as_analises_e_aceita_refazer(tmp_path, monkeypatch, capsys):
    pasta = criar_musica(tmp_path, "aaaaaaaaaaaa", "Help!", FAIXAS_SEPARADAS, bpm=1.0, batidas=[])
    analises = Analises()
    monkeypatch.setattr(ritmo, "analisar_ritmo", analises.ritmo)
    monkeypatch.setattr(ritmo, "trechos_com_voz", analises.voz)

    assert ritmo.main([str(tmp_path), "--refazer"]) == 0
    assert ler(pasta)["bpm"] == 95.7
    assert "aaaaaaaaaaaa Help!" in capsys.readouterr().out


def test_main_recusa_pasta_que_nao_existe(tmp_path):
    with pytest.raises(SystemExit):
        ritmo.main([str(tmp_path / "nada")])
