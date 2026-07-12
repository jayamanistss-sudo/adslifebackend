module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules'],
  rules: {
    // This codebase leans on `any` heavily for request/user objects and raw
    // query rows (see e.g. every `@CurrentUser() user: any`) — enforcing
    // this now would mean touching hundreds of call sites unrelated to any
    // real bug. Left off; revisit if the codebase moves to typed request
    // objects.
    '@typescript-eslint/no-explicit-any': 'off',
    // ignoreRestSiblings covers the `const { password_hash, ...safeUser } = user`
    // pattern used to strip sensitive fields before returning a response —
    // the unused destructured var is the point, not a mistake.
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
};
