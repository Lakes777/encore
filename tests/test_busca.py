import pytest

from karaoke.busca import DURACAO_PREVIA, Resultado, buscar, id_do_link


def video(id_="dQw4w9WgXcQ", titulo="Help! (Remastered 2009)", duracao=140):
    return {"id": id_, "title": titulo, "channel": "The Beatles", "duration": duracao,
            "thumbnails": [{"url": "pequena.jpg"}, {"url": "grande.jpg"}]}


class ExtratorFalso:
    """Faz o papel do yt-dlp e anota o que foi pedido."""

    def __init__(self, resposta):
        self.resposta = resposta
        self.pedidos = []

    def __call__(self, alvo):
        self.pedidos.append(alvo)
        return self.resposta


@pytest.mark.parametrize("link", [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "youtube.com/watch?v=dQw4w9WgXcQ",
    "https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=2",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    "  https://youtu.be/dQw4w9WgXcQ  ",
])
def test_reconhece_links_do_youtube(link):
    assert id_do_link(link) == "dQw4w9WgXcQ"


@pytest.mark.parametrize("texto", [
    "beatles help",
    "https://vimeo.com/123456",
    "https://www.youtube.com/watch?v=curto",
    "https://www.youtube.com/@thebeatles",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
])
def test_nao_confunde_outros_textos_com_link(texto):
    assert id_do_link(texto) is None


def test_busca_pelo_nome_pede_a_quantidade_certa():
    extrator = ExtratorFalso({"entries": [video("aaaaaaaaaaa"), video("bbbbbbbbbbb")]})
    resultados = buscar("  beatles help ", limite=2, extrair=extrator)
    assert extrator.pedidos == ["ytsearch2:beatles help"]
    assert [r.id for r in resultados] == ["aaaaaaaaaaa", "bbbbbbbbbbb"]


def test_link_colado_busca_so_aquele_video_sem_a_playlist():
    extrator = ExtratorFalso(video())
    resultados = buscar("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123", extrair=extrator)
    assert extrator.pedidos == ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]
    assert len(resultados) == 1
    assert resultados[0].url == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def test_resultado_usa_a_maior_miniatura_e_o_canal():
    resultado = buscar("help", extrair=ExtratorFalso({"entries": [video()]}))[0]
    assert resultado.miniatura == "grande.jpg"
    assert resultado.canal == "The Beatles"
    assert resultado.duracao == 140


def test_resultado_sem_dados_opcionais_nao_quebra():
    resultados = buscar("help", extrair=ExtratorFalso({"entries": [{"id": "aaaaaaaaaaa"}, None, {"title": "sem id"}]}))
    assert len(resultados) == 1
    assert resultados[0].titulo == "(sem título)"
    assert resultados[0].duracao is None
    assert resultados[0].miniatura is None


def test_busca_sem_resultados_devolve_lista_vazia():
    assert buscar("xyz", extrair=ExtratorFalso({"entries": []})) == []
    assert buscar("xyz", extrair=ExtratorFalso(None)) == []


@pytest.mark.parametrize("texto", ["", "   "])
def test_recusa_busca_vazia(texto):
    with pytest.raises(ValueError):
        buscar(texto, extrair=ExtratorFalso({}))


@pytest.mark.parametrize("limite", [0, 21])
def test_recusa_limite_fora_do_intervalo(limite):
    with pytest.raises(ValueError):
        buscar("help", limite=limite, extrair=ExtratorFalso({}))


@pytest.mark.parametrize("duracao, inicio", [
    (240, 80),     # um terço da música
    (30, 10),
    (20, 5),       # não deixa a prévia passar do fim
    (DURACAO_PREVIA, 0),
    (None, 0),     # duração desconhecida: começa do início
])
def test_inicio_da_previa(duracao, inicio):
    assert Resultado("aaaaaaaaaaa", "t", "c", duracao, None).inicio_previa() == inicio


def test_para_dict_traz_url_e_inicio_da_previa():
    dados = Resultado("aaaaaaaaaaa", "Help!", "The Beatles", 240, None).para_dict()
    assert dados["url"] == "https://www.youtube.com/watch?v=aaaaaaaaaaa"
    assert dados["inicio_previa"] == 80
