import { useEffect, useState } from 'react'

/**
 * Cores da tela da música tiradas da capa: a cor mais marcante da imagem vira o
 * destaque (botão de tocar, verso cantado, abas), no lugar do roxo padrão.
 * Os tons são ajustados até terem contraste suficiente, então qualquer capa fica legível.
 */

export type Rgb = readonly [number, number, number]

export interface Paleta {
  /** Fundo de botão com texto branco por cima (o --roxo). */
  forte: string
  /** O forte ao passar o mouse (o --roxo-escuro). */
  escuro: string
  /** Texto e ícones sobre o fundo escuro (o --destaque). */
  claro: string
}

/** Fundo da página (o --bg), contra o qual o tom claro é medido. */
const FUNDO: Rgb = [13, 14, 16]
const BRANCO: Rgb = [255, 255, 255]

function rgbParaHsl([r, g, b]: Rgb): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255]
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4
  h *= 60
  return [h, s, l]
}

function hslParaRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

function hex(rgb: Rgb) {
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function luminancia(rgb: Rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contraste WCAG entre duas cores (1 a 21). */
export function contraste(a: Rgb, b: Rgb) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (escuro + 0.05)
}

/**
 * A cor mais marcante dos pixels (RGBA, como o getImageData devolve): as cores são
 * juntadas por matiz e ganha o grupo com mais pixels vivos. Cinzas, quase pretos e
 * quase brancos não contam. null quando a imagem é quase toda sem cor.
 */
export function corMarcante(pixels: ArrayLike<number>): Rgb | null {
  const GRUPOS = 24
  const peso = new Array<number>(GRUPOS).fill(0)
  const soma = Array.from({ length: GRUPOS }, () => [0, 0, 0])
  let total = 0
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    total++
    const rgb: Rgb = [pixels[i], pixels[i + 1], pixels[i + 2]]
    const [h, s, l] = rgbParaHsl(rgb)
    if (s < 0.25 || l < 0.12 || l > 0.9) continue
    // Mais saturado e mais perto do meio (nem escuro nem lavado) vale mais
    const p = s * (1 - Math.abs(l - 0.5))
    const grupo = Math.floor(h / (360 / GRUPOS)) % GRUPOS
    peso[grupo] += p
    soma[grupo][0] += rgb[0] * p
    soma[grupo][1] += rgb[1] * p
    soma[grupo][2] += rgb[2] * p
  }
  if (total === 0) return null
  const melhor = peso.indexOf(Math.max(...peso))
  // Pouca cor (uma capa em preto e branco com um detalhe): fica o roxo padrão
  if (peso[melhor] < total * 0.02) return null
  const [r, g, b] = soma[melhor].map((v) => Math.round(v / peso[melhor]))
  return [r, g, b]
}

/** Os três tons da tela a partir da cor da capa, todos com contraste conferido. */
export function paletaDaCor(cor: Rgb): Paleta {
  const [h, s0] = rgbParaHsl(cor)
  const s = Math.min(0.85, Math.max(0.45, s0))
  // Forte: escurece até o texto branco ter 4,5:1 em cima dele
  let lForte = 0.52
  while (lForte > 0.1 && contraste(BRANCO, hslParaRgb(h, s, lForte)) < 4.5) lForte -= 0.01
  // Claro: clareia até ter 7:1 sobre o fundo da página
  let lClaro = 0.68
  while (lClaro < 0.95 && contraste(hslParaRgb(h, s, lClaro), FUNDO) < 7) lClaro += 0.01
  return {
    forte: hex(hslParaRgb(h, s, lForte)),
    escuro: hex(hslParaRgb(h, s, Math.max(0.05, lForte - 0.07))),
    claro: hex(hslParaRgb(h, s, lClaro)),
  }
}

// A mesma capa não é lida de novo ao voltar para a música
const lidas = new Map<string, Paleta | null>()

/** O que saiu da leitura da capa; `guardar` diz se vale para sempre (vai para o cache). */
export interface Leitura {
  paleta: Paleta | null
  guardar: boolean
}

/**
 * Lê a imagem num canvas pequeno. paleta null se não carregar ou se o site dela não
 * deixar ler (CORS). Uma falha ao carregar pode ser passageira (rede): essa não é
 * guardada, e a capa é lida de novo da próxima vez.
 */
export function lerPaleta(url: string): Promise<Leitura> {
  return new Promise((resolver) => {
    const imagem = new Image()
    imagem.crossOrigin = 'anonymous'
    imagem.decoding = 'async'
    imagem.onload = () => {
      try {
        const lado = 48
        const canvas = document.createElement('canvas')
        canvas.width = lado
        canvas.height = lado
        const contexto = canvas.getContext('2d', { willReadFrequently: true })
        if (!contexto) return resolver({ paleta: null, guardar: false })
        contexto.drawImage(imagem, 0, 0, lado, lado)
        const cor = corMarcante(contexto.getImageData(0, 0, lado, lado).data)
        resolver({ paleta: cor && paletaDaCor(cor), guardar: true })
      } catch {
        // imagem de um site sem CORS: o canvas fica "sujo" e não deixa ler (e nunca vai deixar)
        resolver({ paleta: null, guardar: true })
      }
    }
    imagem.onerror = () => resolver({ paleta: null, guardar: false })
    imagem.src = url
  })
}

/** Paleta da capa, ou null enquanto lê (e quando não dá): aí fica o roxo padrão. */
export function useCoresDaCapa(url: string | null) {
  const [paleta, setPaleta] = useState<{ url: string; paleta: Paleta | null } | null>(null)
  useEffect(() => {
    if (!url || lidas.has(url)) return
    let ativo = true
    void lerPaleta(url).then(({ paleta: lida, guardar }) => {
      if (guardar) lidas.set(url, lida)
      if (ativo) setPaleta({ url, paleta: lida })
    })
    return () => {
      ativo = false
    }
  }, [url])
  if (!url) return null
  if (lidas.has(url)) return lidas.get(url) ?? null
  return paleta?.url === url ? paleta.paleta : null
}
