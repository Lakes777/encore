# Karaokê Web

[![Testes](https://github.com/Lakes777/karaoke-web/actions/workflows/testes.yml/badge.svg)](https://github.com/Lakes777/karaoke-web/actions/workflows/testes.yml)

Karaokê que roda no próprio computador: você busca uma música do YouTube, o app separa
a **voz principal**, os **vocais de apoio** e o **instrumental** com IA e mostra a
**letra sincronizada** enquanto a música toca, com um volume para cada faixa.

> **Em desenvolvimento.** Por enquanto existem a base (a música como lista de faixas) e a busca no YouTube.

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

## Testes

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

## Estrutura

```
karaoke/
  faixas.py      # Música como lista de faixas, cada uma com nome, arquivo e volume
  busca.py       # Busca no YouTube (yt-dlp) pelo nome ou pelo link colado
  download.py    # Baixa o áudio do vídeo em WAV
  separacao.py   # Separa voz principal, vocais de apoio e instrumental (modos Rápida e Alta)
tests/
  test_faixas.py
  test_busca.py  # O yt-dlp é trocado por um falso: roda sem internet
  test_download_separacao.py
```

## Decisões técnicas

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
- [ ] Fila com progresso: baixar, separar e analisar o tom e a escala (librosa)
- [ ] Letras sincronizadas do LRCLIB e capas do iTunes
- [ ] API (FastAPI) e tela da música (letra sincronizada, volumes, tela cheia, fundo com desfoque)

Fase 2: versões prontas
- [ ] Procurar primeiro a versão instrumental/karaokê oficial; separar com IA só se não houver
- [ ] Conferir a duração da versão pronta para a letra não sair do tempo

Fase 3: modo guitarra
- [ ] Backing track sem guitarra (pronta ou separada com IA) para tocar por cima

Fase 4: todos os instrumentos
- [ ] Baixo, bateria, piano e outros, cada um com seu volume
