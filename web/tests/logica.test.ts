import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ErroApi, urlDaFaixa } from '../src/logica/api.ts'
import { descricaoTom, formatarAtraso, formatarDuracao, formatarEstimativa } from '../src/logica/formatar.ts'
import { lerRota, linkDaMusica } from '../src/logica/rota.ts'
import { ajustarVelocidade } from '../src/logica/velocidade.ts'
import { batidasParaAgendar } from '../src/logica/metronomo.ts'
import { preenchimento, silabas, tempoDasPalavras } from '../src/logica/palavras.ts'
import { deslocarVersos, estimarAtraso, indiceDoVersoAtual, type TrechoDeVoz } from '../src/logica/letra.ts'

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

  it('atraso negativo grande junta os primeiros versos no zero sem quebrar o verso atual', () => {
    const deslocados = deslocarVersos(versos([1, 2, 6]), -3)
    expect(deslocados.map((v) => v.tempo)).toEqual([0, 0, 3])
    expect(indiceDoVersoAtual(deslocados, 0.5)).toBe(1) // dois no mesmo tempo: fica o último
    expect(indiceDoVersoAtual(deslocados, 3)).toBe(2)
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

describe('metrônomo', () => {
  const batidas = [0.5, 1.1, 1.7, 2.3, 2.9]

  it('agenda só as batidas da janela, uma vez cada', () => {
    const primeiro = batidasParaAgendar(batidas, 1.0, 0.15, -1)
    expect(primeiro.agendar.map((a) => a.indice)).toEqual([1])
    expect(primeiro.agendar[0].daquiA).toBeCloseTo(0.1)
    expect(batidasParaAgendar(batidas, 1.05, 0.15, primeiro.proxima).agendar).toEqual([]) // já agendada
    expect(batidasParaAgendar(batidas, 1.6, 0.15, primeiro.proxima).agendar.map((a) => a.indice)).toEqual([2])
  })

  it('pulo para trás ou para frente recomeça da batida seguinte', () => {
    expect(batidasParaAgendar(batidas, 0.4, 0.15, 4).agendar.map((a) => a.indice)).toEqual([0])
    expect(batidasParaAgendar(batidas, 2.8, 0.15, 1).agendar.map((a) => a.indice)).toEqual([4])
  })

  it('no fim da música não agenda nada', () => {
    expect(batidasParaAgendar(batidas, 3.5, 0.15, -1)).toEqual({ agendar: [], proxima: 5, pulou: false })
    expect(batidasParaAgendar([], 1, 0.15, -1)).toEqual({ agendar: [], proxima: 0, pulou: false })
  })

  it('avisa do pulo só quando já tinha agendado alguma coisa', () => {
    expect(batidasParaAgendar(batidas, 0.4, 0.15, 4).pulou).toBe(true)
    expect(batidasParaAgendar(batidas, 1.0, 0.15, -1).pulou).toBe(false) // começo: nada agendado ainda
    expect(batidasParaAgendar(batidas, 1.6, 0.15, 2).pulou).toBe(false) // seguindo normalmente
  })
})

describe('palavra que acende', () => {
  it('conta as sílabas pelos grupos de vogais (aproximado: o "e" mudo do inglês conta)', () => {
    expect(['Help!', 'nobody', 'somebody', 'não', 'coração', '(Help)', '...'].map(silabas)).toEqual([1, 3, 4, 1, 3, 1, 1])
  })

  it('divide o tempo de voz pelas sílabas e pula o buraco sem voz', () => {
    // "I need nobody": 1 + 1 + 3 sílabas; voz de 10 a 11 e de 12 a 13,5 (pausa no meio)
    const palavras = tempoDasPalavras('I need nobody', 10, 15, [[9, 11], [12, 13.5], [14.98, 15.5]])
    expect(palavras.map((p) => p.texto)).toEqual(['I', 'need', 'nobody'])
    expect(palavras[0].inicio).toBeCloseTo(10)
    expect(palavras[0].fim).toBeCloseTo(10.5) // 2,5 s de voz no verso: 1/5 = 0,5 s
    expect(palavras[1].inicio).toBeCloseTo(10.5)
    expect(palavras[1].fim).toBeCloseTo(11)
    expect(palavras[2].inicio).toBeCloseTo(12) // começa quando a voz volta, não no buraco
    expect(palavras[2].fim).toBeCloseTo(13.5) // o pedacinho de 0,02 s no fim é ruído
  })

  it('sem voz medida no verso usa o ritmo médio, sem passar do próximo verso', () => {
    const palavras = tempoDasPalavras('Help me', 5, 20, [])
    expect(palavras[0].inicio).toBeCloseTo(5)
    expect(palavras[1].fim).toBeCloseTo(5.56) // 2 sílabas x 0,28 s
    expect(tempoDasPalavras('Help me', 5, 5.3, [])[1].fim).toBeCloseTo(5.3)
    expect(tempoDasPalavras('Help me', 5, null, [[5, 6]])[1].fim).toBeCloseTo(5.56) // último verso
    expect(tempoDasPalavras('   ', 5, 6, [])).toEqual([])
  })

  it('preenche de 0 a 1 ao longo da palavra', () => {
    const palavra = { texto: 'Help', inicio: 2, fim: 3 }
    expect([1, 2.25, 3, 4].map((t) => preenchimento(palavra, t))).toEqual([0, 0.25, 1, 1])
  })
})

describe('formatarAtraso', () => {
  it('sinal, vírgula e zero sem sinal', () => {
    expect([0.55, -0.05, -1.2, 0, 2].map(formatarAtraso)).toEqual(['+0,55 s', '−0,05 s', '−1,2 s', '0 s', '+2 s'])
  })
})
