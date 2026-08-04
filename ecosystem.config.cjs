module.exports = {
  apps: [
    {
      name: 'trackscooter-api',
      script: 'server/server.js',
      cwd: '/var/www/track-scooter',
      env: {
        NODE_ENV: 'production',
        PORT: 3005
      },
      watch: false,
      max_memory_restart: '300M'
    }
  ]
}
