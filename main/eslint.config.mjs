import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    'build',
    'dist',
    'node_modules',
    '**/*.md',
  ],
  rules: {
    'no-console': 'off',
    'node/prefer-global/process': 'off',
  },
})
