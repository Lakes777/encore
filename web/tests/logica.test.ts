import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ErroApi, urlDaFaixa } from '../src/logica/api.ts'
import { descricaoTom, formatarDuracao, formatarEstimativa } from '../src/logica/formatar.ts'
import { lerRota, linkDaMusica } from '../src/logica/rota.ts'
import { ajustarVelocidade } from '../src/logica/velocidade.ts'
import { deslocarVersos, estimarAtraso, type TrechoDeVoz } from '../src/logica/letra.ts'

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

describe('velocidade', () => {
  it('prende entre 50% e 150% e arredonda de 5 em 5', () => {
    expect(ajustarVelocidade(0.85)).toBe(0.85)
    expect(ajustarVelocidade(0.8500000001)).toBe(0.85)
    expect(ajustarVelocidade(0.87)).toBe(0.85)
    expect(ajustarVelocidade(0.1)).toBe(0.5)
    expect(ajustarVelocidade(3)).toBe(1.5)
    expect(ajustarVelocidade(Number.NaN)).toBe(1)
  })
})

describe('atraso da letra', () => {
  const versos = (tempos: (number | null)[]) => tempos.map((tempo, i) => ({ tempo, texto: `verso ${i}` }))

  it('desloca só os versos com tempo, sem passar de zero', () => {
    expect(deslocarVersos(versos([0.2, null, 10]), -0.5).map((v) => v.tempo)).toEqual([0, null, 9.5])
    expect(deslocarVersos(versos([1]), 0)).toEqual(versos([1]))
  })

  it('acha o atraso mesmo com versos de fundo que não batem com a voz', () => {
    const tempos = [10, 14.4, 20.3, 26, 31.5, 37, 42.2, 48]
    const trechos: TrechoDeVoz[] = tempos.map((t) => [t + 0.52, t + 3])
    const comFundo = versos([...tempos, 12.1, 33.3]) // dois "(Help)" no meio dos versos
    expect(estimarAtraso(comFundo, trechos)).toBe(0.5)
  })

  it('letra certinha dá zero; letra adiantada dá negativo', () => {
    const tempos = [5, 9, 13, 17, 21]
    expect(estimarAtraso(versos(tempos), tempos.map((t) => [t + 0.03, t + 2] as const))).toBe(0)
    expect(estimarAtraso(versos(tempos), tempos.map((t) => [t - 1.2, t + 2] as const))).toBe(-1.2)
  })

  it('sem confiança (poucos versos ou nada encaixa) devolve null', () => {
    expect(estimarAtraso(versos([1, 2, 3]), [[1, 2]])).toBeNull()
    expect(estimarAtraso(versos([5, 9, 13, 17, 21]), [])).toBeNull()
    expect(estimarAtraso(versos([5, 9, 13, 17, 21]), [[50, 60], [70, 80]])).toBeNull()
  })
})
