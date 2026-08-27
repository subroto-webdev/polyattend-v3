export default function robots() {
    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', '/login'],
                disallow: ['/dashboard', '/attendance', '/api', '/admin', '/teacher', '/student'],
            },
        ],
        sitemap: 'https://polyattend-system2026.vercel.app/sitemap.xml',
    };
}