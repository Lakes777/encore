import { describe, expect, it } from 'vitest'
import { indiceDoVersoAtual, letraSincronizada } from '../src/logica/letra.ts'
import { faixasParaCorrigir, indiceDoMestre, TOLERANCIA_SINCRONIA } from '../src/logica/sincronia.ts'
import type { Faixa } from '../src/logica/tipos.ts'
import { estadoInicialDosVolumes, volumeEfetivo } from '../src/logica/volumes.ts'

const versos = [
  { tempo: 2, texto: 'primeiro' },
  { tempo: 5, texto: 'segundo' },
  { tempo: 5, texto: 'mesmo tempo' },
  { tempo: null, texto: 'sem tempo' },
  { tempo: 9.5, texto: 'último' },
]

describe('verso atual', () => {
  it('antes do primeiro verso não há verso atual', () => {
    expect(indiceDoVersoAtual(versos, 0)).toBe(-1)
    expect(indiceDoVersoAtual(versos, 1.99)).toBe(-1)
  })

  it('é o último verso com tempo menor ou igual ao atual', () => {
    expect(indiceDoVersoAtual(versos, 2)).toBe(0)
    expect(indiceDoVersoAtual(versos, 4.9)).toBe(0)
    expect(indiceDoVersoAtual(versos, 9.4)).toBe(2)
    expect(indiceDoVersoAtual(versos, 9.5)).toBe(4)
    expect(indiceDoVersoAtual(versos, 500)).toBe(4)
  })

  it('com versos no mesmo tempo fica o último deles', () => {
    expect(indiceDoVersoAtual(versos, 5)).toBe(2)
  })

  it('letra sem tempo nunca tem verso atual', () => {
    const parada = [
      { tempo: null, texto: 'a' },
      { tempo: null, texto: 'b' },
    ]
    expect(letraSincronizada(parada)).toBe(false)
    expect(indiceDoVersoAtual(parada, 10)).toBe(-1)
    expect(letraSincronizada(versos)).toBe(true)
    expect(letraSincronizada([])).toBe(false)
  })
})

describe('sincronia', () => {
  it('o mestre é a primeira faixa que não é a original', () => {
    expect(indiceDoMestre([{ nome: 'original' }, { nome: 'guitarra' }, { nome: 'baixo' }])).toBe(1)
    expect(indiceDoMestre([{ nome: 'voz' }, { nome: 'original' }])).toBe(0)
    expect(indiceDoMestre([{ nome: 'original' }])).toBe(0)
  })

  it('corrige só as faixas que passaram da tolerância', () => {
    expect(TOLERANCIA_SINCRONIA).toBeCloseTo(0.08)
    // mestre no índice 0, em 10 s
    expect(faixasParaCorrigir(10, [10, 10.05, 9.95, 10.2, 9.7])).toEqual([3, 4])
    expect(faixasParaCorrigir(10, [10, 10.07, 9.93])).toEqual([])
  })

  it('aceita outra tolerância', () => {
    expect(faixasParaCorrigir(0, [0, 0.3, 0.6], 0.5)).toEqual([2])
  })
})

describe('volumes', () => {
  const faixas: Faixa[] = [
    { nome: 'voz principal', arquivo: 'voz.wav', volume: 0.8 },
    { nome: 'bateria', arquivo: 'bateria.wav', volume: 1 },
    { nome: 'original', arquivo: 'original.wav', volume: 0 },
  ]

  it('começa com o volume de cada faixa', () => {
    const estado = estadoInicialDosVolumes(faixas)
    expect(faixas.map((faixa) => volumeEfetivo(faixa, estado))).toEqual([0.8, 1, 0])
  })

  it('mudo silencia sem perder o valor', () => {
    const estado = { ...estadoInicialDosVolumes(faixas), mudos: { 'voz.wav': true } }
    expect(volumeEfetivo(faixas[0], estado)).toBe(0)
    expect(estado.volumes['voz.wav']).toBe(0.8)
  })

  it('tocar a original liga ela em 100% e silencia as separadas', () => {
    const estado = { ...estadoInicialDosVolumes(faixas), tocandoOriginal: true }
    expect(faixas.map((faixa) => volumeEfetivo(faixa, estado))).toEqual([0, 0, 1])
  })
})
