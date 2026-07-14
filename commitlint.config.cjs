/** Conventional Commits — WZ Connect (commit atômico é lei) */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'test',
        'refactor',
        'chore',
        'docs',
        'build',
        'ci',
        'perf',
        'style',
        'revert',
      ],
    ],
  },
};
