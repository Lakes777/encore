import io
import json
import zipfile

import pytest

from karaoke.biblioteca import Biblioteca
from karaoke.pacote import JaExiste, exportar, importar as importar_no, limpar_temporarios, nome_do_pacote

ID = "abcdef123456"


def musica_salva(pasta, id_musica=ID, titulo="Like a Stone", com_letra=True):
    pasta_musica = pasta / id_musica
    pasta_musica.mkdir(parents=True)
    (pasta_musica / "instrumental.wav").write_bytes(b"RIFF" + bytes(range(256)) * 50)
    (pasta_musica / "voz-principal.wav").write_bytes(b"RIFF" + b"voz" * 100)
    (pasta_musica / "segredo.txt").write_text("não é da música")
    if com_letra:
        (pasta_musica / "letra.lrc").write_text("[00:01.00]On a cobweb afternoon", encoding="utf-8")
    dados = {"id": id_musica, "titulo": titulo, "artista": "Audioslave", "tom": "G", "escala": "menor",
             "tem_letra": com_letra, "faixas": [
                 {"nome": "instrumental", "arquivo": "instrumental.wav", "volume": 1.0},
                 {"nome": "voz principal", "arquivo": "voz-principal.wav", "volume": 0.0},
             ]}
    (pasta_musica / "musica.json").write_text(json.dumps(dados), encoding="utf-8")
    return dados


def zip_da(pasta, dados):
    return b"".join(exportar(pasta / dados["id"], dados))


def zip_com(arquivos):
    """Monta um .zip na mão, com {nome: conteúdo}."""
    memoria = io.BytesIO()
    with zipfile.ZipFile(memoria, "w") as pacote:
        for nome, conteudo in arquivos.items():
            pacote.writestr(nome, conteudo)
    return memoria.getvalue()


def dados_validos(id_musica=ID, arquivo="instrumental.wav"):
    return json.dumps({"id": id_musica, "titulo": "Cochise",
                       "faixas": [{"nome": "instrumental", "arquivo": arquivo, "volume": 1.0}]})


def importar(pasta, caminho, substituir=False):
    return importar_no(Biblioteca(pasta), caminho, substituir)


def gravar(tmp_path, conteudo, nome="pacote.zip"):
    caminho = tmp_path / nome
    caminho.write_bytes(conteudo)
    return caminho


# ---------- exportar ----------


def test_exporta_so_o_que_e_da_musica(tmp_path):
    dados = musica_salva(tmp_path / "pc")
    with zipfile.ZipFile(io.BytesIO(zip_da(tmp_path / "pc", dados))) as pacote:
        assert sorted(pacote.namelist()) == ["instrumental.wav", "letra.lrc", "musica.json", "voz-principal.wav"]
        assert pacote.testzip() is None
        # WAV quase não encolhe: vai sem compressão
        assert pacote.getinfo("instrumental.wav").compress_type == zipfile.ZIP_STORED


def test_exporta_sem_letra(tmp_path):
    dados = musica_salva(tmp_path / "pc", com_letra=False)
    with zipfile.ZipFile(io.BytesIO(zip_da(tmp_path / "pc", dados))) as pacote:
        assert "letra.lrc" not in pacote.namelist()


def test_nome_do_pacote_sem_acentos_nem_simbolos():
    assert nome_do_pacote({"titulo": "Avenged Sevenfold - Bat Country [Official]"}) == \
        "Avenged-Sevenfold-Bat-Country-Official.karaoke.zip"
    assert nome_do_pacote({"titulo": "Canção ao luar"}) == "Cancao-ao-luar.karaoke.zip"
    assert nome_do_pacote({"titulo": "???"}) == "musica.karaoke.zip"


# ---------- importar ----------


def test_exportar_e_importar_em_outro_computador_traz_a_musica_igual(tmp_path):
    dados = musica_salva(tmp_path / "pc")
    caminho = gravar(tmp_path, zip_da(tmp_path / "pc", dados))
    assert importar(tmp_path / "notebook", caminho) == dados
    assert json.loads((tmp_path / "notebook" / ID / "musica.json").read_text()) == dados
    for nome in ("instrumental.wav", "voz-principal.wav", "letra.lrc"):
        assert (tmp_path / "notebook" / ID / nome).read_bytes() == (tmp_path / "pc" / ID / nome).read_bytes()
    assert not (tmp_path / "notebook" / ID / "segredo.txt").exists()


