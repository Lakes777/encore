import json

import pytest

from karaoke.faixas import INSTRUMENTAL, VOCAIS_DE_APOIO, VOZ_PRINCIPAL, Faixa, Musica


def musica_de_karaoke():
    return Musica(
        titulo="Help!",
        artista="The Beatles",
        tom="A",
        escala="maior",
        faixas=[
            Faixa(VOZ_PRINCIPAL, "voz.wav"),
            Faixa(VOCAIS_DE_APOIO, "apoio.wav"),
            Faixa(INSTRUMENTAL, "instrumental.wav"),
        ],
    )


def test_faixa_comeca_no_volume_maximo():
    assert Faixa("guitarra", "guitarra.wav").volume == 1.0


@pytest.mark.parametrize("volume", [-0.1, 1.5, "alto", None, True])
def test_faixa_recusa_volume_invalido(volume):
    with pytest.raises(ValueError):
        Faixa("baixo", "baixo.wav", volume)


def test_faixa_precisa_de_nome():
    with pytest.raises(ValueError):
        Faixa("   ", "x.wav")


def test_procura_faixa_sem_diferenciar_maiusculas():
    musica = musica_de_karaoke()
    assert musica.faixa("Voz Principal").arquivo == "voz.wav"


def test_procurar_faixa_que_nao_existe_da_erro():
    with pytest.raises(KeyError):
        musica_de_karaoke().faixa("guitarra")


def test_aceita_faixas_novas_alem_do_karaoke():
    musica = musica_de_karaoke()
    musica.adicionar_faixa(Faixa("guitarra", "guitarra.wav"))
    assert [f.nome for f in musica.faixas][-1] == "guitarra"


def test_nao_aceita_duas_faixas_com_o_mesmo_nome():
    musica = musica_de_karaoke()
    with pytest.raises(ValueError):
        musica.adicionar_faixa(Faixa("INSTRUMENTAL", "outro.wav"))


def test_nao_aceita_nome_repetido_ja_na_criacao():
    with pytest.raises(ValueError):
        Musica("X", faixas=[Faixa("voz", "a.wav"), Faixa("voz", "b.wav")])


def test_muda_o_volume_de_uma_faixa_so():
    musica = musica_de_karaoke()
    musica.mudar_volume(VOZ_PRINCIPAL, 0.2)
    assert musica.faixa(VOZ_PRINCIPAL).volume == 0.2
    assert musica.faixa(INSTRUMENTAL).volume == 1.0


def test_mudar_volume_recusa_valor_fora_da_faixa():
    with pytest.raises(ValueError):
        musica_de_karaoke().mudar_volume(INSTRUMENTAL, 2)


def test_descricao_do_tom():
    assert musica_de_karaoke().descricao_tom() == "A maior"
    assert Musica("Sem análise").descricao_tom() == "tom desconhecido"


@pytest.mark.parametrize(
    "tom, escala",
    [("A", None), (None, "menor"), ("H", "maior"), ("A", "dórica")],
)
def test_recusa_tom_ou_escala_invalidos(tom, escala):
    with pytest.raises(ValueError):
        Musica("X", tom=tom, escala=escala)


def test_ida_e_volta_pelo_json():
    musica = musica_de_karaoke()
    musica.mudar_volume(VOCAIS_DE_APOIO, 0.5)
    texto = json.dumps(musica.para_dict())
    assert Musica.de_dict(json.loads(texto)) == musica


def test_de_dict_aceita_musica_ainda_sem_faixas():
    musica = Musica.de_dict({"titulo": "Recém-adicionada"})
    assert musica.faixas == []
    assert musica.tem_letra is False
