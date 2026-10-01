import pytest
from fastapi.testclient import TestClient

from karaoke.api import criar_app
from karaoke.biblioteca import Biblioteca
from karaoke.capas import buscar_capas
from karaoke.fila import Fila
from karaoke.letras import baixar_letra, buscar_versoes, ler_lrc, limpar_titulo
from tests.test_api import ID_MUSICA, musica_salva

LRC_HELP = "[ar: The Beatles]\n[00:01.08] Help!\n[00:02.13] I need somebody\n"


def item_lrclib(id_, duracao, sincronizada=True, instrumental=False):
    return {"id": id_, "trackName": "Help!", "artistName": "The Beatles", "albumName": "Help!",
            "duration": duracao, "instrumental": instrumental,
            "syncedLyrics": LRC_HELP if sincronizada else None, "plainLyrics": "Help!\nI need somebody"}


class InternetFalsa:
    """Responde pelo endereço e anota os pedidos."""

    def __init__(self, respostas):
        self.respostas = respostas
        self.pedidos = []

    def __call__(self, url, parametros=None):
        self.pedidos.append((url, parametros))
        resposta = self.respostas.get(url)
        if isinstance(resposta, list) and resposta and isinstance(resposta[0], list):
            return resposta.pop(0)  # várias respostas seguidas para o mesmo endereço
        if isinstance(resposta, Exception):
            raise resposta
        return resposta


# ---------- título ----------


@pytest.mark.parametrize("titulo, artista, esperado", [
    ("Help! (Remastered 2009)", "The Beatles", ("Help!", "The Beatles")),
    ("The Beatles - Help! (Remastered 2015)", "The Beatles", ("Help!", "The Beatles")),
    ("The Beatles - The Beatles - Help! (Remastered 2015)", "The Beatles", ("Help!", "The Beatles")),
    ("Coldplay - Yellow (Official Video)", "", ("Yellow", "Coldplay")),
    ("Yellow [4K]", "Coldplay", ("Yellow", "Coldplay")),
    ("Stayin' Alive (Audio)", "Bee Gees", ("Stayin' Alive", "Bee Gees")),
    ("Help! (Takes 1-3)", "The Beatles", ("Help! (Takes 1-3)", "The Beatles")),
    ("Help! - Live at Shea", "The Beatles", ("Help! - Live at Shea", "The Beatles")),
])
def test_limpa_o_titulo_do_youtube(titulo, artista, esperado):
    assert limpar_titulo(titulo, artista) == esperado


def test_nao_confunde_alive_com_live():
    assert limpar_titulo("Alive (Alive)", "Pearl Jam") == ("Alive (Alive)", "Pearl Jam")


# ---------- LRCLIB ----------


def test_versoes_sincronizadas_e_de_duracao_parecida_vem_primeiro():
    internet = InternetFalsa({"https://lrclib.net/api/search": [
        item_lrclib(1, 200.0), item_lrclib(2, 141.0, sincronizada=False), item_lrclib(3, 139.0),
        item_lrclib(4, 150.0), item_lrclib(5, 139.0, instrumental=True),
    ]})
    versoes = buscar_versoes("The Beatles - Help! (Remastered)", "The Beatles", 140, internet)
    assert [v.id for v in versoes] == [3, 4, 1, 2]  # instrumental fica de fora
    assert internet.pedidos[0][1] == {"track_name": "Help!", "artist_name": "The Beatles"}
    assert versoes[0].para_dict(140)["diferenca"] == 1.0


def test_sem_resultado_tenta_uma_busca_mais_solta():
    internet = InternetFalsa({"https://lrclib.net/api/search": [[], [item_lrclib(7, 139.0)]]})
    versoes = buscar_versoes("Help!", "The Beatles", None, internet)
    assert [v.id for v in versoes] == [7]
    assert internet.pedidos[1][1] == {"q": "The Beatles Help!"}


def test_busca_de_letra_precisa_de_titulo():
    with pytest.raises(ValueError):
        buscar_versoes("(Official Video)", "", None, InternetFalsa({}))


def test_baixa_a_letra_sincronizada_ou_a_simples():
    assert baixar_letra(1, InternetFalsa({"https://lrclib.net/api/get/1": item_lrclib(1, 1)})) == LRC_HELP
    simples = item_lrclib(2, 1, sincronizada=False)
    assert baixar_letra(2, InternetFalsa({"https://lrclib.net/api/get/2": simples})).startswith("Help!")
    with pytest.raises(ValueError):
        baixar_letra(3, InternetFalsa({"https://lrclib.net/api/get/3": {"id": 3}}))


# ---------- formato .lrc ----------


def test_le_os_versos_em_segundos_e_ignora_as_etiquetas():
    assert ler_lrc(LRC_HELP) == [{"tempo": 1.08, "texto": "Help!"}, {"tempo": 2.13, "texto": "I need somebody"}]


def test_verso_com_varios_tempos_aparece_em_cada_um_e_tudo_fica_em_ordem():
    versos = ler_lrc("[00:30.00][01:10.50] Refrão\n[00:10.00] Começo\n[1:05] Sem centésimos")
    assert [(v["tempo"], v["texto"]) for v in versos] == [
        (10.0, "Começo"), (30.0, "Refrão"), (65.0, "Sem centésimos"), (70.5, "Refrão")]


def test_offset_adianta_a_letra_sem_ficar_negativo():
    versos = ler_lrc("[offset:+500]\n[00:00.20] Primeiro\n[00:02.00] Segundo")
    assert [v["tempo"] for v in versos] == [0.0, 1.5]


def test_verso_vazio_vira_pausa():
    assert ler_lrc("[00:05.00] Oi\n[00:09.00]")[1] == {"tempo": 9.0, "texto": ""}


