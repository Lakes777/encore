import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ErroApi } from '../src/logica/api.ts'
import type { Capa, Musica, ResultadoBusca, Sistema, Tarefa, VersaoLetra } from '../src/logica/tipos.ts'
import { SAIDA_DA_ABA, TelaInicio } from '../src/telas/TelaInicio.tsx'

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
  modo_reserva: 'rapido',
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
    tipo: null,
    estimativas: { pronta: 180, rapido: 50, qualidade: 1300 },
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
    aviso: null,
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
  render(<TelaInicio aba="buscar" />)
  await usuario.type(screen.getByRole('searchbox', { name: /nome da música/i }), texto)
  await usuario.click(screen.getByRole('button', { name: 'Buscar' }))
  return usuario
}

describe('abas', () => {
  it('mostra só a aba aberta, com o item do menu marcado', async () => {
    render(<TelaInicio aba="buscar" />)
    expect(screen.getByRole('heading', { name: 'Buscar' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Minhas músicas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Fila' })).not.toBeInTheDocument()
    const menu = screen.getByRole('navigation', { name: 'Seções' })
    expect(within(menu).getByRole('link', { name: 'Buscar' })).toHaveAttribute('aria-current', 'page')
    expect(within(menu).getByRole('link', { name: 'Minhas músicas' })).toHaveAttribute('href', '#/musicas')
    expect(within(menu).getByRole('link', { name: 'Minhas músicas' })).not.toHaveAttribute('aria-current')
  })

  it('ao trocar, a aba anterior sai, a nova entra com o foco no título e a busca continua lá', async () => {
    chamadas.buscar.mockResolvedValue([resultado()])
    const usuario = userEvent.setup()
    const { rerender } = render(<TelaInicio aba="buscar" />)
    await usuario.type(screen.getByRole('searchbox', { name: /nome da música/i }), 'help')
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }))
    await screen.findByRole('heading', { name: 'Help! (Remastered 2009)' })

    rerender(<TelaInicio aba="fila" />)
    // Durante o fade de saída a aba antiga ainda está lá
    expect(screen.getByRole('heading', { name: 'Buscar' }).closest('.aba-tela')).toHaveClass('aba-tela--saindo')
    const fila = await screen.findByRole('heading', { name: 'Fila' })
    expect(fila).toHaveFocus()
    expect(screen.queryByRole('heading', { name: 'Buscar' })).not.toBeInTheDocument()

    rerender(<TelaInicio aba="buscar" />)
    expect(await screen.findByRole('heading', { name: 'Help! (Remastered 2009)' })).toBeVisible()
    expect(screen.getByRole('searchbox', { name: /nome da música/i })).toHaveValue('help')
  })

  it('voltar para a mesma aba durante o fade continua nela e não fecha a prévia', async () => {
    chamadas.musicas.mockResolvedValue([musica()])
    const usuario = userEvent.setup()
    const { rerender } = render(<TelaInicio aba="musicas" />)
    await usuario.click(await screen.findByRole('button', { name: 'Ouvir a prévia de Help!' }))
    expect(screen.getByLabelText('Prévia de Help!')).toBeInTheDocument()

    // Minhas músicas -> Buscar -> Minhas músicas, antes do fade de saída acabar
    rerender(<TelaInicio aba="buscar" />)
    rerender(<TelaInicio aba="musicas" />)
    await act(() => new Promise((pronto) => setTimeout(pronto, SAIDA_DA_ABA + 100)))
    expect(screen.getByRole('heading', { name: 'Minhas músicas' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Minhas músicas' }).closest('.aba-tela')).toHaveClass('aba-tela--entrando')
    expect(screen.getByLabelText('Prévia de Help!')).toBeInTheDocument()
  })

  it('os erros de rede aparecem em qualquer aba, fora dos painéis', async () => {
    chamadas.musicas.mockRejectedValue(new ErroApi(0, 'O servidor do karaokê não respondeu.'))
    chamadas.fila.mockRejectedValue(new ErroApi(500, 'A fila não respondeu.'))
    render(<TelaInicio aba="buscar" />)
    const alertas = await screen.findAllByRole('alert')
    expect(alertas.map((alerta) => alerta.textContent)).toEqual(['O servidor do karaokê não respondeu.', 'A fila não respondeu.'])
    for (const alerta of alertas) expect(alerta.closest('.aba-tela')).toBeNull()
  })

  it('o contador da Fila mostra quantas estão em preparo', async () => {
    chamadas.fila.mockResolvedValue([
      tarefa({ id: 't1', estado: 'separando' }),
      tarefa({ id: 't2', estado: 'na fila' }),
      tarefa({ id: 't3', estado: 'pronta', progresso: 100 }),
    ])
    render(<TelaInicio />)
    const fila = screen.getByRole('link', { name: /^Fila/ })
    await waitFor(() => expect(fila).toHaveAccessibleName('Fila, 2 em preparo'))
  })
})

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
    // "Na fila" leva para a aba Fila, que conta a música nova
    expect(within(item).getByRole('link', { name: 'Na fila' })).toHaveAttribute('href', '#/fila')
    expect(screen.getByRole('link', { name: /^Fila/ })).toHaveAccessibleName('Fila, 1 em preparo')
    // A tarefa já está na fila (na aba escondida) e a fila é consultada de novo
    const fila = screen.getByRole('heading', { name: 'Fila', hidden: true }).closest('section')!
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

  it('com a versão pronta disponível, ela vem marcada e explica o que faz', async () => {
    chamadas.sistema.mockResolvedValue({ ...SISTEMA, modos: [{ nome: 'pronta', descricao: 'Versão pronta' }, ...SISTEMA.modos] })
    chamadas.buscar.mockResolvedValue([resultado()])
    chamadas.adicionarNaFila.mockResolvedValue(tarefa({ modo: 'pronta' }))
    const usuario = await buscar()
    const item = (await screen.findByRole('heading', { name: 'Help! (Remastered 2009)' })).closest('li')!
    expect(await within(item).findByRole('radio', { name: /Versão pronta/ })).toBeChecked()
    expect(within(item).getByText('até ~3 min')).toBeInTheDocument()
    expect(within(item).getByText(/se nenhum servir, separa com IA \(\s*Rápida\)/)).toBeInTheDocument()
    await usuario.click(within(item).getByRole('button', { name: 'Adicionar' }))
    expect(chamadas.adicionarNaFila).toHaveBeenCalledWith(expect.objectContaining({ modo: 'pronta' }))
  })

  it('avisa nos clipes e nas ao vivo e marca o áudio da música', async () => {
    chamadas.buscar.mockResolvedValue([
      resultado({ tipo: 'audio' }),
      resultado({ id: 'xxxxxxxxxxx', titulo: 'Help! (Official Video)', canal: 'The Beatles', tipo: 'clipe' }),
      resultado({ id: 'yyyyyyyyyyy', titulo: 'Help! (Live)', canal: 'The Beatles', tipo: 'ao_vivo' }),
    ])
    await buscar()
    const audio = (await screen.findByRole('heading', { name: 'Help! (Remastered 2009)' })).closest('li')!
    const clipe = screen.getByRole('heading', { name: 'Help! (Official Video)' }).closest('li')!
    expect(within(audio).getByText(/áudio da música/)).toBeInTheDocument()
    expect(within(audio).queryByText(/Videoclipe/)).not.toBeInTheDocument()
    expect(within(clipe).getByText(/Videoclipe/)).toBeInTheDocument()
    expect(within(clipe).queryByText(/· áudio da música/)).not.toBeInTheDocument()
    const aoVivo = screen.getByRole('heading', { name: 'Help! (Live)' }).closest('li')!
    expect(within(aoVivo).getByText(/^Ao vivo:/)).toBeInTheDocument()
    expect(within(aoVivo).queryByText(/Videoclipe/)).not.toBeInTheDocument()
    expect(within(audio).queryByText(/^Ao vivo:/)).not.toBeInTheDocument()
  })

  it('não avisa sobre o modo Alta quando tem placa de vídeo', async () => {
    chamadas.sistema.mockResolvedValue({ ...SISTEMA, dispositivo: 'cuda', modo_padrao: 'qualidade' })
    chamadas.buscar.mockResolvedValue([resultado()])
    await buscar()
    expect(await screen.findByRole('radio', { name: /Alta/ })).toBeChecked()
    expect(screen.queryByText(/Sem placa de vídeo/)).not.toBeInTheDocument()
  })

  it('apagar o texto some com os resultados e a prévia', async () => {
    chamadas.buscar.mockResolvedValue([resultado()])
    const usuario = await buscar()
    await usuario.click(await screen.findByRole('button', { name: 'Prévia' }))
    expect(screen.getByLabelText(/Prévia de Help!/)).toBeInTheDocument()

    await usuario.clear(screen.getByRole('searchbox'))
    expect(screen.queryByRole('heading', { name: 'Help! (Remastered 2009)' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Prévia de Help!/)).not.toBeInTheDocument()
  })

  it('a resposta de uma busca apagada não aparece depois', async () => {
    let responder: (lista: ResultadoBusca[]) => void = () => {}
    chamadas.buscar.mockReturnValue(new Promise((pronto) => (responder = pronto)))
    const usuario = await buscar()
    await usuario.clear(screen.getByRole('searchbox'))
    await act(async () => responder([resultado()]))
    expect(screen.queryByRole('heading', { name: 'Help! (Remastered 2009)' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeDisabled() // campo vazio
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
    // O áudio vem do nosso servidor; o link leva ao mesmo ponto no YouTube
    expect(screen.getByLabelText('Prévia de Help! (Remastered 2009)')).toHaveAttribute('src', '/api/previa/2Q_ZzBGPdqE')
    expect(screen.getByRole('link', { name: 'Abrir no YouTube' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=2Q_ZzBGPdqE&t=46s',
    )

    await usuario.click(segunda)
    expect(screen.queryByLabelText('Prévia de Help! (Remastered 2009)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Prévia de Outra')).toHaveAttribute('src', '/api/previa/xxxxxxxxxxx')

    await usuario.click(screen.getByRole('button', { name: 'Fechar a prévia' }))
    expect(screen.queryByLabelText(/Prévia de/)).not.toBeInTheDocument()
  })
})

describe('fila', () => {
  // Deixa as promessas resolverem e os efeitos rodarem com o relógio falso.
  const esperar = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))

  it('mostra o título limpo, com o original no title, e a miniatura do vídeo', async () => {
    chamadas.fila.mockResolvedValue([
      tarefa({ id_video: '7QU1nvuxaMA', titulo: 'Audioslave - Like a Stone (Official Video)', titulo_limpo: 'Like a Stone', estado: 'erro', erro: 'x' }),
    ])
    render(<TelaInicio aba="fila" />)
    const titulo = await screen.findByRole('heading', { name: 'Like a Stone' })
    expect(titulo).toHaveAttribute('title', 'Audioslave - Like a Stone (Official Video)')
    const fila = titulo.closest('section')!
    expect(within(fila).getByRole('button', { name: 'Tirar Like a Stone da fila' })).toBeInTheDocument()
    expect(within(fila).getByTestId('capa').querySelector('img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/7QU1nvuxaMA/hqdefault.jpg')
  })

  it('mostra o progresso, consulta de novo e recarrega as músicas quando fica pronta', async () => {
    vi.useFakeTimers()
    chamadas.fila
      .mockResolvedValueOnce([tarefa({ estado: 'separando', progresso: 0.45, modo: 'qualidade' })])
      .mockResolvedValue([tarefa({ estado: 'pronta', progresso: 1, modo: 'qualidade' })])
    render(<TelaInicio aba="fila" />)
    await esperar()

    const fila = screen.getByRole('heading', { name: 'Fila' }).closest('section')!
    expect(within(fila).getByText('Separando as vozes')).toBeInTheDocument()
    expect(within(fila).getByText(/45% · Alta/)).toBeInTheDocument()
    expect(within(fila).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '45')
    // Rodando: o X cancela em vez de tirar
    expect(within(fila).queryByRole('button', { name: /Tirar/ })).not.toBeInTheDocument()
    expect(within(fila).getByRole('button', { name: 'Cancelar Help!' })).toBeInTheDocument()
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
    const { unmount } = render(<TelaInicio aba="fila" />)
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
    render(<TelaInicio aba="fila" />)
    await esperar()
    await esperar(1500) // sai a 2ª consulta, que leva 2 s
    await esperar(1500)
    expect(chamadas.fila).toHaveBeenCalledTimes(2) // nada sobreposto
    await esperar(500)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')
  })

  it('mostra a procura da versão pronta e o aviso quando caiu na separação', async () => {
    chamadas.fila.mockResolvedValue([
      tarefa({ id: 't1', modo: 'pronta', estado: 'procurando versão pronta', progresso: 0.2 }),
      tarefa({ id: 't2', titulo: 'Yellow', estado: 'separando', progresso: 0.6, aviso: 'Nenhuma versão pronta serviu; separada com IA (modo Rápida).' }),
    ])
    render(<TelaInicio aba="fila" />)
    expect(await screen.findByText('Procurando versão pronta')).toBeInTheDocument()
    expect(screen.getByText(/20% · Versão pronta/)).toBeInTheDocument()
    expect(screen.getByText('Nenhuma versão pronta serviu; separada com IA (modo Rápida).')).toBeInTheDocument()
  })

  it('tira da fila e mostra o erro da tarefa', async () => {
    chamadas.fila.mockResolvedValueOnce([
      tarefa({ id: 't1', estado: 'erro', erro: 'Vídeo indisponível.' }),
      tarefa({ id: 't2', titulo: 'Yesterday', estado: 'pronta', progresso: 1 }),
    ])
    chamadas.fila.mockResolvedValue([tarefa({ id: 't2', titulo: 'Yesterday', estado: 'pronta', progresso: 1 })])
    chamadas.esquecerTarefa.mockResolvedValue(undefined)
    const usuario = userEvent.setup()
    render(<TelaInicio aba="fila" />)

    expect(await screen.findByText('Vídeo indisponível.')).toBeInTheDocument()
    expect(screen.getByText('Erro')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Tirar Help! da fila' }))
    expect(chamadas.esquecerTarefa).toHaveBeenCalledWith('t1')
    await waitFor(() => expect(screen.queryByText('Vídeo indisponível.')).not.toBeInTheDocument())
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
  })

  it('cancela a música que está sendo preparada, depois de confirmar', async () => {
    chamadas.fila
      .mockResolvedValueOnce([tarefa({ estado: 'separando', progresso: 0.3 })])
      .mockResolvedValueOnce([tarefa({ estado: 'cancelando', progresso: 0.3 })])
    chamadas.esquecerTarefa.mockResolvedValue(undefined)
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const usuario = userEvent.setup()
    render(<TelaInicio aba="fila" />)

    const cancelar = await screen.findByRole('button', { name: 'Cancelar Help!' })
    await usuario.click(cancelar)
    expect(chamadas.esquecerTarefa).not.toHaveBeenCalled()

    await usuario.click(cancelar)
    expect(confirmar).toHaveBeenCalledTimes(2)
    expect(chamadas.esquecerTarefa).toHaveBeenCalledWith('t1')
    // Fica na lista como "Cancelando", sem botão, até o backend tirar
    expect(await screen.findByText('Cancelando')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cancelar|Tirar/ })).not.toBeInTheDocument()
    confirmar.mockRestore()
  })

  it('tirar da fila uma que ainda espera não pede confirmação e mostra o erro do backend', async () => {
    chamadas.fila.mockResolvedValue([tarefa({ estado: 'na fila' })])
    chamadas.esquecerTarefa.mockRejectedValue(new ErroApi(404, 'Essa tarefa não está na fila.'))
    const confirmar = vi.spyOn(window, 'confirm')
    const usuario = userEvent.setup()
    render(<TelaInicio aba="fila" />)
    await usuario.click(await screen.findByRole('button', { name: 'Tirar Help! da fila' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Essa tarefa não está na fila.')
    expect(confirmar).not.toHaveBeenCalled()
    confirmar.mockRestore()
  })

  it('vazia, explica o que fazer e leva para a busca', async () => {
    render(<TelaInicio aba="fila" />)
    const vazio = (await screen.findByText('Nada na fila.')).closest('div')!
    expect(within(vazio).getByRole('link', { name: 'Buscar' })).toHaveAttribute('href', '#/buscar')
    // Sem nada em preparo, a aba não mostra contador
    expect(screen.getByRole('link', { name: 'Fila' })).toBeInTheDocument()
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

  it('mostra o título limpo, com o original no title, e usa ele nos botões', async () => {
    chamadas.musicas.mockResolvedValue([
      musica({ titulo: 'Avenged Sevenfold - Bat Country [Official Music Video]', titulo_limpo: 'Bat Country', artista: 'Avenged Sevenfold' }),
    ])
    render(<TelaInicio />)
    const link = await screen.findByRole('link', { name: 'Bat Country' })
    expect(link).toHaveAttribute('title', 'Avenged Sevenfold - Bat Country [Official Music Video]')
    expect(screen.getByRole('button', { name: 'Apagar Bat Country' })).toBeInTheDocument()
    expect(screen.getByLabelText('1 música')).toHaveTextContent('1')
  })

  it('capa: o fundo escolhido, senão a miniatura do YouTube, senão um bloco neutro', async () => {
    chamadas.musicas.mockResolvedValue([
      musica({ fundo: { url: 'https://capas.exemplo/help.jpg', desfoque: 12 } }),
      musica({ id: '0123456789ab', titulo: 'Yesterday', id_video: 'Ho2e3Ylq3pA' }),
      musica({ id: '0123456789ac', titulo: 'Sem vídeo', id_video: '' }),
    ])
    render(<TelaInicio />)
    await screen.findByRole('link', { name: 'Yesterday' })
    const capas = screen.getAllByTestId('capa')
    expect(capas[0].querySelector('img')).toHaveAttribute('src', 'https://capas.exemplo/help.jpg')
    expect(capas[1].querySelector('img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/Ho2e3Ylq3pA/hqdefault.jpg')
    expect(capas[2].querySelector('img')).toBeNull()
    // Imagem quebrada vira o bloco neutro
    fireEvent.error(capas[1].querySelector('img')!)
    expect(screen.getAllByTestId('capa')[1].querySelector('img')).toBeNull()
  })

  it('mostra que está carregando enquanto a lista não chega', async () => {
    chamadas.musicas.mockReturnValue(new Promise(() => {}))
    render(<TelaInicio />)
    expect(screen.getByRole('status')).toHaveTextContent('Carregando...')
    await waitFor(() => expect(chamadas.fila).toHaveBeenCalled())
  })

  it('marca as músicas com versão pronta', async () => {
    chamadas.musicas.mockResolvedValue([
      musica({
        versao_pronta: { id_video: '7-4qKAseIXQ', titulo: 'Help! (Instrumental)', canal: 'Canal', semelhanca: 0.97, velocidade_corrigida: 0 },
      }),
    ])
    render(<TelaInicio />)
    expect(await screen.findByTitle('Instrumental: Help! (Instrumental) (Canal)')).toHaveTextContent('versão pronta')
  })

  it('mostra quando a música caiu na separação com IA', async () => {
    chamadas.musicas.mockResolvedValue([musica({ aviso: 'Nenhuma versão pronta serviu; separada com IA (modo Rápida).' })])
    render(<TelaInicio />)
    expect(await screen.findByTitle(/Nenhuma versão pronta serviu/)).toHaveTextContent('sem versão pronta')
  })

  it('explica o que fazer quando não há músicas', async () => {
    render(<TelaInicio />)
    expect(await screen.findByText(/Busque uma música e adicione na fila/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buscar uma música' })).toHaveAttribute('href', '#/buscar')
  })

  it('sem a faixa original, a prévia vem do YouTube pelo servidor, a partir de um terço', async () => {
    chamadas.musicas.mockResolvedValue([musica({ duracao: 150 })])
    const usuario = userEvent.setup()
    render(<TelaInicio />)
    await usuario.click(await screen.findByRole('button', { name: 'Ouvir a prévia de Help!' }))
    expect(screen.getByLabelText('Prévia de Help!')).toHaveAttribute('src', '/api/previa/2Q_ZzBGPdqE')
    expect(screen.getByRole('link', { name: 'Abrir no YouTube' })).toHaveAttribute('href', expect.stringContaining('t=50s'))
  })

  it('música baixada toca a prévia do próprio arquivo original', async () => {
    chamadas.musicas.mockResolvedValue([
      musica({ duracao: 150, faixas: [{ nome: 'original', arquivo: 'original.wav', volume: 0 }] }),
    ])
    const usuario = userEvent.setup()
    render(<TelaInicio />)
    await usuario.click(await screen.findByRole('button', { name: 'Ouvir a prévia de Help!' }))
    expect(screen.getByLabelText('Prévia de Help!')).toHaveAttribute('src', expect.stringMatching(/\/faixas\/original\.wav$/))
  })

  it('exporta pelo link do .zip', async () => {
    chamadas.musicas.mockResolvedValue([musica()])
    render(<TelaInicio />)
    const link = await screen.findByRole('link', { name: 'Exportar Help!' })
    expect(link).toHaveAttribute('href', '/api/musicas/abcdef123456/exportar')
    expect(link).toHaveAttribute('download')
  })

  it('importa um .zip e recarrega a lista', async () => {
    chamadas.importarMusica.mockResolvedValue(musica())
    const usuario = userEvent.setup()
    render(<TelaInicio />)
    const arquivo = new File(['zip'], 'Help.karaoke.zip', { type: 'application/zip' })
    await usuario.upload(screen.getByLabelText('Arquivo .zip da música'), arquivo)
    expect(chamadas.importarMusica).toHaveBeenCalledWith(arquivo)
    await waitFor(() => expect(chamadas.musicas).toHaveBeenCalledTimes(2))
  })

  it('música repetida: substitui só se confirmar', async () => {
    const repetida = new ErroApi(409, 'Já existe a música "Help!". Substituir pela do pacote?')
    chamadas.importarMusica.mockRejectedValueOnce(repetida).mockRejectedValueOnce(repetida).mockResolvedValue(musica())
    const confirmar = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirmar)
    const usuario = userEvent.setup()
    render(<TelaInicio />)
    const campo = screen.getByLabelText('Arquivo .zip da música')
    const arquivo = new File(['zip'], 'Help.karaoke.zip', { type: 'application/zip' })

    await usuario.upload(campo, arquivo)
    expect(confirmar).toHaveBeenCalledWith('Já existe a música "Help!". Substituir pela do pacote?')
    expect(chamadas.importarMusica).toHaveBeenCalledTimes(1)

    await usuario.upload(campo, arquivo)
    await waitFor(() => expect(chamadas.importarMusica).toHaveBeenLastCalledWith(arquivo, true))
    await waitFor(() => expect(chamadas.musicas).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('mostra o erro da importação', async () => {
    chamadas.importarMusica.mockRejectedValue(new ErroApi(422, 'O arquivo enviado não é um .zip válido.'))
    const usuario = userEvent.setup()
    render(<TelaInicio />)
    await usuario.upload(screen.getByLabelText('Arquivo .zip da música'), new File(['x'], 'x.zip'))
    expect(await screen.findByRole('alert')).toHaveTextContent('O arquivo enviado não é um .zip válido.')
    expect(screen.getByRole('button', { name: 'Importar' })).toBeEnabled()
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
