import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Desmonta o que cada teste desenhou, para um teste não enxergar a tela do outro.
afterEach(() => {
  cleanup()
  // O que uma tela guardou no navegador (ex.: a última aba) não vaza para o próximo teste.
  localStorage.clear()
})
