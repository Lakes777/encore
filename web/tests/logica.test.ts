import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ErroApi, urlDaFaixa } from '../src/logica/api.ts'
import { descricaoTom, formatarDuracao, formatarEstimativa } from '../src/logica/formatar.ts'
import { lerRota, linkDaMusica } from '../src/logica/rota.ts'

describe('rota', () => {
  it('lê a tela da música pelo hash', () => {
    expect(lerRota('#/musica/989ba3f6818c')).toEqual({ tela: 'musica', id: '989ba3f6818c' })
    expect(lerRota(linkDaMusica('abcdef123456'))).toEqual({ tela: 'musica', id: 'abcdef123456' })
  })

  it('qualquer outro hash volta para o início', () => {
    for (const hash of ['', '#/', '#/musica/', '#/musica/../x', '#/musica/ABCDEF123456']) {
      expect(lerRota(hash)).toEqual({ tela: 'inicio' })
    }
  })
})

describe('formatar', () => {
  it('duração em minutos e segundos', () => {
    expect(formatarDuracao(125)).toBe('2:05')
    expect(formatarDuracao(59.9)).toBe('0:59')
    expect(formatarDuracao(null)).toBe('--:--')
  })

  it('estimativa em segundos ou minutos', () => {
    expect(formatarEstimativa(45)).toBe('~45 s')
    expect(formatarEstimativa(1300)).toBe('~22 min')
    expect(formatarEstimativa(null)).toBe('tempo desconhecido')
  })

  it('tom e escala', () => {
    expect(descricaoTom({ tom: 'A', escala: 'maior' })).toBe('A maior')
    expect(descricaoTom({ tom: null, escala: null })).toBe('tom desconhecido')
  })
})

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('manda JSON e devolve a resposta', async () => {
    const buscar = vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 201 }))
    vi.stubGlobal('fetch', buscar)
    await api.adicionarNaFila({ id_video: '2Q_ZzBGPdqE', titulo: 'Help!' })
    expect(buscar).toHaveBeenCalledWith('/api/fila', expect.objectContaining({ method: 'POST' }))
  })

  it('usa a mensagem de erro que a API mandou', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ detail: 'Música não encontrada.' }), { status: 404 }))
    await expect(api.musica('abcdef123456')).rejects.toEqual(new ErroApi(404, 'Música não encontrada.'))
  })

  it('avisa quando o servidor está desligado', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(api.musicas()).rejects.toThrow(/python -m karaoke/)
  })

  it('204 não tem corpo', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }))
    await expect(api.apagarMusica('abcdef123456')).resolves.toBeUndefined()
  })

  it('endereço da faixa', () => {
    expect(urlDaFaixa('abcdef123456', 'voz principal.wav')).toBe('/api/musicas/abcdef123456/faixas/voz%20principal.wav')
  })
})
