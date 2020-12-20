module.exports = {
  plugins: [
    '@babel/plugin-proposal-class-properties',
    ['babel-plugin-trace', { strip: true }]
  ]
}

if (process.env.NODE_ENV === 'test')
  module.exports.presets = [
    ['@babel/env', { targets: { node: 'current' } }],
    '@babel/preset-typescript'
  ]
