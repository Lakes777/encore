import json
import threading

import pytest

from karaoke.analise import PERFIL_MAIOR, PERFIL_MENOR, analisar_tom, tom_do_cromagrama
from karaoke.faixas import INSTRUMENTAL, NOTAS, VOCAIS_DE_APOIO, VOZ_PRINCIPAL, Faixa, Musica
from karaoke.fila import ERRO, NA_FILA, PRONTA, Fila

# ---------- tom e escala ----------


def cromagrama_do_tom(nota, perfil):
    """Cromagrama "ideal" de uma música no tom pedido: o perfil girado."""
    tonica = NOTAS.index(nota)
    return [perfil[(i - tonica) % 12] for i in range(12)]


@pytest.mark.parametrize("nota", NOTAS)
@pytest.mark.parametrize("escala, perfil", [("maior", PERFIL_MAIOR), ("menor", PERFIL_MENOR)])
def test_reconhece_os_24_tons(nota, escala, perfil):
    assert tom_do_cromagrama(cromagrama_do_tom(nota, perfil)) == (nota, escala)


def test_acorde_de_la_maior_puxa_para_la_maior():
    # Só as notas da escala de Lá maior, com destaque para Lá, Dó# e Mi
    croma = [0.1] * 12
    for nota, forca in {"A": 1.0, "C#": 0.8, "E": 0.9, "B": 0.4, "D": 0.4, "F#": 0.4, "G#": 0.3}.items():
        croma[NOTAS.index(nota)] = forca
    assert tom_do_cromagrama(croma) == ("A", "maior")


def test_cromagrama_precisa_de_12_notas():
    with pytest.raises(ValueError, match="12"):
        tom_do_cromagrama([1.0] * 11)


def test_silencio_nao_tem_tom():
    with pytest.raises(ValueError, match="silêncio"):
        tom_do_cromagrama([0.0] * 12)


def test_analisar_tom_le_o_arquivo_pedido():
    lidos = []
    resultado = analisar_tom("instrumental.wav", lambda c: lidos.append(c) or cromagrama_do_tom("E", PERFIL_MENOR))
    assert resultado == ("E", "menor")
    assert lidos == ["instrumental.wav"]


# ---------- fila ----------


def baixar_falso(id_video, pasta, ao_progredir):
    pasta.mkdir(parents=True, exist_ok=True)
    ao_progredir(1.0)
    (pasta / "original.wav").write_bytes(b"x")
    return pasta / "original.wav"


def separar_falso(audio, pasta, modo, pasta_modelos, ao_mudar_etapa):
    ao_mudar_etapa(1, 2)
    ao_mudar_etapa(2, 2)
    return [Faixa(VOZ_PRINCIPAL, "voz-principal.wav"), Faixa(VOCAIS_DE_APOIO, "vocais-de-apoio.wav"),
            Faixa(INSTRUMENTAL, "instrumental.wav")]


def fila_falsa(tmp_path, **troca):
    partes = {"baixar": baixar_falso, "separar": separar_falso, "analisar": lambda caminho: ("A", "maior")}
    return Fila(tmp_path, **(partes | troca))


def test_musica_entra_na_fila_esperando(tmp_path):
    fila = fila_falsa(tmp_path)
    tarefa = fila.adicionar("2Q_ZzBGPdqE", " Help! ", "The Beatles", duracao=140)
    assert [(t.titulo, t.estado, t.progresso) for t in fila.tarefas()] == [("Help!", NA_FILA, 0.0)]
    assert tarefa.modo == "rapido"


def test_recusa_modo_desconhecido(tmp_path):
    with pytest.raises(ValueError):
        fila_falsa(tmp_path).adicionar("2Q_ZzBGPdqE", "Help!", modo="ultra")


