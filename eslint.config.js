import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // An error, not a warning. A missing dependency is not a style question:
      // activeOwnerId was passed to fetchRecipes but left out of this effect's
      // deps, so the "show only this person's recipes" filter silently never
      // refetched. The rule reported it correctly for weeks and CI kept passing,
      // because `npm run lint` exits 0 on warnings.
      'react-hooks/exhaustive-deps': 'error',
    },
  },
])
