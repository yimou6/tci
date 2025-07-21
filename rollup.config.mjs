import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import pkg from './package.json' with { type: 'json' };
import json from '@rollup/plugin-json';

export default defineConfig({
  input: './src/index.ts',
  output: {
    file: pkg.main,
    format: 'cjs',
    sourcemap: false,
  },
  // Bundling all dependencies into the final executable
  // This makes the CLI tool portable and avoids dependency issues on the user's machine.
  // 'ssh2' is included by default since `external` is empty.
  external: [], 
  plugins: [
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: false,
    }),
    nodeResolve({
      preferBuiltins: true, // Important for resolving node built-in modules
    }),
    commonjs(), // Converts CommonJS modules to ES6, for broad compatibility
    terser({
      ecma: 2020,
      compress: {
        drop_console: false, // Set to true to remove console.log statements
      },
      format: {
        comments: false, // Removes all comments
        // The shebang is now handled by the `banner` option in `output`
        shebang: false, 
      },
    }),
  ],
  // Suppress warnings about 'this' being undefined at the top level, common in CLI tools
  onwarn(warning, warn) {
    if (warning.code === 'THIS_IS_UNDEFINED') {
      return;
    }
    warn(warning);
  }
});