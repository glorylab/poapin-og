module.exports = {
    apps: [
        {
            name: 'poap-og',
            script: 'node_modules/next/dist/bin/next',
            args: 'start',
            instances: 1,
            exec_mode: 'cluster',
            watch: false,
            env: {
                PORT: process.env.PORT,
                NODE_ENV: 'production',
                CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
                CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
                CLOUDFLARE_KV_NAMESPACE_ID: process.env.CLOUDFLARE_KV_NAMESPACE_ID,
                CLOUDFLARE_KV_API_TOKEN: process.env.CLOUDFLARE_KV_API_TOKEN,
                POAP_API_KEY: process.env.POAP_API_KEY,
                CRON_SECRET: process.env.CRON_SECRET
            },
        },
    ],
};