def test_id_repetido_pergunta_antes_e_substitui_se_pedir(tmp_path):
    musica_salva(tmp_path / "notebook", titulo="Versão antiga")
    (tmp_path / "notebook" / ID / "sobra.wav").write_bytes(b"x")
    dados = musica_salva(tmp_path / "pc", titulo="Versão nova")
    caminho = gravar(tmp_path, zip_da(tmp_path / "pc", dados))

    with pytest.raises(JaExiste) as erro:
        importar(tmp_path / "notebook", caminho)
    assert erro.value.titulo == "Versão antiga"

    importar(tmp_path / "notebook", caminho, substituir=True)
    assert json.loads((tmp_path / "notebook" / ID / "musica.json").read_text())["titulo"] == "Versão nova"
    assert not (tmp_path / "notebook" / ID / "sobra.wav").exists()  # a pasta antiga sai inteira


def test_arquivo_a_mais_no_zip_fica_de_fora(tmp_path):
    caminho = gravar(tmp_path, zip_com({"musica.json": dados_validos(), "instrumental.wav": b"RIFF",
                                        "virus.exe": b"MZ"}))
    importar(tmp_path / "dados", caminho)
    assert sorted(p.name for p in (tmp_path / "dados" / ID).iterdir()) == ["instrumental.wav", "musica.json"]


@pytest.mark.parametrize("arquivos, mensagem", [
    ({"instrumental.wav": b"RIFF"}, "falta o musica.json"),
    ({"musica.json": "{não é json", "instrumental.wav": b"RIFF"}, "estragado"),
    ({"musica.json": json.dumps({"id": ID, "faixas": []})}, "estragado"),  # sem título
    ({"musica.json": dados_validos("../../etc"), "instrumental.wav": b"RIFF"}, "id inválido"),
    ({"musica.json": dados_validos("ABCDEF123456"), "instrumental.wav": b"RIFF"}, "id inválido"),
    ({"musica.json": dados_validos()}, "Falta a faixa instrumental.wav"),
    ({"musica.json": dados_validos(arquivo="../fora.wav")}, "nome inválido"),
    ({"musica.json": dados_validos(arquivo="musica.json")}, "nome inválido"),
    ({"musica.json": dados_validos(), "instrumental.wav": b"RIFF", "../fora.wav": b"x"}, "nome inválido"),
    ({"musica.json": dados_validos(), "instrumental.wav": b"RIFF", "pasta/dentro.wav": b"x"}, "nome inválido"),
    ({"musica.json": dados_validos(), "instrumental.wav": b"RIFF", "/raiz.wav": b"x"}, "nome inválido"),
])
def test_recusa_pacote_que_nao_serve(tmp_path, arquivos, mensagem):
    caminho = gravar(tmp_path, zip_com(arquivos))
    with pytest.raises(ValueError, match=mensagem):
        importar(tmp_path / "dados", caminho)
    assert not (tmp_path / "dados").exists() or not any((tmp_path / "dados").iterdir())


def test_recusa_o_que_nao_e_zip(tmp_path):
    with pytest.raises(ValueError, match="não é um .zip"):
        importar(tmp_path / "dados", gravar(tmp_path, b"isto nao e um zip"))


def test_zip_corrompido_nao_deixa_nada_pela_metade(tmp_path):
    dados = musica_salva(tmp_path / "pc")
    conteudo = bytearray(zip_da(tmp_path / "pc", dados))
    posicao = conteudo.index(bytes(range(256)))  # estraga um byte no meio da faixa
    conteudo[posicao + 10] ^= 0xFF
    with pytest.raises(ValueError, match="corrompido"):
        importar(tmp_path / "notebook", gravar(tmp_path, bytes(conteudo)))
    assert list((tmp_path / "notebook").iterdir()) == []


def test_recusa_pacote_grande_demais(tmp_path, monkeypatch):
    monkeypatch.setattr("karaoke.pacote.TAMANHO_MAXIMO", 10)
    caminho = gravar(tmp_path, zip_com({"musica.json": dados_validos(), "instrumental.wav": b"RIFF" * 10}))
    with pytest.raises(ValueError, match="grande demais"):
        importar(tmp_path / "dados", caminho)


def test_substituir_tira_a_antiga_mesmo_com_arquivo_novo_dentro(tmp_path):
    """Um .tmp de gravação na pasta antiga (ex.: salvando o volume) não atrapalha a troca."""
    musica_salva(tmp_path / "notebook", titulo="Antiga")
    (tmp_path / "notebook" / ID / ".musica.json.abc.tmp").write_text("{}")
    dados = musica_salva(tmp_path / "pc", titulo="Nova")
    importar(tmp_path / "notebook", gravar(tmp_path, zip_da(tmp_path / "pc", dados)), substituir=True)
    assert sorted(p.name for p in (tmp_path / "notebook").iterdir()) == [ID]
    assert json.loads((tmp_path / "notebook" / ID / "musica.json").read_text())["titulo"] == "Nova"


