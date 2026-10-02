import pytest

from karaoke.busca import DURACAO_PREVIA, Resultado, buscar, id_do_link, tipo_do_video


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


@pytest.mark.parametrize("titulo, canal, tipo", [
    ("Audioslave - Like a Stone (Official Video)", "AudioslaveVEVO", "clipe"),
    ("Avenged Sevenfold - Bat Country [Official Music Video]", "Avenged Sevenfold", "clipe"),
    ("Artista - Música (Clipe Oficial)", "Artista", "clipe"),
    ("Artista - Música [MV]", "Artista", "clipe"),
    ("Audioslave - Show Me How to Live (Official Audio)", "Audioslave", "audio"),
    ("Like A Stone - Audioslave (Lyrics)", "Fã", "audio"),
    ("Cochise", "Audioslave - Topic", "audio"),
    ("Help! (Official Video)", "The Beatles - Topic", "audio"),  # canal Topic vale mais que o título
    ("Banda - Música (Vídeo Oficial)", "Banda", "clipe"),
    ("Banda - Música (Video Oficial)", "Banda", "clipe"),
    ("Banda - Música (Official HD Video)", "Banda", "clipe"),
    ("Banda - Música (Official 4K Video)", "Banda", "clipe"),
    ("Banda - Música (Áudio Oficial)", "Banda", "audio"),
    ("Banda - Música (Áudio)", "Banda", "audio"),
    ("Like a Stone (Official Lyric Video)", "Audioslave", "audio"),
    ("Banda - Música (Lyrics/Letra)", "Fã", "audio"),
    ("Letra e Música (HD)", "Fã", None),  # "Letra" no nome da música não é lyric video
    ("Lyric - Canção", "Fã", None),
    ("Audioslave - Like a stone (HD)", "Fã", None),
    ("Audioslave - Like A Stone (Live 8 2005)", "Fã", "ao_vivo"),
    ("Audioslave - Like a Stone (Live on Broadway) 11-25-02", "Fã", "ao_vivo"),
    ("Audioslave - Like a Stone (Sessions @ AOL 2003)", "Audioslave", "ao_vivo"),
    ("Chris Cornell - Like a Stone Acoustic Live (Unplugged Sessions @ AOL)", "Fã", "ao_vivo"),
    ("Banda - Música (Ao Vivo)", "Banda", "ao_vivo"),
    ("Banda - Música Ao Vivo No Rock in Rio", "Banda", "ao_vivo"),
    ("Banda - Música [Acústico]", "Banda", "ao_vivo"),
    ("Banda - Música Live at Wembley", "Banda", "ao_vivo"),
    ("Like a Stone (Live)", "Audioslave - Topic", "ao_vivo"),  # disco ao vivo no canal Topic
    ("Audioslave - Show Me How to Live (Official Video)", "Audioslave", "clipe"),  # "Live" no nome da música
    ("Show Me How to Live", "Audioslave - Topic", "audio"),
    ("AudioSlave - Show Me How To Live - Live (2004)", "Fã", "ao_vivo"),
    ("Audioslave - Cochise - Live", "Fã", "ao_vivo"),
    ("Mötley Crüe - Live Wire", "Fã", None),  # "Live Wire" é nome de música
    ("The World We Live In", "The Killers - Topic", "audio"),
    ("Portugal. The Man - Live in the Moment", "Fã", None),
    ("We Live On (Official)", "Fã", None),
    ("Matheus & Kauan - Ao Vivo e a Cores", "Fã", None),
    ("Audioslave - Cochise - Live 2005", "Fã", "ao_vivo"),
    ("Banda - Música — Live", "Fã", "ao_vivo"),
    ("Banda - Música - Live!", "Fã", "ao_vivo"),
    ("Natasha - Acústico MTV", "Fã", "ao_vivo"),
    ("Banda - Canción (En Vivo)", "Fã", "ao_vivo"),
    ("Banda - Música (Acoustic)", "Fã", "ao_vivo"),
    ("Banda: NPR Music Tiny Desk Concert", "NPR Music", "ao_vivo"),
    ("Audioslave Performs Show Me How to Live | Live in Cuba | Front Row Music", "Fã", "ao_vivo"),
    ("Banda - Música - Ao Vivo", "Fã", "ao_vivo"),
    ("Videogame", "Fã", None),  # "video" só como palavra solta não é clipe
])
def test_tipo_do_video(titulo, canal, tipo):
    assert tipo_do_video(titulo, canal) == tipo


def test_busca_poe_o_audio_primeiro_e_clipes_e_ao_vivo_por_ultimo():
    def item(id_, titulo):
        return {"id": id_, "title": titulo, "channel": "Fã", "duration": 300}

    extrair = ExtratorFalso({"entries": [
        item("clipe111111", "Like a Stone (Official Video)"),
        item("hd111111111", "Like a Stone (HD)"),
        item("letra111111", "Like a Stone (Lyrics)"),
        item("vivo1111111", "Like a Stone (Live)"),
        item("hd222222222", "Like a Stone (Remastered)"),
    ]})
    ids = [r.id for r in buscar("like a stone", extrair=extrair)]
    assert ids == ["letra111111", "hd111111111", "hd222222222", "clipe111111", "vivo1111111"]


def test_para_dict_traz_o_tipo():
    assert Resultado("aaaaaaaaaaa", "Help! (Official Video)", "The Beatles", 140, None).para_dict()["tipo"] == "clipe"
