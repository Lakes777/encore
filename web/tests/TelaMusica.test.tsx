import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ErroApi } from '../src/logica/api.ts'
import type { Musica, Verso } from '../src/logica/tipos.ts'
import { TelaMusica } from '../src/telas/TelaMusica.tsx'

// Nada de rede: o objeto `api` é trocado por funções falsas.
vi.mock('../src/logica/api.ts', async (original) => {
  const modulo = await original<typeof import('../src/logica/api.ts')>()
  return {
    ...modulo,
    api: { musica: vi.fn(), letra: vi.fn(), definirFundo: vi.fn(), definirVolumes: vi.fn() },
  }
})

const ID = '989ba3f6818c'

function umaMusica(extra: Partial<Musica> = {}): Musica {
  return {
    id: ID,
    id_video: 'Mh1hKt5kQ_4',
    titulo: 'Her Majesty',
    artista: 'The Beatles',
    tom: 'D',
    escala: 'maior',
    tem_letra: true,
    letra_sincronizada: true,
    modo: 'rapido',
    duracao: 26,
    faixas: [
      { nome: 'voz principal', arquivo: 'voz-principal.wav', volume: 1.0 },
      { nome: 'vocais de apoio', arquivo: 'vocais-de-apoio.wav', volume: 0.6 },
      { nome: 'instrumental', arquivo: 'instrumental.wav', volume: 0.8 },
      { nome: 'original', arquivo: 'original.wav', volume: 0.0 },
    ],
    fundo: { url: 'https://exemplo.com/capa.jpg', desfoque: 12 },
    ...extra,
  }
}

const LETRA: Verso[] = [
  { tempo: 1, texto: "Her Majesty's a pretty nice girl" },
  { tempo: 4, texto: "But she doesn't have a lot to say" },
  { tempo: 8, texto: 'Her Majesty is a pretty nice girl' },
]

/** O <audio> de cada faixa, pelo nome do arquivo. */
function audio(arquivo: string) {
  const elemento = document.querySelector<HTMLAudioElement>(`audio[src$="/${arquivo}"]`)
  if (!elemento) throw new Error(`sem <audio> para ${arquivo}`)
  return elemento
}

const todosOsAudios = () => [...document.querySelectorAll('audio')]

/** O jsdom não carrega mídia: avisa à mão que todas podem tocar. */
function liberarFaixas() {
  for (const elemento of todosOsAudios()) fireEvent.canPlay(elemento)
}

/** Simula o mestre (primeira faixa que não é a original) chegando a um tempo. */
function irPara(segundos: number) {
  for (const elemento of todosOsAudios()) elemento.currentTime = segundos
  fireEvent.timeUpdate(audio('voz-principal.wav'))
}

async function abrir(musica = umaMusica(), letra: Verso[] | Error = LETRA) {
  vi.mocked(api.musica).mockResolvedValue(musica)
  if (letra instanceof Error) vi.mocked(api.letra).mockRejectedValue(letra)
  else vi.mocked(api.letra).mockResolvedValue(letra)
  render(<TelaMusica id={ID} />)
  await screen.findByRole('heading', { name: musica.titulo })
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.mocked(api.definirVolumes).mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(api.musica).mockReset()
  vi.mocked(api.letra).mockReset()
  vi.mocked(api.definirFundo).mockReset()
  // definirVolumes não é zerado aqui: ao desmontar, a tela ainda salva o que faltava.
  vi.mocked(api.definirVolumes).mockClear()
})

