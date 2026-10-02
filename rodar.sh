#!/usr/bin/env bash
# Sobe o karaokê: ./rodar.sh -> http://localhost:8000 (Ctrl+C desliga)
#
# Compila o site antes, se ele mudou desde a última vez. As pastas e o Python podem
# ser trocados num arquivo rodar.local (fica fora do git), por exemplo:
#   KARAOKE_PYTHON=~/karaoke-teste/.venv/bin/python
#   KARAOKE_DADOS=~/karaoke-teste/e2e
#   KARAOKE_MODELOS=~/karaoke-teste/modelos
set -euo pipefail
cd "$(dirname "$0")"

[ -f rodar.local ] && source rodar.local

PYTHON="${KARAOKE_PYTHON:-.venv/bin/python}"
export KARAOKE_DADOS="${KARAOKE_DADOS:-dados}"
export KARAOKE_MODELOS="${KARAOKE_MODELOS:-modelos}"
PORTA="${PORT:-8000}"

if [ ! -x "$PYTHON" ]; then
  echo "Não achei o Python em $PYTHON."
  echo "Crie o ambiente (python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)"
  echo "ou aponte KARAOKE_PYTHON no rodar.local."
  exit 1
fi

if ss -ltn 2>/dev/null | grep -q ":$PORTA "; then
  echo "A porta $PORTA já está em uso: o karaokê já deve estar ligado em http://localhost:$PORTA"
  exit 1
fi

# Site: compila só se não existe ou se algum arquivo de web/ é mais novo que a compilação
if [ ! -f web/dist/index.html ] || [ -n "$(find web/src web/index.html -newer web/dist/index.html -print -quit)" ]; then
  echo "Compilando o site..."
  [ -d web/node_modules ] || (cd web && npm ci)
  (cd web && npm run build)
fi

# O Python do ambiente na frente do PATH: o yt-dlp e o audio-separator ficam lá
PATH="$(dirname "$PYTHON"):$PATH"
command -v node >/dev/null || command -v deno >/dev/null ||
  echo "Aviso: sem node nem deno no PATH, o YouTube pode recusar downloads (erro 403)."
echo "Karaokê em http://localhost:$PORTA (Ctrl+C para desligar; o que aparecer aqui fica também em rodar.log)"
# Mostra na tela e guarda no rodar.log (recomeça a cada vez), para ver um erro depois de fechar o
# terminal. O -i faz o tee ignorar o Ctrl+C e gravar até a última mensagem do servidor.
PYTHONUNBUFFERED=1 "$PYTHON" -m karaoke 2>&1 | tee -i rodar.log
