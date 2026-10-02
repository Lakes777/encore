import json
import threading

import pytest

from karaoke.analise import PERFIL_MAIOR, PERFIL_MENOR, analisar_tom, tom_do_cromagrama
from karaoke.cancelamento import Cancelada
from karaoke.faixas import INSTRUMENTAL, NOTAS, VOCAIS_DE_APOIO, VOZ_PRINCIPAL, Faixa, Musica
from karaoke.fila import CANCELANDO, ERRO, NA_FILA, PRONTA, Fila
from karaoke.versoes import MODO_PRONTA, Comparacao, VersaoPronta

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


def separar_falso(audio, pasta, modo, pasta_modelos, ao_mudar_etapa, verificar=None):
    ao_mudar_etapa(1, 2)
    ao_mudar_etapa(2, 2)
    return [Faixa(VOZ_PRINCIPAL, "voz-principal.wav"), Faixa(VOCAIS_DE_APOIO, "vocais-de-apoio.wav"),
            Faixa(INSTRUMENTAL, "instrumental.wav")]


RITMO_FALSO = {"bpm": 95.7, "batidas": [0.673, 1.347, 1.974]}
TRECHOS_FALSOS = [[0.697, 1.091], [1.788, 3.692]]


def fila_falsa(tmp_path, **troca):
    partes = {"baixar": baixar_falso, "separar": separar_falso, "analisar": lambda caminho: ("A", "maior"),
              "ritmo": lambda caminho: RITMO_FALSO, "voz": lambda caminho: TRECHOS_FALSOS}
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


def test_salva_ritmo_do_instrumental_e_trechos_da_voz_principal(tmp_path):
    lidos = []
    fila = fila_falsa(tmp_path, ritmo=lambda caminho: lidos.append(caminho.name) or RITMO_FALSO,
                      voz=lambda caminho: lidos.append(caminho.name) or TRECHOS_FALSOS)
    tarefa = fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()

    assert lidos == ["instrumental.wav", "voz-principal.wav"]
    dados = json.loads((tmp_path / tarefa.id / "musica.json").read_text(encoding="utf-8"))
    assert dados["bpm"] == 95.7
    assert dados["batidas"] == [0.673, 1.347, 1.974]
    assert dados["trechos_voz"] == [[0.697, 1.091], [1.788, 3.692]]
    assert Musica.de_dict(dados).descricao_tom() == "A maior"  # os campos novos não atrapalham a leitura


@pytest.mark.parametrize("quebra", ["ritmo", "voz"])
def test_falha_nas_analises_extras_nao_derruba_a_musica(tmp_path, quebra):
    def quebrado(caminho):
        raise RuntimeError("librosa não instalado")

    fila = fila_falsa(tmp_path, **{quebra: quebrado})
    tarefa = fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()

    assert (fila.tarefas()[0].estado, fila.tarefas()[0].erro) == (PRONTA, None)
    dados = json.loads((tmp_path / tarefa.id / "musica.json").read_text(encoding="utf-8"))
    assert (dados["tom"], dados["escala"]) == ("A", "maior")
    if quebra == "ritmo":
        assert "bpm" not in dados and "batidas" not in dados  # ausente: o comando completa depois
        assert dados["trechos_voz"] == TRECHOS_FALSOS
    else:
        assert "trechos_voz" not in dados
        assert dados["bpm"] == 95.7


def test_sem_batidas_grava_bpm_vazio(tmp_path):
    fila = fila_falsa(tmp_path, ritmo=lambda caminho: {"bpm": None, "batidas": []})
    tarefa = fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()
    dados = json.loads((tmp_path / tarefa.id / "musica.json").read_text(encoding="utf-8"))
    assert (dados["bpm"], dados["batidas"]) == (None, [])


def test_cancelar_durante_as_analises_extras_apaga_a_musica(tmp_path):
    fila = fila_falsa(tmp_path, voz=lambda caminho: fila.esquecer(tarefa.id) or TRECHOS_FALSOS)
    tarefa = fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()
    assert fila.tarefas() == []
    assert not (tmp_path / tarefa.id).exists()


def test_cancelada_no_ritmo_para_antes_de_medir_a_voz(tmp_path):
    def ritmo_cancelado(caminho):
        fila.esquecer(tarefa.id)
        raise Cancelada()

    fila = fila_falsa(tmp_path, ritmo=ritmo_cancelado, voz=lambda caminho: pytest.fail("não devia medir a voz"))
    tarefa = fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()
    assert fila.tarefas() == []


