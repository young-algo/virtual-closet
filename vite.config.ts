import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const assertPdfEngineIsLazy = (): Plugin => ({
  name: 'assert-pdf-engine-is-lazy',
  generateBundle(_options, bundle) {
    const eagerChunkFileNames = new Set<string>()
    const visitStaticImports = (fileName: string) => {
      if (eagerChunkFileNames.has(fileName)) return
      const output = bundle[fileName]
      if (!output || output.type !== 'chunk') return
      eagerChunkFileNames.add(fileName)
      output.imports.forEach(visitStaticImports)
    }
    Object.values(bundle)
      .filter(output => output.type === 'chunk' && output.isEntry)
      .forEach(output => visitStaticImports(output.fileName))

    const eagerPdfModules = Array.from(eagerChunkFileNames)
      .flatMap(fileName => {
        const output = bundle[fileName]
        return output?.type === 'chunk' ? Object.keys(output.modules) : []
      })
      .filter(moduleId =>
        /[\\/]node_modules[\\/]jspdf[\\/]/.test(moduleId)
        || moduleId.endsWith('/src/features/packing/packingPdf.ts')
      )

    if (eagerPdfModules.length > 0) {
      this.error(
        `Packing PDF code must stay out of entry chunks:\n${eagerPdfModules.join('\n')}`
      )
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), assertPdfEngineIsLazy()],
  // Honor an assigned port (e.g. from a preview harness); default otherwise.
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
})
