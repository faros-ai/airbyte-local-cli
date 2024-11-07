module.exports = {
  root: true,
  extends: 'faros',
  ignorePatterns: ['.eslintrc.js', '/lib/'],
  rules: {
    'max-len': ['error', {code: 120}],
  },
};