def test_progresso_so_avanca(tmp_path):
    vistos = []

    def separar_espiando(audio, pasta, modo, pasta_modelos, ao_mudar_etapa, verificar=None):
        for numero in (1, 2):
            ao_mudar_etapa(numero, 2)
            vistos.append(fila.tarefas()[0].progresso)
        return separar_falso(audio, pasta, modo, pasta_modelos, lambda n, t: None)

    fila = fila_falsa(tmp_path, separar=separar_espiando)
    fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()
    assert vistos == sorted(vistos) and 0 < vistos[0] < vistos[1] < 1


def test_erro_vira_mensagem_apaga_a_pasta_e_a_fila_segue(tmp_path):
    def separar_quebrado(*args, **kwargs):
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


def test_cancelar_durante_a_separacao_apaga_tudo_e_a_fila_segue(tmp_path):
    estados = []

    def separar_cancelado(audio, pasta, modo, pasta_modelos, ao_mudar_etapa, verificar=None):
        ao_mudar_etapa(1, 2)
        fila.esquecer(fila.tarefas()[0].id)
        fila.esquecer(fila.tarefas()[0].id)  # pedir de novo não muda nada
        estados.append(fila.tarefas()[0].estado)
        verificar()  # a separação de verdade confere a cada meio segundo
        pytest.fail("devia ter parado no verificar()")

    fila = fila_falsa(tmp_path, separar=separar_cancelado)
    primeira = fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.adicionar("N4KvafPbauw", "Yellow")
    fila.processar_proxima()
    assert estados == [CANCELANDO]
    assert [t.titulo for t in fila.tarefas()] == ["Yellow"]
    assert not (tmp_path / primeira.id).exists()

    fila._separar = separar_falso
    fila.processar_proxima()
    assert fila.tarefas()[0].estado == PRONTA


def test_cancelar_durante_o_download_nao_separa(tmp_path):
    def baixar_cancelado(id_video, pasta, ao_progredir):
        pasta.mkdir(parents=True)
        fila.esquecer(fila.tarefas()[0].id)
        ao_progredir(0.5)
        pytest.fail("o aviso de progresso devia ter parado o download")

    fila = fila_falsa(tmp_path, baixar=baixar_cancelado, separar=lambda *args, **kwargs: pytest.fail("separou"))
    tarefa = fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()
    assert fila.tarefas() == []
    assert not (tmp_path / tarefa.id).exists()


def test_cancelar_durante_a_procura_nao_cai_na_separacao(tmp_path):
    def preparar_cancelado(original, pasta, titulo, artista, duracao, id_video, ao_progredir):
        fila.esquecer(fila.tarefas()[0].id)
        ao_progredir(0.3)

    fila = fila_falsa(tmp_path, preparar_versao=preparar_cancelado,
                      separar=lambda *args, **kwargs: pytest.fail("cancelada não é procura que falhou"))
    fila.adicionar("2Q_ZzBGPdqE", "Help!", modo=MODO_PRONTA)
    fila.processar_proxima()
    assert fila.tarefas() == []


def test_cancelar_durante_a_analise_apaga_a_musica_quase_pronta(tmp_path):
    fila = fila_falsa(tmp_path, analisar=lambda caminho: fila.esquecer(tarefa.id) or ("A", "maior"))
    tarefa = fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()
    assert fila.tarefas() == []
    assert not (tmp_path / tarefa.id).exists()


def test_falha_enquanto_cancelava_some_em_vez_de_virar_erro(tmp_path):
    def separar_que_quebra(audio, pasta, modo, pasta_modelos, ao_mudar_etapa, verificar=None):
        fila.esquecer(fila.tarefas()[0].id)
        raise RuntimeError("processo encerrado")

    fila = fila_falsa(tmp_path, separar=separar_que_quebra)
    fila.adicionar("2Q_ZzBGPdqE", "Help!")
    fila.processar_proxima()
    assert fila.tarefas() == []


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


# ---------- versão pronta ----------


def versao_falsa(achou=True):
    def preparar(original, pasta, titulo, artista, duracao, id_video, ao_progredir):
        preparar.pedido = (titulo, artista, duracao, id_video)
        ao_progredir(0.5)
        ao_progredir(1.0)
        if not achou:
            return None
        (pasta / "instrumental.wav").write_bytes(b"x")
        return VersaoPronta(Faixa(INSTRUMENTAL, "instrumental.wav"), "7-4qKAseIXQ", "Yellow (official instrumental)",
                            "ColdplayInstrumental", Comparacao(0.015, -0.4, 0.97, 0.09))
    return preparar


