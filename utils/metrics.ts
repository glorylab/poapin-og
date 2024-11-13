import { Registry, Histogram, Counter, Gauge } from 'prom-client';

export const register = new Registry();

// Duration of OG image generation steps in seconds
export const ogImageGenerationDuration = new Histogram({
    name: 'og_image_generation_duration_seconds',
    help: 'Duration of OG image generation steps in seconds',
    labelNames: ['step', 'address', 'cache_hit', 'status'],
    buckets: [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 0.8, 1, 2, 3, 4, 5, 10],
    registers: [register]
});

// Total number of OG image requests
export const ogImageRequestsTotal = new Counter({
    name: 'og_image_requests_total',
    help: 'Total number of OG image requests',
    labelNames: ['status', 'cache_hit'],
    registers: [register]
});

// Size of generated OG images in bytes
export const ogImageSizeBytes = new Gauge({
    name: 'og_image_size_bytes',
    help: 'Size of generated OG images in bytes',
    labelNames: ['address'],
    registers: [register]
});

// Duration of Cloudflare upload in seconds
export const cloudflareUploadDuration = new Histogram({
    name: 'cloudflare_upload_duration_seconds',
    help: 'Duration of Cloudflare upload in seconds',
    labelNames: ['status', 'address'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [register]
});