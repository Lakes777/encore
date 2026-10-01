import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ErroApi } from '../src/logica/api.ts'
import type { Capa, Musica, ResultadoBusca, Sistema, Tarefa, VersaoLetra } from '../src/logica/tipos.ts'
import { TelaInicio } from '../src/telas/TelaInicio.tsx'

// Troca as chamadas de rede por funções falsas; o ErroApi continua o de verdade.
vi.mock('../src/logica/api.ts', async (original) => {
  const modulo = await original<typeof import('../src/logica/api.ts')>()
  const falso = Object.fromEntries(Object.keys(modulo.api).map((nome) => [nome, vi.fn()]))
  return { ...modulo, api: falso }
})

const chamadas = vi.mocked(api)

const SISTEMA: Sistema = {
  dispositivo: 'cpu',
  modo_padrao: 'rapido',
  modos: [
    { nome: 'rapido', descricao: 'Rápida' },
    { nome: 'qualidade', descricao: 'Alta' },
  ],
}

function resultado(extra: Partial<ResultadoBusca> = {}): ResultadoBusca {
  return {
    id: '2Q_ZzBGPdqE',
    titulo: 'Help! (Remastered 2009)',
    canal: 'The Beatles - Topic',
    duracao: 140,
    miniatura: 'https://i.ytimg.com/vi/2Q_ZzBGPdqE/hq.jpg',
    url: 'https://www.youtube.com/watch?v=2Q_ZzBGPdqE',
    inicio_previa: 46,
    estimativas: { rapido: 50, qualidade: 1300 },
    ...extra,
  }
}

function tarefa(extra: Partial<Tarefa> = {}): Tarefa {
  return {
    id: 't1',
    id_video: '2Q_ZzBGPdqE',
    titulo: 'Help!',
    artista: 'The Beatles',
    modo: 'rapido',
    duracao: 140,
    estado: 'na fila',
    progresso: 0,
    erro: null,
    ...extra,
  }
}

function musica(extra: Partial<Musica> = {}): Musica {
  return {
    id: 'abcdef123456',
    id_video: '2Q_ZzBGPdqE',
    titulo: 'Help!',
    artista: 'The Beatles',
    modo: 'rapido',
    duracao: 150,
    tom: 'A',
    escala: 'maior',
    tem_letra: true,
    letra_id: 7,
    faixas: [],
    ...extra,
  }
}