def test_versao_pronta_vira_o_instrumental_sem_separar(tmp_path):
    fila = fila_falsa(tmp_path, preparar_versao=versao_falsa(),
                      separar=lambda *args, **kwargs: pytest.fail("não devia separar com IA"))
    tarefa = fila.adicionar("yKNxeF4KMsY", "Yellow", "Coldplay", modo=MODO_PRONTA, duracao=269)
    fila.processar_proxima()

    assert fila.tarefas()[0].estado == PRONTA
    dados = json.loads((tmp_path / tarefa.id / "musica.json").read_text(encoding="utf-8"))
    assert dados["modo"] == MODO_PRONTA
    assert [f["nome"] for f in dados["faixas"]] == [INSTRUMENTAL, "original"]
    assert dados["versao_pronta"]["id_video"] == "7-4qKAseIXQ"
    assert dados["versao_pronta"]["velocidade_corrigida"] == 1.5
    assert "aviso" not in dados
    assert dados["bpm"] == 95.7
    assert "trechos_voz" not in dados  # a versão pronta não tem a voz sozinha


def test_sem_versao_pronta_separa_com_o_modo_reserva_e_avisa(tmp_path):
    modos = []

    def separar(audio, pasta, modo, pasta_modelos, ao_mudar_etapa, verificar=None):
        modos.append(modo)
        return separar_falso(audio, pasta, modo, pasta_modelos, ao_mudar_etapa)

    fila = fila_falsa(tmp_path, preparar_versao=versao_falsa(achou=False), separar=separar, modo_reserva="qualidade")
    tarefa = fila.adicionar("yKNxeF4KMsY", "Yellow", "Coldplay", modo=MODO_PRONTA)
    fila.processar_proxima()

    pronta = fila.tarefas()[0]
    assert pronta.estado == PRONTA
    assert pronta.aviso == "Nenhuma versão pronta serviu; separada com IA (modo Alta)."
    assert modos == ["qualidade"]
    dados = json.loads((tmp_path / tarefa.id / "musica.json").read_text(encoding="utf-8"))
    assert dados["modo"] == "qualidade"
    assert dados["aviso"] == pronta.aviso
    assert len(dados["faixas"]) == 4


def test_progresso_so_avanca_mesmo_quando_cai_na_separacao(tmp_path):
    vistos = []
    fila = None

    def preparar(*args):
        versao_falsa(achou=False)(*args[:6], lambda fracao: (args[6](fracao), vistos.append(fila.tarefas()[0].progresso)))

    def separar(audio, pasta, modo, pasta_modelos, ao_mudar_etapa, verificar=None):
        for numero in (1, 2):
            ao_mudar_etapa(numero, 2)
            vistos.append(fila.tarefas()[0].progresso)
        return separar_falso(audio, pasta, modo, pasta_modelos, lambda n, t: None)

    fila = fila_falsa(tmp_path, preparar_versao=preparar, separar=separar)
    fila.adicionar("yKNxeF4KMsY", "Yellow", modo=MODO_PRONTA)
    fila.processar_proxima()
    assert vistos == sorted(vistos) and 0 < vistos[0] and vistos[-1] < 1
    assert fila.tarefas()[0].estado == PRONTA


def test_procura_com_os_dados_da_musica(tmp_path):
    preparar = versao_falsa()
    fila = fila_falsa(tmp_path, preparar_versao=preparar)
    fila.adicionar("yKNxeF4KMsY", "Yellow", "Coldplay", modo=MODO_PRONTA, duracao=269)
    fila.processar_proxima()
    assert preparar.pedido == ("Yellow", "Coldplay", 269, "yKNxeF4KMsY")


def test_procura_que_falha_cai_na_separacao(tmp_path):
    def preparar_quebrado(*args):
        raise OSError("YouTube recusou a busca")

    fila = fila_falsa(tmp_path, preparar_versao=preparar_quebrado)
    tarefa = fila.adicionar("yKNxeF4KMsY", "Yellow", modo=MODO_PRONTA)
    fila.processar_proxima()
    pronta = fila.tarefas()[0]
    assert (pronta.estado, pronta.erro) == (PRONTA, None)
    assert pronta.aviso == "A procura da versão pronta falhou; separada com IA (modo Rápida)."
    assert (tmp_path / tarefa.id / "original.wav").exists()


def test_modo_reserva_precisa_existir(tmp_path):
    with pytest.raises(ValueError):
        fila_falsa(tmp_path, modo_reserva="pronta")
