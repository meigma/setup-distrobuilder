// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const trimTrailingWhitespace = {
  name: 'trim-trailing-whitespace',
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk') {
        output.code = output.code.replace(/[\t ]+$/gmu, '')
      }
    }
  }
}

const config = {
  input: 'src/index.ts',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    sourcemap: true
  },
  plugins: [
    typescript(),
    nodeResolve({ preferBuiltins: true }),
    // json() runs before commonjs() so `.json` imports pulled in by CommonJS
    // dependencies (for example @actions/cache reading its own package.json) are
    // converted to modules instead of being handed to the commonjs parser.
    json(),
    commonjs(),
    trimTrailingWhitespace
  ]
}

export default config