beforeEach(() => {
  chamadas.sistema.mockResolvedValue(SISTEMA)
  chamadas.fila.mockResolvedValue([])
  chamadas.musicas.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function buscar(texto = 'help beatles') {
  const usuario = userEvent.setup()
  render(<TelaInicio />)
  await usuario.type(screen.getByRole('searchbox', { name: /nome da música/i }), texto)
  await usuario.click(screen.getByRole('button', { name: 'Buscar' }))
  return usuario
}

describe('busca', () => {
  it('mostra os resultados e adiciona na fila com o modo escolhido', async () => {
    chamadas.buscar.mockResolvedValue([resultado()])
    chamadas.adicionarNaFila.mockResolvedValue(tarefa({ modo: 'qualidade' }))
    // Depois de adicionar, a fila do servidor já tem a tarefa
    chamadas.fila.mockResolvedValueOnce([]).mockResolvedValue([tarefa({ modo: 'qualidade' })])
    const usuario = await buscar()

    expect(chamadas.buscar).toHaveBeenCalledWith('help beatles')
    const item = (await screen.findByRole('heading', { name: 'Help! (Remastered 2009)' })).closest('li')!
    expect(within(item).getByText('The Beatles - Topic · 2:20')).toBeInTheDocument()

    // Padrão = modo_padrao do sistema, com a estimativa ao lado
    expect(within(item).getByRole('radio', { name: /Rápida/ })).toBeChecked()
    expect(within(item).getByText('~50 s')).toBeInTheDocument()
    expect(within(item).getByText('~22 min')).toBeInTheDocument()
    expect(screen.queryByText('Sem placa de vídeo, o modo Alta fica muito lento.')).not.toBeInTheDocument()

    await usuario.click(within(item).getByRole('radio', { name: /Alta/ }))
    expect(screen.getByText('Sem placa de vídeo, o modo Alta fica muito lento.')).toBeInTheDocument()

    await usuario.click(within(item).getByRole('button', { name: 'Adicionar' }))
    expect(chamadas.adicionarNaFila).toHaveBeenCalledWith({
      id_video: '2Q_ZzBGPdqE',
      titulo: 'Help! (Remastered 2009)',
      artista: 'The Beatles',
      modo: 'qualidade',
      duracao: 140,
    })
    expect(await within(item).findByText('Na fila')).toBeInTheDocument()
    expect(within(item).queryByRole('button', { name: 'Adicionar' })).not.toBeInTheDocument()
    // A tarefa já aparece na fila e a fila é consultada de novo
    const fila = (await screen.findByRole('heading', { name: 'Fila' })).closest('section')!
    expect(within(fila).getByText(/0% · Alta/)).toBeInTheDocument()
    expect(chamadas.fila).toHaveBeenCalledTimes(2)
  })

  it('o botão Adicionar volta quando a tarefa dá erro', async () => {
    chamadas.buscar.mockResolvedValue([resultado()])
    chamadas.adicionarNaFila.mockResolvedValue(tarefa())
    chamadas.fila.mockResolvedValueOnce([]).mockResolvedValue([tarefa({ estado: 'erro', erro: 'Falhou.' })])
    const usuario = await buscar()
    const item = (await screen.findByRole('heading', { name: 'Help! (Remastered 2009)' })).closest('li')!
    await usuario.click(within(item).getByRole('button', { name: 'Adicionar' }))
    expect(await screen.findByText('Falhou.')).toBeInTheDocument()
    expect(within(item).getByRole('button', { name: 'Adicionar' })).toBeInTheDocument()
  })

  it('não avisa sobre o modo Alta quando tem placa de vídeo', async () => {
    chamadas.sistema.mockResolvedValue({ ...SISTEMA, dispositivo: 'cuda', modo_padrao: 'qualidade' })
    chamadas.buscar.mockResolvedValue([resultado()])
    await buscar()
    expect(await screen.findByRole('radio', { name: /Alta/ })).toBeChecked()
    expect(screen.queryByText(/Sem placa de vídeo/)).not.toBeInTheDocument()
  })

  it('mostra o erro da busca', async () => {
    chamadas.buscar.mockRejectedValue(new ErroApi(502, 'O YouTube não respondeu. Confira a internet e tente de novo.'))
    await buscar()
    expect(await screen.findByRole('alert')).toHaveTextContent('O YouTube não respondeu.')
  })

  it('abre uma prévia por vez e fecha', async () => {
    chamadas.buscar.mockResolvedValue([resultado(), resultado({ id: 'xxxxxxxxxxx', titulo: 'Outra', inicio_previa: 0 })])
    const usuario = await buscar()
    const [primeira, segunda] = await screen.findAllByRole('button', { name: 'Prévia' })

    await usuario.click(primeira)
    expect(screen.getByTitle('Prévia de Help! (Remastered 2009)')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/2Q_ZzBGPdqE?start=46&end=61&autoplay=1',
    )

    await usuario.click(segunda)
    expect(screen.queryByTitle('Prévia de Help! (Remastered 2009)')).not.toBeInTheDocument()
    expect(screen.getByTitle('Prévia de Outra')).toHaveAttribute('src', expect.stringContaining('start=0&end=15'))

    await usuario.click(screen.getByRole('button', { name: 'Fechar a prévia' }))
    expect(screen.queryByTitle(/Prévia de/)).not.toBeInTheDocument()
  })
})

describe('fila', () => {
  // Deixa as promessas resolverem e os efeitos rodarem com o relógio falso.
  const esperar = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))

  it('mostra o progresso, consulta de novo e recarrega as músicas quando fica pronta', async () => {
    vi.useFakeTimers()
    chamadas.fila
      .mockResolvedValueOnce([tarefa({ estado: 'separando', progresso: 0.45, modo: 'qualidade' })])
      .mockResolvedValue([tarefa({ estado: 'pronta', progresso: 1, modo: 'qualidade' })])
    render(<TelaInicio />)
    await esperar()

    const fila = screen.getByRole('heading', { name: 'Fila' }).closest('section')!
    expect(within(fila).getByText('Separando as vozes')).toBeInTheDocument()
    expect(within(fila).getByText(/45% · Alta/)).toBeInTheDocument()
    expect(within(fila).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '45')
    // Rodando: não dá para tirar
    expect(within(fila).queryByRole('button', { name: /Tirar/ })).not.toBeInTheDocument()
    expect(chamadas.musicas).toHaveBeenCalledTimes(1)

    await esperar(1500)
    expect(within(fila).getByText('Pronta')).toBeInTheDocument()
    expect(within(fila).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(chamadas.musicas).toHaveBeenCalledTimes(2)

    // Nada andando: para de consultar
    await esperar(6000)
    expect(chamadas.fila).toHaveBeenCalledTimes(2)
  })

  it('para de consultar quando a tela sai', async () => {
    vi.useFakeTimers()
    chamadas.fila.mockResolvedValue([tarefa({ estado: 'baixando', progresso: 0.1 })])
    const { unmount } = render(<TelaInicio />)
    await esperar()
    await esperar(1500)
    expect(chamadas.fila).toHaveBeenCalledTimes(2)
    unmount()
    await esperar(6000)
    expect(chamadas.fila).toHaveBeenCalledTimes(2)
  })

  it('com o servidor lento, espera a resposta antes de consultar de novo', async () => {
    vi.useFakeTimers()
    const lenta = (lista: Tarefa[]) => new Promise<Tarefa[]>((pronto) => setTimeout(() => pronto(lista), 2000))
    chamadas.fila
      .mockResolvedValueOnce([tarefa({ estado: 'separando', progresso: 0.1 })])
      .mockImplementationOnce(() => lenta([tarefa({ estado: 'separando', progresso: 0.6 })]))
      .mockImplementation(() => lenta([tarefa({ estado: 'separando', progresso: 0.7 })]))
    render(<TelaInicio />)
    await esperar()
    await esperar(1500) // sai a 2ª consulta, que leva 2 s
    await esperar(1500)
    expect(chamadas.fila).toHaveBeenCalledTimes(2) // nada sobreposto
    await esperar(500)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')
  })

  it('tira da fila e mostra o erro da tarefa', async () => {
    chamadas.fila.mockResolvedValueOnce([
      tarefa({ id: 't1', estado: 'erro', erro: 'Vídeo indisponível.' }),
      tarefa({ id: 't2', titulo: 'Yesterday', estado: 'pronta', progresso: 1 }),
    ])
    chamadas.fila.mockResolvedValue([tarefa({ id: 't2', titulo: 'Yesterday', estado: 'pronta', progresso: 1 })])
    chamadas.esquecerTarefa.mockResolvedValue(undefined)
    const usuario = userEvent.setup()
    render(<TelaInicio />)

    expect(await screen.findByText('Vídeo indisponível.')).toBeInTheDocument()
    expect(screen.getByText('Erro')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Tirar Help! da fila' }))
    expect(chamadas.esquecerTarefa).toHaveBeenCalledWith('t1')
    await waitFor(() => expect(screen.queryByText('Vídeo indisponível.')).not.toBeInTheDocument())
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
  })

  it('mostra a mensagem quando o backend recusa (409)', async () => {
    chamadas.fila.mockResolvedValue([tarefa({ estado: 'na fila' })])
    chamadas.esquecerTarefa.mockRejectedValue(new ErroApi(409, 'A tarefa já começou e não pode ser removida.'))
    const usuario = userEvent.setup()
    render(<TelaInicio />)
    await usuario.click(await screen.findByRole('button', { name: 'Tirar Help! da fila' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A tarefa já começou e não pode ser removida.')
  })

  it('a fila some quando está vazia', async () => {
    render(<TelaInicio />)
    await screen.findByText(/Nenhuma música ainda/)
    expect(screen.queryByRole('heading', { name: 'Fila' })).not.toBeInTheDocument()
  })
})

describe('minhas músicas', () => {
  it('lista com link, tom e letra', async () => {
    chamadas.musicas.mockResolvedValue([
      musica(),
      musica({ id: '0123456789ab', titulo: 'Yesterday', tom: null, escala: null, tem_letra: false, letra_id: undefined }),
    ])
    render(<TelaInicio />)
    expect(await screen.findByRole('link', { name: 'Help!' })).toHaveAttribute('href', '#/musica/abcdef123456')
    expect(screen.getByText('A maior · com letra')).toBeInTheDocument()
    expect(screen.getByText('tom desconhecido · sem letra')).toBeInTheDocument()
  })

  it('explica o que fazer quando não há músicas', async () => {
    render(<TelaInicio />)
    expect(await screen.findByText(/Busque uma música acima/)).toBeInTheDocument()
  })

  it('ouve a prévia de novo a partir de um terço da música', async () => {
    chamadas.musicas.mockResolvedValue([musica({ duracao: 150 })])
    const usuario = userEvent.setup()
    render(<TelaInicio />)
    await usuario.click(await screen.findByRole('button', { name: 'Ouvir a prévia de Help!' }))
    expect(screen.getByTitle('Prévia de Help!')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/2Q_ZzBGPdqE?start=50&end=65&autoplay=1',
    )
  })

  it('música baixada toca a prévia do próprio arquivo original', async () => {
    chamadas.musicas.mockResolvedValue([
      musica({ duracao: 150, faixas: [{ nome: 'original', arquivo: 'original.wav', volume: 0 }] }),
    ])
    const usuario = userEvent.setup()
    render(<TelaInicio />)
    await usuario.click(await screen.findByRole('button', { name: 'Ouvir a prévia de Help!' }))
    expect(screen.getByLabelText('Prévia de Help!')).toHaveAttribute('src', expect.stringMatching(/\/faixas\/original\.wav$/))
    expect(screen.queryByTitle('Prévia de Help!')).not.toBeInTheDocument()
  })

  it('apaga depois de confirmar', async () => {
    chamadas.musicas.mockResolvedValue([musica()])
    chamadas.apagarMusica.mockResolvedValue(undefined)
    const confirmar = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirmar)
    const usuario = userEvent.setup()
    render(<TelaInicio />)
    const botao = await screen.findByRole('button', { name: 'Apagar Help!' })

    await usuario.click(botao)
    expect(confirmar).toHaveBeenCalledWith('Apagar "Help!"? As faixas separadas também serão apagadas.')
    expect(chamadas.apagarMusica).not.toHaveBeenCalled()

    await usuario.click(botao)
    expect(chamadas.apagarMusica).toHaveBeenCalledWith('abcdef123456')
    await waitFor(() => expect(chamadas.musicas).toHaveBeenCalledTimes(2))
  })
})

describe('escolher a letra', () => {
  const VERSOES: VersaoLetra[] = [
    { id: 7, titulo: 'Help!', artista: 'The Beatles', album: 'Help!', duracao: 140, sincronizada: true, instrumental: false, diferenca: 0 },
    { id: 9, titulo: 'Help!', artista: 'The Beatles', album: '1', duracao: 142, sincronizada: true, instrumental: false, diferenca: 2 },
    { id: 11, titulo: 'Help', artista: 'Beatles', album: 'Ao vivo', duracao: null, sincronizada: false, instrumental: false, diferenca: null },
  ]

  async function abrir(m = musica()) {
    chamadas.musicas.mockResolvedValue([m])
    const usuario = userEvent.setup()
    render(<TelaInicio />)
    await usuario.click(await screen.findByRole('button', { name: `Escolher a letra de ${m.titulo}` }))
    return { usuario, dialogo: screen.getByRole('dialog', { name: `Letra de ${m.titulo}` }) }
  }

  it('lista as versões e usa a escolhida', async () => {
    chamadas.versoesDaLetra.mockResolvedValue(VERSOES)
    chamadas.escolherLetra.mockResolvedValue([])
    const { usuario, dialogo } = await abrir()

    expect(chamadas.versoesDaLetra).toHaveBeenCalledWith('abcdef123456')
    expect(await within(dialogo).findByText('1 · 2:22 · sincronizada · +2 s')).toBeInTheDocument()
    expect(within(dialogo).getByText('Ao vivo · --:-- · só texto')).toBeInTheDocument()
    // A que está em uso não pode ser escolhida de novo
    expect(within(dialogo).getByRole('button', { name: 'Usar a letra de Help! (Help!)' })).toBeDisabled()

    await usuario.click(within(dialogo).getByRole('button', { name: 'Usar a letra de Help! (1)' }))
    expect(chamadas.escolherLetra).toHaveBeenCalledWith('abcdef123456', 9)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(chamadas.musicas).toHaveBeenCalledTimes(2)
  })

  it('tira a letra', async () => {
    chamadas.versoesDaLetra.mockResolvedValue(VERSOES)
    chamadas.apagarLetra.mockResolvedValue(undefined)
    const { usuario, dialogo } = await abrir()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Tirar a letra' }))
    expect(chamadas.apagarLetra).toHaveBeenCalledWith('abcdef123456')
    await waitFor(() => expect(chamadas.musicas).toHaveBeenCalledTimes(2))
  })

  it('o Tab não sai do diálogo', async () => {
    chamadas.versoesDaLetra.mockResolvedValue([])
    const { usuario, dialogo } = await abrir(musica({ tem_letra: false, letra_id: undefined }))
    await within(dialogo).findByText('Nenhuma letra encontrada no LRCLIB.')
    for (let vez = 0; vez < 6; vez++) {
      await usuario.tab()
      expect(dialogo).toContainElement(document.activeElement as HTMLElement)
    }
    await usuario.tab({ shift: true })
    expect(dialogo).toContainElement(document.activeElement as HTMLElement)
  })

  it('avisa quando o LRCLIB não tem nada e fecha com Esc', async () => {
    chamadas.versoesDaLetra.mockResolvedValue([])
    const { usuario, dialogo } = await abrir(musica({ tem_letra: false, letra_id: undefined }))
    expect(await within(dialogo).findByText('Nenhuma letra encontrada no LRCLIB.')).toBeInTheDocument()
    expect(within(dialogo).queryByRole('button', { name: 'Tirar a letra' })).not.toBeInTheDocument()
    await usuario.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mostra o erro', async () => {
    chamadas.versoesDaLetra.mockRejectedValue(new ErroApi(502, 'O LRCLIB não respondeu.'))
    const { usuario, dialogo } = await abrir()
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('O LRCLIB não respondeu.')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('trocar o fundo', () => {
  const CAPAS: Capa[] = [
    { album: 'Help!', artista: 'The Beatles', url: 'https://capas.exemplo/help.jpg' },
    { album: '1', artista: 'The Beatles', url: 'https://capas.exemplo/1.jpg' },
  ]

  async function abrir(m = musica()) {
    chamadas.musicas.mockResolvedValue([m])
    chamadas.capas.mockResolvedValue(CAPAS)
    chamadas.definirFundo.mockImplementation(async (_id, fundo) => fundo)
    const usuario = userEvent.setup()
    render(<TelaInicio />)
    await usuario.click(await screen.findByRole('button', { name: `Trocar a imagem de fundo de ${m.titulo}` }))
    const dialogo = screen.getByRole('dialog', { name: `Fundo de ${m.titulo}` })
    await within(dialogo).findByRole('button', { name: 'Capa de Help!' })
    return { usuario, dialogo }
  }

  it('escolhe uma capa com o desfoque', async () => {
    const { usuario, dialogo } = await abrir()
    const desfoque = within(dialogo).getByRole('slider')
    expect(desfoque).toHaveValue('12')
    expect(desfoque).toHaveAttribute('max', '40')

    await usuario.click(within(dialogo).getByRole('button', { name: 'Capa de 1' }))
    expect(within(dialogo).getByRole('button', { name: 'Capa de 1' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(desfoque, { target: { value: '20' } })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))

    expect(chamadas.definirFundo).toHaveBeenCalledWith('abcdef123456', { url: 'https://capas.exemplo/1.jpg', desfoque: 20 })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(chamadas.musicas).toHaveBeenCalledTimes(2)
  })

  it('aceita um link colado e recusa o que não é https', async () => {
    const { usuario, dialogo } = await abrir(musica({ fundo: { url: null, desfoque: 5 } }))
    expect(within(dialogo).getByRole('slider')).toHaveValue('5')
    const campo = within(dialogo).getByRole('textbox', { name: /cole o link/i })

    await usuario.type(campo, 'http://inseguro.exemplo/a.jpg')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(within(dialogo).getByRole('alert')).toHaveTextContent('https://')
    expect(chamadas.definirFundo).not.toHaveBeenCalled()

    await usuario.clear(campo)
    await usuario.type(campo, 'https://imagens.exemplo/palco.jpg')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(chamadas.definirFundo).toHaveBeenCalledWith('abcdef123456', { url: 'https://imagens.exemplo/palco.jpg', desfoque: 5 })
  })

  it('fica sem imagem', async () => {
    const { usuario, dialogo } = await abrir(musica({ fundo: { url: 'https://capas.exemplo/help.jpg', desfoque: 12 } }))
    expect(within(dialogo).getByRole('button', { name: 'Capa de Help!' })).toHaveAttribute('aria-pressed', 'true')
    await usuario.click(within(dialogo).getByRole('checkbox', { name: 'Sem imagem' }))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(chamadas.definirFundo).toHaveBeenCalledWith('abcdef123456', { url: null, desfoque: 12 })
  })
})