def test_duas_importacoes_iguais_ao_mesmo_tempo_a_segunda_pergunta(tmp_path):
    dados = musica_salva(tmp_path / "pc")
    caminho = gravar(tmp_path, zip_da(tmp_path / "pc", dados))

    class OutraChegaPrimeiro(Biblioteca):
        """Na hora da troca, a outra importação já terminou."""

        def colocar_pasta(self, id_musica, pasta_nova, substituir=False):
            importar(self.pasta, caminho)
            return super().colocar_pasta(id_musica, pasta_nova, substituir)

    with pytest.raises(JaExiste) as erro:
        importar_no(OutraChegaPrimeiro(tmp_path / "notebook"), caminho)
    assert erro.value.titulo == "Like a Stone"
    assert sorted(p.name for p in (tmp_path / "notebook").iterdir()) == [ID]  # sem temporária sobrando


def test_ja_existe_com_musica_json_estragado_ainda_pergunta(tmp_path):
    (tmp_path / "notebook" / ID).mkdir(parents=True)
    (tmp_path / "notebook" / ID / "musica.json").write_text("{estragado")
    dados = musica_salva(tmp_path / "pc")
    with pytest.raises(JaExiste) as erro:
        importar(tmp_path / "notebook", gravar(tmp_path, zip_da(tmp_path / "pc", dados)))
    assert erro.value.titulo == ""


def test_recusa_musica_json_grande_demais(tmp_path, monkeypatch):
    monkeypatch.setattr("karaoke.pacote.TAMANHO_MAXIMO_TEXTO", 10)
    with pytest.raises(ValueError, match="grande demais"):
        importar(tmp_path / "dados", gravar(tmp_path, zip_com({"musica.json": dados_validos(),
                                                               "instrumental.wav": b"RIFF"})))


def com_ajustes(**ajustes):
    dados = json.loads(dados_validos())
    dados.update(ajustes)
    return zip_com({"musica.json": json.dumps(dados), "instrumental.wav": b"RIFF"})


@pytest.mark.parametrize("ajustes, ficam", [
    ({"fundo": {"url": "https://capa.jpg", "desfoque": 12}, "atraso_letra": -1.5}, {"fundo", "atraso_letra"}),
    ({"fundo": {"url": None, "desfoque": 0}}, {"fundo"}),
    ({"fundo": {"url": "http://capa.jpg", "desfoque": 12}}, set()),
    ({"fundo": {"url": 'https://x.jpg") ; background: url("x', "desfoque": 12}}, set()),
    ({"fundo": {"url": "https://capa.jpg", "desfoque": 99}}, set()),
    ({"fundo": "https://capa.jpg"}, set()),
    ({"atraso_letra": 9999}, set()),
    ({"atraso_letra": "1"}, set()),
])
def test_ajustes_invalidos_ficam_de_fora(tmp_path, ajustes, ficam):
    dados = importar(tmp_path / "dados", gravar(tmp_path, com_ajustes(**ajustes)))
    salvos = json.loads((tmp_path / "dados" / ID / "musica.json").read_text())
    assert {"fundo", "atraso_letra"} & set(salvos) == ficam
    assert salvos == dados


def test_volume_fora_do_intervalo_e_recusado(tmp_path):
    dados = json.loads(dados_validos())
    dados["faixas"][0]["volume"] = 5
    with pytest.raises(ValueError, match="estragado"):
        importar(tmp_path / "dados", gravar(tmp_path, zip_com({"musica.json": json.dumps(dados),
                                                               "instrumental.wav": b"RIFF"})))


def test_limpa_as_sobras_de_uma_importacao_interrompida(tmp_path):
    musica_salva(tmp_path)
    (tmp_path / ".importando-abc").mkdir()
    (tmp_path / ".importando-abc" / "instrumental.wav").write_bytes(b"x")
    (tmp_path / ".importando-def.zip").write_bytes(b"x")
    (tmp_path / ".apagando-ghi").mkdir()
    limpar_temporarios(tmp_path)
    assert sorted(p.name for p in tmp_path.iterdir()) == [ID]
    limpar_temporarios(tmp_path / "nao-existe")  # sem pasta ainda: nada a fazer
