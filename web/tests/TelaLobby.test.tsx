import { act, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App, { SAIDA_DA_TELA } from '../src/App.tsx'
import { api } from '../src/logica/api.ts'
import type { Musica } from '../src/logica/tipos.ts'
import { SAIDA_DA_ABA, TelaInicio } from '../src/telas/TelaInicio.tsx'
import { LINK_GITHUB, TelaLobby } from '../src/telas/TelaLobby.tsx'

// Troca as chamadas de rede por funções falsas; o ErroApi continua o de verdade.
vi.mock('../src/logica/api.ts', async (original) => {
  const modulo = await original<typeof import('../src/logica/api.ts')>()
  const falso = Object.fromEntries(Object.keys(modulo.api).map((nome) => [nome, vi.fn()]))
  return { ...modulo, api: falso }
})

const chamadas = vi.mocked(api)

function musica(id: string): Musica {
  return {
    id,
    id_video: '2Q_ZzBGPdqE',
    titulo: 'Like a Stone',
    artista: 'Audioslave',
    modo: 'rapido',
    duracao: 290,
    tom: 'A',
    escala: 'menor',
    tem_letra: true,
    letra_id: 7,
    faixas: [],
  }
}

beforeEach(() => {
  chamadas.sistema.mockResolvedValue({ dispositivo: 'cpu', modo_padrao: 'rapido', modo_reserva: 'rapido', modos: [] })
  chamadas.fila.mockResolvedValue([])
  chamadas.musicas.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  window.location.hash = ''
})

describe('lobby', () => {
  it('mostra o título, os destaques, o Começar e o link do código', () => {
    render(<TelaLobby prontas={null} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Encore' })).toBeVisible()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('link', { name: /ver o código no github/i })).toHaveAttribute('href', LINK_GITHUB)
    // O toca-discos é decoração: o leitor de tela não o lê
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(document.querySelector('.lobby__toca')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('.lobby__disco')).not.toBeNull()
    // As faixas do lado A são numeradas (o número é enfeite)
    expect(screen.getByText('Voz separada com IA')).toBeVisible()
    expect([...document.querySelectorAll('.lobby__numero')].map((n) => n.textContent)).toEqual(['01', '02', '03'])
  })

  it('com músicas prontas, Começar leva para Minhas músicas e mostra quantas são', () => {
    render(<TelaLobby prontas={2} />)
    expect(screen.getByText('2 músicas prontas para cantar')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Começar' })).toHaveAttribute('href', '#/musicas')
  })

  it('sem nenhuma música, Começar leva para a busca', () => {
    render(<TelaLobby prontas={0} />)
    expect(screen.getByRole('link', { name: 'Começar' })).toHaveAttribute('href', '#/buscar')
    expect(screen.queryByText(/prontas para cantar/)).not.toBeInTheDocument()
  })

  it('enquanto carrega (ou sem servidor), Começar leva para Minhas músicas', () => {
    render(<TelaLobby prontas={null} />)
    expect(screen.getByRole('link', { name: 'Começar' })).toHaveAttribute('href', '#/musicas')
  })

  it('com a aba do navegador escondida, o disco para', () => {
    const escondido = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    try {
      render(<TelaLobby prontas={null} />)
      const lobby = document.querySelector('.lobby')!
      expect(lobby).not.toHaveClass('lobby--pausado')
      escondido.mockReturnValue(true)
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(lobby).toHaveClass('lobby--pausado')
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('lobby como aba do início', () => {
  it('o menu tem Início marcado e só o título do lobby é h1', async () => {
    render(<TelaInicio aba="lobby" />)
    const menu = screen.getByRole('navigation', { name: 'Seções' })
    const links = within(menu).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Início', 'Minhas músicas', 'Buscar', 'Fila'])
    expect(within(menu).getByRole('link', { name: 'Início' })).toHaveAttribute('href', '#/')
    expect(within(menu).getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page')
    const titulos = screen.getAllByRole('heading', { level: 1 })
    expect(titulos).toHaveLength(1)
    expect(titulos[0]).toHaveClass('lobby__titulo')
    // O nome no cabeçalho continua lá (e leva ao lobby), só não é h1
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Encore' })).toHaveAttribute('href', '#/')
    // A contagem vem da lista de músicas do próprio início
    expect(await screen.findByRole('link', { name: 'Começar' })).toHaveAttribute('href', '#/buscar')
  })

  it('nas outras abas o nome do cabeçalho é o h1 e o lobby fica escondido', async () => {
    chamadas.musicas.mockResolvedValue([musica('abcdef123456')])
    render(<TelaInicio aba="musicas" />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Encore' })).toHaveClass('inicio__titulo')
    expect(screen.queryByRole('link', { name: 'Começar' })).not.toBeInTheDocument()
    await screen.findByRole('heading', { name: 'Like a Stone' })
  })
})

describe('rotas do App', () => {
  it.each(['', '#/'])('o lobby aparece no hash "%s", com o menu', async (hash) => {
    window.location.hash = hash
    render(<App />)
    expect(screen.getByRole('link', { name: 'Começar' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Seções' })).getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page')
    await act(async () => {})
  })

  it('ir do lobby para Minhas músicas troca só a aba: o cabeçalho fica', async () => {
    window.location.hash = '#/'
    render(<App />)
    await act(async () => {})
    const cabecalho = screen.getByRole('banner')

    act(() => {
      window.location.hash = '#/musicas'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    // Durante o fade o lobby ainda está lá, saindo; a página inteira não
    expect(screen.getByRole('link', { name: 'Começar' }).closest('.aba-tela')).toHaveClass('aba-tela--saindo')
    expect(screen.getByRole('banner').closest('.tela')).toHaveClass('tela--entrando')
    const titulo = await screen.findByRole('heading', { name: 'Minhas músicas' })
    await waitFor(() => expect(titulo).toHaveFocus())
    expect(screen.queryByRole('link', { name: 'Começar' })).not.toBeInTheDocument()
    // O mesmo cabeçalho de antes (não foi recriado)
    expect(screen.getByRole('banner')).toBe(cabecalho)
    expect(SAIDA_DA_ABA).toBeGreaterThan(0)
  })

  it('ao voltar da música para o início, o foco vai para o título da aba', async () => {
    // A música nunca termina de carregar: a tela fica no "carregando"
    const falsas = chamadas as unknown as Record<string, ReturnType<typeof vi.fn>>
    for (const [nome, falsa] of Object.entries(falsas)) {
      if (!['sistema', 'fila', 'musicas'].includes(nome)) falsa.mockReturnValue(new Promise(() => {}))
    }
    window.location.hash = '#/musica/abcdef123456'
    render(<App />)
    await act(async () => {})

    vi.useFakeTimers()
    act(() => {
      window.location.hash = '#/musicas'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    act(() => {
      vi.advanceTimersByTime(SAIDA_DA_TELA)
    })
    vi.useRealTimers()
    expect(screen.getByRole('heading', { name: 'Minhas músicas' })).toHaveFocus()
  })
})
