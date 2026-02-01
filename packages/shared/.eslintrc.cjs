module.exports = {
  extends: [require.resolve('@randombeast/config/eslint/base')],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
