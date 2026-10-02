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
    api: { musica: vi.fn(), letra: vi.fn(), definirFundo: vi.fn(), definirVolumes: vi.fn(), definirAtrasoLetra: vi.fn() },
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

/** Os controles ficam em abas (Volumes, Treino, Ajustes): abre a do nome dado. */
function abrirAba(nome: string) {
  fireEvent.click(screen.getByRole('tab', { name: nome }))
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

describe('metrônomo', () => {
  it('sem batidas não aparece', async () => {
    await abrir()
    abrirAba('Treino')
    expect(screen.getByRole('heading', { name: 'Velocidade' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Metrônomo' })).not.toBeInTheDocument()
  })

  it('ligado e tocando, agenda um clique em cada batida seguindo a velocidade', async () => {
    const inicios: number[] = []
    class OsciladorFalso {
      frequency = { value: 0 }
      onended: (() => void) | null = null
      connect = (no: unknown) => no
      start = (quando: number) => inicios.push(quando)
      stop = vi.fn()
    }
    class AudioContextFalso {
      currentTime = 100
      destination = {}
      resume = vi.fn(async () => {})
      close = vi.fn(async () => {})
      createOscillator = () => new OsciladorFalso()
      createGain = () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (no: unknown) => no })
    }
    vi.stubGlobal('AudioContext', AudioContextFalso)

    await abrir(umaMusica({ bpm: 120, batidas: [2, 2.5, 3, 3.5] }))
    abrirAba('Treino')
    liberarFaixas()
    expect(screen.getByText('120 BPM')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Velocidade da música' }), { target: { value: '50' } })
    expect(screen.getByText('(60 agora)')).toBeInTheDocument()

    irPara(1.95)
    await userEvent.click(screen.getByRole('button', { name: 'Desligado' }))
    await userEvent.click(screen.getByRole('button', { name: 'Tocar' }))
    // Na metade da velocidade, a batida de 2 s (0,05 s de música adiante) toca 0,1 s de relógio depois
    await waitFor(() => expect(inicios).toHaveLength(1))
    expect(inicios[0]).toBeCloseTo(100.1)
    vi.unstubAllGlobals()
  })
})

describe('velocidade', () => {
  it('muda a velocidade de todas as faixas sem mudar o tom e volta ao normal', async () => {
    await abrir()
    abrirAba('Treino')
    const normal = screen.getByRole('button', { name: 'Normal' })
    expect(normal).toBeDisabled()
    for (const elemento of todosOsAudios()) expect(elemento.playbackRate).toBe(1)

    fireEvent.change(screen.getByRole('slider', { name: 'Velocidade da música' }), { target: { value: '75' } })
    expect(screen.getByText('75%')).toBeInTheDocument()
    for (const elemento of todosOsAudios()) {
      expect(elemento.playbackRate).toBe(0.75)
      expect(elemento.defaultPlaybackRate).toBe(0.75)
      expect(elemento.preservesPitch).toBe(true)
    }

    await userEvent.click(normal)
    for (const elemento of todosOsAudios()) expect(elemento.playbackRate).toBe(1)
    expect(normal).toBeDisabled()
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

  it('acende as palavras do verso atual conforme a voz', async () => {
    // Verso 2 (de 4 a 8): voz de 4 a 6, dividida entre 7 palavras (8 sílabas)
    await abrir(umaMusica({ trechos_voz: [[4, 6]] }))
    liberarFaixas()
    irPara(5)
    const verso = screen.getByRole('button', { name: "But she doesn't have a lot to say" })
    const palavras = [...verso.querySelectorAll<HTMLElement>('.letra__palavra')]
    expect(palavras.map((p) => p.textContent)).toEqual(['But', 'she', "doesn't", 'have', 'a', 'lot', 'to', 'say'])
    const preenchidos = palavras.map((p) => p.style.getPropertyValue('--preenchido'))
    expect(preenchidos.slice(0, 3)).toEqual(['100%', '100%', '100%']) // But she doesn't: 4 sílabas = 1 s
    expect(preenchidos.slice(4)).toEqual(['0%', '0%', '0%', '0%'])
    // Os outros versos ficam inteiros, sem palavras separadas
    expect(screen.getByRole('button', { name: 'Her Majesty is a pretty nice girl' }).querySelector('.letra__palavra')).toBeNull()
  })

  it('clicar num verso pula a música para ele', async () => {
    await abrir()
    liberarFaixas()
    await userEvent.click(screen.getByRole('button', { name: 'Her Majesty is a pretty nice girl' }))
    expect(todosOsAudios().map((elemento) => elemento.currentTime)).toEqual([8, 8, 8, 8])
    expect(screen.getByRole('button', { name: 'Her Majesty is a pretty nice girl' })).toHaveAttribute('aria-current', 'true')
  })

  it('acerta a letra sozinha pelos trechos de voz, e o ajuste manual salva e volta ao automático', async () => {
    vi.mocked(api.definirAtrasoLetra).mockImplementation(async (_id, atraso) => ({ atraso }))
    const tempos = [2, 6, 10, 14, 18]
    const letra = tempos.map((tempo, i) => ({ tempo, texto: `verso ${i + 1}` }))
    // A voz entra meio segundo depois de cada verso da letra
    await abrir(umaMusica({ trechos_voz: tempos.map((t) => [t + 0.5, t + 3] as [number, number]) }), letra)
    abrirAba('Ajustes')
    liberarFaixas()
    const valor = () => document.querySelector('.sincronia__valor')

    expect(valor()).toHaveTextContent('+0,5 s')
    expect(screen.getByText('(automático)')).toBeInTheDocument()
    irPara(6.2) // a letra diz 6, mas a voz só entra em 6,5
    expect(screen.getByRole('button', { name: 'verso 1' })).toHaveAttribute('aria-current', 'true')
    irPara(6.6)
    expect(screen.getByRole('button', { name: 'verso 2' })).toHaveAttribute('aria-current', 'true')

    const atrasar = screen.getByRole('button', { name: 'Atrasar a letra 0,1 segundo' })
    await userEvent.click(atrasar)
    await userEvent.click(atrasar)
    expect(valor()).toHaveTextContent('+0,7 s') // a tela muda na hora
    expect(screen.getByText('(ajustado)')).toBeInTheDocument()
    // Cliques seguidos viram um pedido só, com o valor final
    await waitFor(() => expect(api.definirAtrasoLetra).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(api.definirAtrasoLetra).toHaveBeenLastCalledWith(ID, 0.7)

    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao automático' }))
    expect(valor()).toHaveTextContent('+0,5 s')
    await waitFor(() => expect(api.definirAtrasoLetra).toHaveBeenLastCalledWith(ID, null), { timeout: 2000 })
  })

  it('usa o atraso salvo e desfaz o clique se não conseguir salvar', async () => {
    vi.mocked(api.definirAtrasoLetra).mockRejectedValue(new ErroApi(0, 'O servidor do karaokê não respondeu.'))
    await abrir(umaMusica({ atraso_letra: -1 }))
    abrirAba('Ajustes')
    const valor = () => document.querySelector('.sincronia__valor')
    expect(valor()).toHaveTextContent('−1 s')
    await userEvent.click(screen.getByRole('button', { name: 'Adiantar a letra 0,1 segundo' }))
    expect(valor()).toHaveTextContent('−1,1 s')
    expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveTextContent('não respondeu')
    expect(valor()).toHaveTextContent('−1 s')
  })

  it('um pedido antigo que falha não desfaz um novo que deu certo', async () => {
    let falharPrimeiro: (motivo: Error) => void = () => {}
    vi.mocked(api.definirAtrasoLetra)
      .mockImplementationOnce(() => new Promise((_, falhar) => (falharPrimeiro = falhar)))
      .mockResolvedValue({ atraso: 0.2 })
    await abrir(umaMusica({ atraso_letra: 0 }))
    abrirAba('Ajustes')
    const valor = () => document.querySelector('.sincronia__valor')
    const atrasar = screen.getByRole('button', { name: 'Atrasar a letra 0,1 segundo' })
    await userEvent.click(atrasar)
    await waitFor(() => expect(api.definirAtrasoLetra).toHaveBeenCalledTimes(1), { timeout: 2000 })
    await userEvent.click(atrasar)
    await waitFor(() => expect(api.definirAtrasoLetra).toHaveBeenCalledTimes(2), { timeout: 2000 })
    falharPrimeiro(new ErroApi(0, 'falhou'))
    await new Promise((pronto) => setTimeout(pronto, 50))
    expect(valor()).toHaveTextContent('+0,2 s')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('não passa do limite de 10 s do servidor', async () => {
    await abrir(umaMusica({ atraso_letra: 9.95 }))
    abrirAba('Ajustes')
    expect(screen.getByRole('button', { name: 'Atrasar a letra 0,1 segundo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Adiantar a letra 0,1 segundo' })).toBeEnabled()
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

    abrirAba('Ajustes')
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
    abrirAba('Ajustes') // continua por causa da sincronia da letra
    expect(screen.queryByRole('slider', { name: 'Desfoque do fundo' })).not.toBeInTheDocument()
  })
})

it('sem suporte a tela cheia (como no jsdom) o botão não aparece', async () => {
  await abrir()
  expect(screen.queryByRole('button', { name: 'Tela cheia' })).not.toBeInTheDocument()
})

describe('painel de controles', () => {
  /** Finge a largura da tela: true = computador, false = celular. */
  function telaLarga(larga: boolean) {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: larga && consulta.includes('min-width'), media: consulta }))
  }

  afterEach(() => vi.unstubAllGlobals())

  it('no computador começa aberto em Volumes; as outras abas ficam escondidas', async () => {
    telaLarga(true)
    await abrir()
    expect(screen.getByRole('button', { name: 'Controles' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('tab', { name: 'Volumes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('slider', { name: 'Volume de voz principal' })).toBeVisible()
    expect(screen.queryByRole('slider', { name: 'Velocidade da música' })).not.toBeInTheDocument()
    abrirAba('Treino')
    expect(screen.getByRole('slider', { name: 'Velocidade da música' })).toBeVisible()
    expect(screen.queryByRole('slider', { name: 'Volume de voz principal' })).not.toBeInTheDocument()
  })

  it('no celular começa fechado e abre pelo botão; Esc fecha e devolve o foco', async () => {
    telaLarga(false)
    await abrir()
    const botao = screen.getByRole('button', { name: 'Controles' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('tab', { name: 'Volumes' })).not.toBeInTheDocument()
    // O player continua à mão com o painel fechado
    expect(screen.getByRole('button', { name: 'Tocar' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Posição na música' })).toBeInTheDocument()

    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    const volume = screen.getByRole('slider', { name: 'Volume de instrumental' })
    volume.focus()
    await userEvent.keyboard('{Escape}')
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(botao).toHaveFocus()

    await userEvent.click(botao)
    await userEvent.click(screen.getByRole('button', { name: 'Fechar os controles' }))
    expect(screen.queryByRole('tab', { name: 'Volumes' })).not.toBeInTheDocument()
  })

  it('setas trocam de aba e mexer em outra aba não perde o que foi feito', async () => {
    await abrir()
    fireEvent.change(screen.getByRole('slider', { name: 'Volume de voz principal' }), { target: { value: '25' } })
    screen.getByRole('tab', { name: 'Volumes' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Treino' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Treino' })).toHaveFocus()
    fireEvent.change(screen.getByRole('slider', { name: 'Velocidade da música' }), { target: { value: '75' } })
    // Com o painel fechado ou em outra aba, o que mudou aparece ao lado do player
    expect(screen.getByText('velocidade 75%')).toBeInTheDocument()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Ajustes' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Volumes' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('slider', { name: 'Volume de voz principal' })).toHaveValue('25')
  })

  it('sem letra sincronizada nem imagem, não há a aba Ajustes', async () => {
    await abrir(umaMusica({ fundo: undefined }), LETRA.map((verso) => ({ ...verso, tempo: null })))
    expect(screen.getAllByRole('tab').map((aba) => aba.textContent)).toEqual(['Volumes', 'Treino'])
  })
})
