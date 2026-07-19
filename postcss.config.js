module.exports = {
  plugins: [
    require('./frontend/node_modules/tailwindcss')({ config: './tailwind.config.js' }),
    require('./frontend/node_modules/autoprefixer'),
  ]
}
