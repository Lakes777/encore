# Karaokê Web

[![Testes](https://github.com/Lakes777/karaoke-web/actions/workflows/testes.yml/badge.svg)](https://github.com/Lakes777/karaoke-web/actions/workflows/testes.yml)

Karaokê que roda no próprio computador: você busca uma música do YouTube, o app separa
a **voz principal**, os **vocais de apoio** e o **instrumental** com IA e mostra a
**letra sincronizada** enquanto a música toca, com um volume para cada faixa.

> **Em desenvolvimento.** A parte de trás (busca, download, separação, tom e fila) e a API já funcionam; faltam as telas.

> **Atenção:** projeto de estudo, para uso pessoal e local. Baixar áudio do YouTube vai
> contra os termos de uso da plataforma, por isso o app não é hospedado publicamente.

## Como vai funcionar

1. Buscar a música pelo nome ou colando o link do YouTube, com uma prévia curta de cada resultado.
2. Adicionar à lista: o app baixa o áudio e separa as faixas numa fila, mostrando o progresso.
3. Na lista, cada música mostra o **tom** e a **escala** (ex.: "A maior") e se já tem letra.
4. Escolher a letra entre as versões sincronizadas do [LRCLIB](https://lrclib.net) e a capa pela
   [iTunes Search API](https://performance-partners.apple.com/search-api).
5. Cantar: letra sincronizada, volume separado da voz e dos vocais de apoio, tela cheia, botão para
   tocar a original e imagem de fundo com desfoque ajustável.

## Separação com IA: o que foi medido

Teste feito antes de começar o projeto, num notebook com i5-7200U (2 núcleos) e sem GPU utilizável:

| Modelo | Etapa | Tempo para 1 min de música |
|---|---|---|
| UVR-MDX-NET-Inst_HQ_3 (leve) | voz x instrumental | ~4,5 min |
| UVR_MDXNET_KARA_2 (leve) | voz principal x apoio | ~2,4 min |
| BS-Roformer Viperx 1297 | voz x instrumental | ~47 min |
| Mel-Roformer Karaoke | voz principal x apoio | ~14 min |

Os modelos Roformer separam bem melhor, mas só são viáveis com GPU. Por isso o modelo e o
dispositivo (`cpu` ou `cuda`) vão ser configuráveis: modelo leve para desenvolver no notebook
e Roformer numa placa de vídeo (GTX 1660) para usar de verdade.

Separar a música inteira de uma vez pesa demais: um trecho de 75 s já usa 3,2 GB de RAM. Por isso
a separação vai em pedaços de 60 s, colados no fim; o pico fica em ~3,1 GB qualquer que seja a
duração. Os pedaços vão para uma pasta temporária dentro da pasta da música, no disco (no WSL o
`/tmp` fica na própria RAM).

## Como rodar

Precisa do Python 3.10+ e do [ffmpeg](https://ffmpeg.org) instalado.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m karaoke          # http://127.0.0.1:8000/docs mostra as rotas
```

Variáveis opcionais: `KARAOKE_DADOS` (pasta das músicas, padrão `dados`), `KARAOKE_MODELOS`
(pasta dos modelos de IA, padrão `modelos`; são baixados na primeira separação) e `PORT`.

| Rota | O que faz |
|---|---|
| `GET /api/sistema` | Dispositivo (`cpu`/`cuda`), modo padrão e modos disponíveis |
| `GET /api/busca?q=` | Busca pelo nome ou link; cada resultado traz o início da prévia e o tempo estimado de cada modo |
| `GET/POST /api/fila`, `DELETE /api/fila/{id}` | Fila de preparo, com estado e progresso |
| `GET /api/musicas`, `GET/DELETE /api/musicas/{id}` | Músicas prontas |
| `GET /api/musicas/{id}/faixas/{arquivo}` | Áudio de uma faixa (aceita Range, para pular na música) |
| `GET /api/musicas/{id}/letras` | Versões da letra no LRCLIB, sincronizadas e de duração parecida primeiro |
| `GET/PUT/DELETE /api/musicas/{id}/letra` | Letra escolhida, já em versos com o tempo em segundos |
| `GET /api/musicas/{id}/capas` | Capas do álbum (iTunes) para usar de fundo |
| `PUT /api/musicas/{id}/fundo` | Imagem de fundo e desfoque (0 a 40 px) |

## Testes

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt   # leve: não instala a IA
pytest
```

## Estrutura

```
karaoke/
  faixas.py      # Música como lista de faixas, cada uma com nome, arquivo e volume
  busca.py       # Busca no YouTube (yt-dlp) pelo nome ou pelo link colado
  download.py    # Baixa o áudio do vídeo em WAV
  separacao.py   # Separa voz principal, vocais de apoio e instrumental (modos Rápida e Alta)
  analise.py     # Descobre o tom e a escala
  fila.py        # Prepara as músicas em segundo plano e salva cada uma em musica.json
  biblioteca.py  # Lista, abre e apaga as músicas prontas
  letras.py      # LRCLIB, limpeza do título do YouTube e leitura do formato .lrc
  capas.py       # Capas do iTunes
  internet.py    # Pedidos às APIs públicas
  api.py         # Rotas da API (FastAPI)
  __main__.py    # python -m karaoke
tests/
  test_faixas.py
  test_busca.py  # O yt-dlp é trocado por um falso: roda sem internet
  test_download_separacao.py
  test_analise_fila.py
  test_api.py
  test_letras_capas.py
```

## Decisões técnicas

- **Letra com a duração parecida.** O LRCLIB costuma ter várias versões da mesma música (álbum,
  remaster, ao vivo). As sincronizadas cuja duração mais se aproxima do áudio baixado aparecem
  primeiro, porque duração diferente quer dizer letra fora do tempo.

- **Só no próprio computador.** O servidor escuta em 127.0.0.1 e recusa pedidos que mudam algo
  vindos de outro site (cabeçalho Origin), para uma página qualquer aberta no navegador não
  conseguir apagar músicas.

- **Tom pela parte harmônica.** Antes de comparar as notas com os perfis de cada tom, a bateria é
  retirada (`librosa.effects.harmonic`). Sem isso, o Help! (Lá maior) saía como Dó# menor.

- **Música = lista de faixas genéricas.** Nada de campos fixos "voz" e "instrumental": quando o
  app aprender a separar guitarra, baixo ou bateria, basta acrescentar faixas, sem mudar o player.
- **Dois modos de separação, escolhidos por música.** "Rápida" (modelos MDX leves) roda até na CPU de um
  notebook; "Alta" (Roformer) é bem melhor, mas pede placa de vídeo. O app detecta se há GPU NVIDIA para
  escolher o padrão e mostra o tempo estimado de cada modo, calculado a partir das medições acima.

## Próximos passos

Fase 1: karaokê
- [x] Base: música como lista de faixas, com volume e tom/escala
- [x] Busca no YouTube pelo nome ou pelo link, com o ponto de início da prévia (yt-dlp)
- [x] Baixar o áudio (yt-dlp + ffmpeg) e separar em duas etapas, nos modos Rápida e Alta, com estimativa de tempo
- [x] Tom e escala (librosa + perfis de Krumhansl, medindo só a parte harmônica)
- [x] Fila com progresso numa thread: baixar, separar e analisar, uma música por vez
- [x] Letras sincronizadas do LRCLIB (versões com duração parecida primeiro) e capas do iTunes
- [x] API (FastAPI): busca com estimativa por modo, fila, lista de músicas e faixas com Range
- [x] Separar em pedaços de 60 s: o pico de RAM fica em ~3,1 GB qualquer que seja a duração (Help! inteira, 2:19, em 9 min na CPU)
- [ ] Telas (React): busca com prévia, lista, tela da música (letra sincronizada, volumes, tela cheia, fundo com desfoque)

Fase 2: versões prontas
- [ ] Procurar primeiro a versão instrumental/karaokê oficial; separar com IA só se não houver
- [ ] Conferir a duração da versão pronta para a letra não sair do tempo

Fase 3: modo guitarra
- [ ] Backing track sem guitarra (pronta ou separada com IA) para tocar por cima

Fase 4: todos os instrumentos
- [ ] Baixo, bateria, piano e outros, cada um com seu volume
