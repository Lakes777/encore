import type { Capa, Faixa, Fundo, Musica, NomeModo, ResultadoBusca, Sistema, Tarefa, Verso, VersaoLetra } from './tipos.ts'

/** Erro com a mensagem que a API mandou em "detail" (já em português). */
export class ErroApi extends Error {
  readonly status: number

  constructor(status: number, mensagem: string) {
    super(mensagem)
    this.status = status
  }
}

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(caminho, {
      ...opcoes,
      headers: opcoes.body ? { 'Content-Type': 'application/json', ...opcoes.headers } : opcoes.headers,
    })
  } catch {
    throw new ErroApi(0, 'O servidor do karaokê não respondeu. Ele está rodando (python -m karaoke)?')
  }
  if (!resposta.ok) {
    let mensagem = `Erro ${resposta.status}.`
    try {
      const corpo = await resposta.json()
      // O FastAPI manda texto em "detail", ou uma lista de erros de validação
      if (typeof corpo.detail === 'string') mensagem = corpo.detail
    } catch {
      // corpo vazio ou que não é JSON: fica a mensagem com o número
    }
    throw new ErroApi(resposta.status, mensagem)
  }
  if (resposta.status === 204) return undefined as T
  return resposta.json() as Promise<T>
}

const json = (corpo: unknown) => JSON.stringify(corpo)
const daMusica = (id: string) => `/api/musicas/${encodeURIComponent(id)}`

export const api = {
  sistema: () => pedir<Sistema>('/api/sistema'),

  buscar: (texto: string, limite?: number) => {
    const parametros = new URLSearchParams({ q: texto })
    if (limite) parametros.set('limite', String(limite))
    return pedir<ResultadoBusca[]>(`/api/busca?${parametros}`)
  },

  fila: () => pedir<Tarefa[]>('/api/fila'),
  adicionarNaFila: (pedido: { id_video: string; titulo: string; artista?: string; modo?: NomeModo; duracao?: number | null }) =>
    pedir<Tarefa>('/api/fila', { method: 'POST', body: json(pedido) }),
  esquecerTarefa: (id: string) => pedir<void>(`/api/fila/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  musicas: () => pedir<Musica[]>('/api/musicas'),
  musica: (id: string) => pedir<Musica>(daMusica(id)),
  apagarMusica: (id: string) => pedir<void>(daMusica(id), { method: 'DELETE' }),

  versoesDaLetra: (id: string) => pedir<VersaoLetra[]>(`${daMusica(id)}/letras`),
  escolherLetra: (id: string, idLrclib: number) =>
    pedir<Verso[]>(`${daMusica(id)}/letra`, { method: 'PUT', body: json({ id_lrclib: idLrclib }) }),
  letra: (id: string) => pedir<Verso[]>(`${daMusica(id)}/letra`),
  apagarLetra: (id: string) => pedir<void>(`${daMusica(id)}/letra`, { method: 'DELETE' }),

  /** Volumes de 0 a 1 por arquivo da faixa (só as que mudaram); devolve todas as faixas. */
  definirVolumes: (id: string, volumes: Record<string, number>) =>
    pedir<Faixa[]>(`${daMusica(id)}/volumes`, { method: 'PUT', body: json({ volumes }) }),

  /** null = volta ao automático. */
  definirAtrasoLetra: (id: string, atraso: number | null) =>
    pedir<{ atraso: number | null }>(`${daMusica(id)}/atraso-letra`, { method: 'PUT', body: json({ atraso }) }),

  /** Envia o .zip de uma música exportada; 409 = já existe (aí pede de novo com substituir). */
  importarMusica: (arquivo: Blob, substituir = false) =>
    pedir<Musica>(`/api/musicas/importar${substituir ? '?substituir=true' : ''}`, {
      method: 'POST',
      body: arquivo,
      headers: { 'Content-Type': 'application/zip' },
    }),

  capas: (id: string) => pedir<Capa[]>(`${daMusica(id)}/capas`),
  definirFundo: (id: string, fundo: Fundo) => pedir<Fundo>(`${daMusica(id)}/fundo`, { method: 'PUT', body: json(fundo) }),
}

/** Endereço que baixa a música inteira num .zip (para levar a outro computador). */
export function urlDaExportacao(idMusica: string) {
  return `${daMusica(idMusica)}/exportar`
}

/** Endereço do arquivo de uma faixa, para usar direto no <audio src>. */
export function urlDaFaixa(idMusica: string, arquivo: string) {
  return `${daMusica(idMusica)}/faixas/${encodeURIComponent(arquivo)}`
}

/** Prévia de um vídeo da busca: o servidor repassa o áudio do YouTube em pedaços. */
export function urlDaPrevia(idVideo: string) {
  return `/api/previa/${encodeURIComponent(idVideo)}`
}
