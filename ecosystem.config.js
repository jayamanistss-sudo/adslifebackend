module.exports = {
  apps: [{
    name: 'adslife-backend',
    script: 'dist/main.js',
    cwd: '/var/www/adslife-backend',
    instances: 'max',
    exec_mode: 'cluster',
    env_file: '.env',
    max_memory_restart: '512M',
    error_file: '/var/log/adslife/error.log',
    out_file:   '/var/log/adslife/out.log',
    merge_logs: true,
    restart_delay: 3000,
    watch: false,
  }],
};