def test_letra_sem_tempo_volta_sem_tempo():
    assert ler_lrc("Help!\nI need somebody") == [{"tempo": None, "texto": "Help!"},
                                                 {"tempo": None, "texto": "I need somebody"}]


# ---------- iTunes ----------


def test_capas_em_tamanho_grande_e_sem_repetir():
    pequena = "https://is1.mzstatic.com/image/x/100x100bb.jpg"
    internet = InternetFalsa({"https://itunes.apple.com/search": {"results": [
        {"collectionName": "Help!", "artistName": "The Beatles", "artworkUrl100": pequena},
        {"collectionName": "Help! (outra faixa)", "artworkUrl100": pequena},
        {"collectionName": "Sem capa"},
    ]}})
    capas = buscar_capas("Help! (Remastered 2009)", "The Beatles", pedir=internet)
    assert capas == [{"album": "Help!", "artista": "The Beatles",
                      "url": "https://is1.mzstatic.com/image/x/1200x1200bb.jpg"}]
    assert internet.pedidos[0][1]["term"] == "The Beatles Help!"


# ---------- biblioteca ----------


def test_salvar_letra_marca_a_musica(tmp_path):
    musica_salva(tmp_path)
    biblioteca = Biblioteca(tmp_path)
    biblioteca.salvar_letra(ID_MUSICA, LRC_HELP, 31647304)
    dados = biblioteca.obter(ID_MUSICA)
    assert (dados["tem_letra"], dados["letra_sincronizada"], dados["letra_id"]) == (True, True, 31647304)
    assert biblioteca.letra(ID_MUSICA)[0]["texto"] == "Help!"

    biblioteca.apagar_letra(ID_MUSICA)
    assert biblioteca.obter(ID_MUSICA)["tem_letra"] is False
    with pytest.raises(KeyError):
        biblioteca.letra(ID_MUSICA)


def test_letra_vazia_nao_e_salva(tmp_path):
    musica_salva(tmp_path)
    with pytest.raises(ValueError):
        Biblioteca(tmp_path).salvar_letra(ID_MUSICA, "[ar: ninguém]\n", 1)
    assert Biblioteca(tmp_path).obter(ID_MUSICA)["tem_letra"] is False


@pytest.mark.parametrize("url, desfoque", [("http://inseguro.com/a.jpg", 10), ("javascript:alert(1)", 10),
                                           (None, -1), (None, 41), (None, True)])
def test_fundo_invalido_e_recusado(tmp_path, url, desfoque):
    musica_salva(tmp_path)
    with pytest.raises(ValueError):
        Biblioteca(tmp_path).definir_fundo(ID_MUSICA, url, desfoque)


# ---------- rotas ----------


def cliente(pasta, respostas):
    internet = InternetFalsa(respostas)
    return TestClient(criar_app(pasta, Fila(pasta), dispositivo="cpu", pedir=internet)), internet


def test_rotas_de_letra(tmp_path):
    musica_salva(tmp_path)
    api, internet = cliente(tmp_path, {
        "https://lrclib.net/api/search": [item_lrclib(9, 139.0)],
        "https://lrclib.net/api/get/9": item_lrclib(9, 139.0),
    })
    assert api.get(f"/api/musicas/{ID_MUSICA}/letra").status_code == 404
    assert [v["id"] for v in api.get(f"/api/musicas/{ID_MUSICA}/letras").json()] == [9]

    versos = api.put(f"/api/musicas/{ID_MUSICA}/letra", json={"id_lrclib": 9}).json()
    assert versos[0] == {"tempo": 1.08, "texto": "Help!"}
    assert api.get(f"/api/musicas/{ID_MUSICA}").json()["tem_letra"] is True
    assert api.get(f"/api/musicas/{ID_MUSICA}/letra").json() == versos

    assert api.delete(f"/api/musicas/{ID_MUSICA}/letra").status_code == 204
    assert api.get(f"/api/musicas/{ID_MUSICA}").json()["tem_letra"] is False


def test_lrclib_fora_do_ar_da_502(tmp_path):
    musica_salva(tmp_path)
    api, _ = cliente(tmp_path, {"https://lrclib.net/api/search": TimeoutError("lento")})
    resposta = api.get(f"/api/musicas/{ID_MUSICA}/letras")
    assert resposta.status_code == 502
    assert "LRCLIB" in resposta.json()["detail"]


def test_rotas_de_capa_e_fundo(tmp_path):
    musica_salva(tmp_path)
    api, _ = cliente(tmp_path, {"https://itunes.apple.com/search": {"results": [
        {"collectionName": "Help!", "artworkUrl100": "https://capa/100x100bb.jpg"}]}})
    capa = api.get(f"/api/musicas/{ID_MUSICA}/capas").json()[0]["url"]
    assert api.put(f"/api/musicas/{ID_MUSICA}/fundo", json={"url": capa, "desfoque": 20}).json() == {
        "url": capa, "desfoque": 20}
    assert api.get(f"/api/musicas/{ID_MUSICA}").json()["fundo"]["desfoque"] == 20
    assert api.put(f"/api/musicas/{ID_MUSICA}/fundo", json={"url": "http://x/a.jpg"}).status_code == 422
    assert api.put(f"/api/musicas/{ID_MUSICA}/fundo", json={"desfoque": 99}).status_code == 422


def test_rotas_de_musica_inexistente_dao_404(tmp_path):
    api, _ = cliente(tmp_path, {})
    for metodo, caminho, corpo in [("get", "letras", None), ("put", "letra", {"id_lrclib": 1}),
                                   ("get", "capas", None), ("put", "fundo", {"url": None})]:
        resposta = getattr(api, metodo)(f"/api/musicas/{ID_MUSICA}/{caminho}", **({"json": corpo} if corpo else {}))
        assert resposta.status_code == 404
