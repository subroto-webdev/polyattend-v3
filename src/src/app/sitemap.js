export default function sitemap() {
    return [
        {
            url: 'https://polyattend-system2026.vercel.app',
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 1,
        },
        {
            url: 'https://polyattend-system2026.vercel.app/login',
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.8,
        },
    ];
}