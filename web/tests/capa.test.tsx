import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ligarBrilho } from '../src/logica/brilho.ts'
import { lerPaleta, useCoresDaCapa } from '../src/logica/cores.ts'

// Imagem falsa: ao receber o src, "carrega" ou "falha" conforme `resultado`
let resultado: 'carrega' | 'falha' = 'carrega'
let criadas = 0
class ImagemFalsa {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin = ''
  decoding = ''
  set src(_url: string) {
    queueMicrotask(() => (resultado === 'carrega' ? this.onload?.() : this.onerror?.()))
  }
}

// Capa toda vermelha, 48 x 48
const VERMELHO = new Uint8ClampedArray(48 * 48 * 4).map((_, i) => [200, 40, 40, 255][i % 4])
const lerPixels = vi.fn(() => ({ data: VERMELHO }))

beforeEach(() => {
  resultado = 'carrega'
  criadas = 0
  vi.stubGlobal(
    'Image',
    class extends ImagemFalsa {
      constructor() {
        super()
        criadas++
      }
    },
  )
  lerPixels.mockImplementation(() => ({ data: VERMELHO }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: lerPixels,
  } as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('lerPaleta', () => {
  it('lê a cor da capa e guarda a leitura', async () => {
    const { paleta, guardar } = await lerPaleta('/capa-1.jpg')
    expect(paleta).not.toBeNull()
    expect(guardar).toBe(true)
  })

  it('capa de um site que não deixa ler (o canvas lança): null, e guarda', async () => {
    lerPixels.mockImplementation(() => {
      throw new DOMException('canvas sujo', 'SecurityError')
    })
    expect(await lerPaleta('/capa-2.jpg')).toEqual({ paleta: null, guardar: true })
  })

  it('falha ao carregar pode ser passageira: null, e não guarda', async () => {
    resultado = 'falha'
    expect(await lerPaleta('/capa-3.jpg')).toEqual({ paleta: null, guardar: false })
  })
})

describe('useCoresDaCapa', () => {
  it('sem capa fica com o padrão (null) e nem tenta ler', () => {
    const { result } = renderHook(() => useCoresDaCapa(null))
    expect(result.current).toBeNull()
    expect(criadas).toBe(0)
  })

  it('a mesma capa é lida uma vez só', async () => {
    const primeira = renderHook(() => useCoresDaCapa('/capa-4.jpg'))
    await waitFor(() => expect(primeira.result.current).not.toBeNull())
    const segunda = renderHook(() => useCoresDaCapa('/capa-4.jpg'))
    expect(segunda.result.current).toEqual(primeira.result.current)
    expect(criadas).toBe(1)
  })

  it('depois de uma falha ao carregar, a capa é lida de novo', async () => {
    resultado = 'falha'
    const primeira = renderHook(() => useCoresDaCapa('/capa-5.jpg'))
    await waitFor(() => expect(criadas).toBe(1))
    await Promise.resolve()
    expect(primeira.result.current).toBeNull()

    resultado = 'carrega'
    const segunda = renderHook(() => useCoresDaCapa('/capa-5.jpg'))
    await waitFor(() => expect(segunda.result.current).not.toBeNull())
    expect(criadas).toBe(2)
  })
})

describe('ligarBrilho', () => {
  function ponteiro(alvo: Element, tipo: string, x: number, y: number) {
    const evento = new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y })
    Object.defineProperty(evento, 'pointerType', { value: tipo })
    alvo.dispatchEvent(evento)
  }

  it('guarda a posição do mouse dentro do cartão em --mx e --my', () => {
    document.body.innerHTML = '<div class="spot"><span>texto</span></div>'
    const cartao = document.querySelector<HTMLElement>('.spot')!
    vi.spyOn(cartao, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50 } as DOMRect)
    const desligar = ligarBrilho()
    ponteiro(cartao.querySelector('span')!, 'mouse', 130, 90)
    expect(cartao.style.getPropertyValue('--mx')).toBe('30px')
    expect(cartao.style.getPropertyValue('--my')).toBe('40px')

    desligar()
    ponteiro(cartao, 'mouse', 160, 60)
    expect(cartao.style.getPropertyValue('--mx')).toBe('30px')
  })

  it('ignora o toque (no celular o brilho ficaria preso)', () => {
    document.body.innerHTML = '<div class="spot"></div>'
    const cartao = document.querySelector<HTMLElement>('.spot')!
    const desligar = ligarBrilho()
    ponteiro(cartao, 'touch', 10, 10)
    expect(cartao.style.getPropertyValue('--mx')).toBe('')
    desligar()
  })
})