def test_prepara_e_salva_a_musica(tmp_path):
    fila = fila_falsa(tmp_path)
    tarefa = fila.adicionar("2Q_ZzBGPdqE", "Help!", "The Beatles", modo="qualidade", duracao=140)
    assert fila.processar_proxima() is True

    pronta = fila.tarefas()[0]
    assert (pronta.estado, pronta.progresso, pronta.erro) == (PRONTA, 1.0, None)

    dados = json.loads((tmp_path / tarefa.id / "musica.json").read_text(encoding="utf-8"))
    assert dados["id_video"] == "2Q_ZzBGPdqE"
    assert dados["modo"] == "qualidade"
    musica = Musica.de_dict(dados)
    assert musica.descricao_tom() == "A maior"
    assert [f.nome for f in musica.faixas] == [VOZ_PRINCIPAL, VOCAIS_DE_APOIO, INSTRUMENTAL, "original"]
    assert musica.faixa("original").volume == 0.0  # começa mudo: o karaokê usa as faixas separadas


def test_analisa_o_tom_pelo_instrumental(tmp_path):
    analisados = []
    fila = fila_falsa(tmp_path, analisar=lambda caminho: analisados.append(caminho.name) or ("C", "menor"))
    fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()
    assert analisados == ["instrumental.wav"]


def test_progresso_so_avanca(tmp_path):
    vistos = []

    def separar_espiando(audio, pasta, modo, pasta_modelos, ao_mudar_etapa):
        for numero in (1, 2):
            ao_mudar_etapa(numero, 2)
            vistos.append(fila.tarefas()[0].progresso)
        return separar_falso(audio, pasta, modo, pasta_modelos, lambda n, t: None)

    fila = fila_falsa(tmp_path, separar=separar_espiando)
    fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()
    assert vistos == sorted(vistos) and 0 < vistos[0] < vistos[1] < 1


def test_erro_vira_mensagem_apaga_a_pasta_e_a_fila_segue(tmp_path):
    def separar_quebrado(*args):
        raise RuntimeError("sem memória")

    fila = fila_falsa(tmp_path, separar=separar_quebrado)
    primeira = fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.adicionar("N4KvafPbauw", "Yellow")
    fila.processar_proxima()
    fila.processar_proxima()

    estados = [(t.estado, t.erro) for t in fila.tarefas()]
    assert estados[0] == (ERRO, "sem memória")
    assert estados[1][0] == ERRO
    assert not (tmp_path / primeira.id).exists()


def test_fila_vazia_nao_faz_nada(tmp_path):
    assert fila_falsa(tmp_path).processar_proxima() is False


def test_esquecer_tira_da_lista(tmp_path):
    fila = fila_falsa(tmp_path)
    tarefa = fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()
    fila.esquecer(tarefa.id)
    assert fila.tarefas() == []
    with pytest.raises(KeyError):
        fila.esquecer(tarefa.id)


def test_nao_esquece_a_musica_que_esta_sendo_preparada(tmp_path):
    def separar_que_tenta_esquecer(audio, pasta, modo, pasta_modelos, ao_mudar_etapa):
        with pytest.raises(ValueError, match="espere"):
            fila.esquecer(fila.tarefas()[0].id)
        return separar_falso(audio, pasta, modo, pasta_modelos, ao_mudar_etapa)

    fila = fila_falsa(tmp_path, separar=separar_que_tenta_esquecer)
    fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()
    assert fila.tarefas()[0].estado == PRONTA


def test_thread_em_segundo_plano_prepara_as_musicas(tmp_path):
    terminou = threading.Event()
    fila = fila_falsa(tmp_path, analisar=lambda caminho: terminou.set() or ("A", "maior"))
    fila.iniciar()
    fila.adicionar("2Q_ZzBGPdqE", "Help!")
    assert terminou.wait(timeout=5)
    for _ in range(100):  # o estado PRONTA é gravado logo depois de analisar
        if fila.tarefas()[0].estado == PRONTA:
            break
        threading.Event().wait(0.01)
    assert fila.tarefas()[0].estado == PRONTA
