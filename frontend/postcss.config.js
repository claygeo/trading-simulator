module.exports = {
  plugins: [
    require('postcss-flexbugs-fixes'),
    require('tailwindcss'),
    require('autoprefixer')({
      flexbox: 'no-2009'
    })
  ]
};