describe('carregar', () => {
  it('mostra o cabeçalho, um <audio> por faixa e espera as faixas carregarem', async () => {
    await abrir()
    expect(screen.getByText('The Beatles · D maior')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para o início' })).toHaveAttribute('href', '#/')
    expect(todosOsAudios()).toHaveLength(4)
    expect(audio('voz-principal.wav')).toHaveAttribute('src', `/api/musicas/${ID}/faixas/voz-principal.wav`)
    expect(audio('voz-principal.wav')).toHaveAttribute('preload', 'auto')

    expect(screen.getByText('Carregando as faixas…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tocar' })).toBeDisabled()
    // Faltando uma, continua travado
    for (const elemento of todosOsAudios().slice(0, 3)) fireEvent.canPlay(elemento)
    expect(screen.getByRole('button', { name: 'Tocar' })).toBeDisabled()
    fireEvent.canPlay(audio('original.wav'))
    expect(screen.getByRole('button', { name: 'Tocar' })).toBeEnabled()
    expect(screen.queryByText('Carregando as faixas…')).not.toBeInTheDocument()
    expect(screen.getByText('0:26')).toBeInTheDocument()
  })

  it('música que não existe mostra o erro e o link para voltar', async () => {
    vi.mocked(api.musica).mockRejectedValue(new ErroApi(404, 'Música não encontrada.'))
    vi.mocked(api.letra).mockRejectedValue(new ErroApi(404, 'Sem letra.'))
    render(<TelaMusica id={ID} />)
    expect(screen.getByText('Carregando a música…')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Música não encontrada.')
    expect(screen.getByRole('link', { name: 'Voltar para o início' })).toHaveAttribute('href', '#/')
  })
})

describe('tocar', () => {
  it('play e pause valem para todas as faixas; espaço também alterna', async () => {
    await abrir()
    liberarFaixas()
    const play = vi.mocked(HTMLMediaElement.prototype.play)
    const pause = vi.mocked(HTMLMediaElement.prototype.pause)

    await userEvent.click(screen.getByRole('button', { name: 'Tocar' }))
    expect(play).toHaveBeenCalledTimes(4)
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    expect(pause).toHaveBeenCalledTimes(4)

    // Espaço com o foco fora de campo: toca. Com o foco num controle: não.
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
    expect(play).toHaveBeenCalledTimes(8)
    await screen.findByRole('button', { name: 'Pausar' })
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume de instrumental' }), { key: ' ', code: 'Space' })
    expect(pause).toHaveBeenCalledTimes(4)
  })

  it('pular move todas as faixas e ao terminar volta ao início parado', async () => {
    await abrir()
    liberarFaixas()
    irPara(10)
    await userEvent.click(screen.getByRole('button', { name: 'Avançar 5 segundos' }))
    expect(todosOsAudios().map((elemento) => elemento.currentTime)).toEqual([15, 15, 15, 15])
    expect(screen.getByText('0:15')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Voltar 5 segundos' }))
    expect(audio('original.wav').currentTime).toBe(10)

    fireEvent.change(screen.getByRole('slider', { name: 'Posição na música' }), { target: { value: '20' } })
    expect(audio('instrumental.wav').currentTime).toBe(20)

    await userEvent.click(screen.getByRole('button', { name: 'Tocar' }))
    fireEvent.ended(audio('voz-principal.wav'))
    expect(screen.getByRole('button', { name: 'Tocar' })).toBeInTheDocument()
    expect(todosOsAudios().map((elemento) => elemento.currentTime)).toEqual([0, 0, 0, 0])
  })
})

describe('volumes', () => {
  it('um controle por faixa (menos a original) com o volume inicial', async () => {
    await abrir()
    expect(screen.getAllByRole('slider', { name: /^Volume de / })).toHaveLength(3)
    expect(screen.queryByRole('slider', { name: 'Volume de original' })).not.toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Volume de vocais de apoio' })).toHaveValue('60')
    expect(audio('vocais-de-apoio.wav').volume).toBeCloseTo(0.6)
    expect(audio('instrumental.wav').volume).toBeCloseTo(0.8)
    expect(audio('original.wav').volume).toBe(0)
  })

  it('mexer no controle muda o volume do <audio>; mudo silencia', async () => {
    await abrir()
    fireEvent.change(screen.getByRole('slider', { name: 'Volume de voz principal' }), { target: { value: '25' } })
    expect(audio('voz-principal.wav').volume).toBeCloseTo(0.25)

    await userEvent.click(screen.getByRole('button', { name: 'Silenciar voz principal' }))
    expect(audio('voz-principal.wav').volume).toBe(0)
    expect(screen.getByRole('button', { name: 'Silenciar voz principal' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Silenciar voz principal' }))
    expect(audio('voz-principal.wav').volume).toBeCloseTo(0.25)
  })

  it('salva os volumes um pouco depois de parar de mexer, sem o mudo nem a original', async () => {
    await abrir()
    const voz = screen.getByRole('slider', { name: 'Volume de voz principal' })
    fireEvent.change(voz, { target: { value: '40' } })
    fireEvent.change(voz, { target: { value: '0' } })
    await userEvent.click(screen.getByRole('button', { name: 'Silenciar instrumental' }))
    await userEvent.click(screen.getByRole('button', { name: 'Tocar a original' }))
    expect(api.definirVolumes).not.toHaveBeenCalled()

    expect(await screen.findByText('Volumes salvos', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(api.definirVolumes).toHaveBeenCalledTimes(1)
    expect(api.definirVolumes).toHaveBeenCalledWith(ID, { 'voz-principal.wav': 0 })
  })

  it('sair da tela antes da espera também salva', async () => {
    vi.mocked(api.musica).mockResolvedValue(umaMusica())
    vi.mocked(api.letra).mockResolvedValue(LETRA)
    const { unmount } = render(<TelaMusica id={ID} />)
    fireEvent.change(await screen.findByRole('slider', { name: 'Volume de vocais de apoio' }), { target: { value: '10' } })
    unmount()
    expect(api.definirVolumes).toHaveBeenCalledWith(ID, { 'vocais-de-apoio.wav': 0.1 })
  })

  it('avisa quando não consegue salvar os volumes', async () => {
    vi.mocked(api.definirVolumes).mockRejectedValue(new ErroApi(0, 'O servidor do karaokê não respondeu.'))
    await abrir()
    fireEvent.change(screen.getByRole('slider', { name: 'Volume de instrumental' }), { target: { value: '50' } })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Não deu para salvar os volumes'), { timeout: 2000 })
  })

  it('tocar a original silencia as separadas e desligar volta como estava', async () => {
    await abrir()
    const botao = screen.getByRole('button', { name: 'Tocar a original' })
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-pressed', 'true')
    expect(audio('original.wav').volume).toBe(1)
    expect(['voz-principal.wav', 'vocais-de-apoio.wav', 'instrumental.wav'].map((a) => audio(a).volume)).toEqual([0, 0, 0])
    expect(screen.getByRole('slider', { name: 'Volume de vocais de apoio' })).toHaveValue('60')

    await userEvent.click(botao)
    expect(audio('original.wav').volume).toBe(0)
    expect(audio('vocais-de-apoio.wav').volume).toBeCloseTo(0.6)
  })

  it('sem faixa original não há o botão', async () => {
    const musica = umaMusica()
    await abrir({ ...musica, faixas: musica.faixas.filter((faixa) => faixa.nome !== 'original') })
    expect(screen.queryByRole('button', { name: 'Tocar a original' })).not.toBeInTheDocument()
  })
})

describe('letra', () => {
  it('sem letra mostra o aviso com o link para escolher', async () => {
    await abrir(umaMusica({ tem_letra: false }), new ErroApi(404, 'Essa música não tem letra.'))
    expect(screen.getByText('Essa música ainda não tem letra.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Escolher a letra na tela inicial' })).toHaveAttribute('href', '#/')
  })

  it('destaca o verso do tempo atual', async () => {
    await abrir()
    liberarFaixas()
    expect(document.querySelector('[aria-current="true"]')).toBeNull()
    irPara(5)
    expect(screen.getByRole('button', { name: "But she doesn't have a lot to say" })).toHaveAttribute('aria-current', 'true')
    irPara(8.2)
    expect(screen.getByRole('button', { name: 'Her Majesty is a pretty nice girl' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: "But she doesn't have a lot to say" })).not.toHaveAttribute('aria-current')
  })

  it('clicar num verso pula a música para ele', async () => {
    await abrir()
    liberarFaixas()
    await userEvent.click(screen.getByRole('button', { name: 'Her Majesty is a pretty nice girl' }))
    expect(todosOsAudios().map((elemento) => elemento.currentTime)).toEqual([8, 8, 8, 8])
    expect(screen.getByRole('button', { name: 'Her Majesty is a pretty nice girl' })).toHaveAttribute('aria-current', 'true')
  })

  it('letra sem tempo aparece inteira, sem botões', async () => {
    await abrir(umaMusica(), LETRA.map((verso) => ({ ...verso, tempo: null })))
    expect(screen.getByText("Her Majesty's a pretty nice girl")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "Her Majesty's a pretty nice girl" })).not.toBeInTheDocument()
  })
})

describe('fundo', () => {
  it('mostra a imagem desfocada e salva o desfoque só ao soltar o controle', async () => {
    vi.mocked(api.definirFundo).mockResolvedValue({ url: 'https://exemplo.com/capa.jpg', desfoque: 30 })
    await abrir()
    const fundo = screen.getByTestId('fundo')
    expect(fundo.style.backgroundImage).toContain('https://exemplo.com/capa.jpg')
    expect(fundo.style.filter).toBe('blur(12px)')

    const controle = screen.getByRole('slider', { name: 'Desfoque do fundo' })
    fireEvent.change(controle, { target: { value: '20' } })
    fireEvent.change(controle, { target: { value: '30' } })
    expect(fundo.style.filter).toBe('blur(30px)')
    expect(api.definirFundo).not.toHaveBeenCalled()

    fireEvent.pointerUp(controle)
    fireEvent.blur(controle)
    expect(api.definirFundo).toHaveBeenCalledTimes(1)
    expect(api.definirFundo).toHaveBeenCalledWith(ID, { url: 'https://exemplo.com/capa.jpg', desfoque: 30 })
    expect(await screen.findByText('Salvo')).toBeInTheDocument()
  })

  it('sem imagem não há fundo nem controle de desfoque', async () => {
    await abrir(umaMusica({ fundo: undefined }))
    expect(screen.queryByTestId('fundo')).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Desfoque do fundo' })).not.toBeInTheDocument()
  })
})

it('sem suporte a tela cheia (como no jsdom) o botão não aparece', async () => {
  await abrir()
  expect(screen.queryByRole('button', { name: 'Tela cheia' })).not.toBeInTheDocument()
})
