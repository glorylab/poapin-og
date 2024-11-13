import { getPoapsOfAddress } from '../../../../utils/poap';
import { ImageResponse } from '@vercel/og';
import { getFromKV, setToKV } from '../../../../utils/kv';
import { assetsManager } from '../../../../utils/assetsManager';
import type { NextApiRequest, NextApiResponse } from 'next';

class PerformanceMonitor {
    private timers: Map<string, number> = new Map();
    private durations: Map<string, number> = new Map();

    start(label: string) {
        this.timers.set(label, Date.now());
    }

    end(label: string) {
        const startTime = this.timers.get(label);
        if (startTime) {
            const duration = Date.now() - startTime;
            this.durations.set(label, duration);
            this.timers.delete(label);
        }
    }

    getDuration(label: string): number {
        return this.durations.get(label) || 0;
    }

    getSummary(): string {
        let summary = '\nPerformance Summary:\n';
        let total = 0;

        // Exclude total duration
        this.durations.forEach((duration, label) => {
            if (label !== 'total') {
                summary += `${label}: ${duration}ms\n`;
                total += duration;
            }
        });

        const actualTotal = this.durations.get('total') || total;
        summary += `Total Time: ${actualTotal}ms\n`;
        return summary;
    }
}

const uploadToCloudflareBackground = async (imageBlob: Blob, address: string, monitor: PerformanceMonitor) => {
    monitor.start('total');
    try {
        monitor.start('uploadToCloudflare');
        const formData = new FormData();
        formData.append('file', imageBlob, `${address}.png`);

        const compressedImageResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
                },
                body: formData,
            }
        );

        const responseData = await compressedImageResponse.json();
        monitor.end('uploadToCloudflare');

        if (!responseData.success) {
            throw new Error('Failed to upload to Cloudflare');
        }

        monitor.start('saveCache');
        await setToKV(address, {
            url: responseData.result.variants[0],
            lastUpdated: Date.now().toString(),
        });
        monitor.end('saveCache');

        monitor.end('total');
        console.log('Background task completed:', monitor.getSummary());
    } catch (error) {
        monitor.end('total');
        console.error('Background task failed:', error);
        console.log('Failed background task metrics:', monitor.getSummary());
    }
};

export const config = {
    api: {
        responseLimit: false,
        bodyParser: {
            sizeLimit: '4mb',
        },
    },
};

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

const recentPoapsPositions = [
    { x: 310, y: 435 },
    { x: 380, y: 415 },
    { x: 450, y: 435 },
    { x: 520, y: 415 },
    { x: 590, y: 395 },
    { x: 660, y: 415 },
    { x: 730, y: 435 },
];

interface CachedImage {
    url: string;
    lastUpdated: string;
}

const TIMEOUT_MS = 5000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

    const monitor = new PerformanceMonitor();
    monitor.start('total');

    try {
        // Load font
        monitor.start('loadFont');
        const fontData = assetsManager.getFont();
        monitor.end('loadFont');

        const { address } = req.query;

        if (!address || Array.isArray(address)) {
            return res.status(400).json({ error: 'Invalid address' });
        }

        // Check cache
        monitor.start('checkCache');
        const cachedImage = await getFromKV(address);
        monitor.end('checkCache');

        if (cachedImage && Date.now() - Number(cachedImage.lastUpdated) < ONE_DAY) {
            monitor.end('total');
            console.log(monitor.getSummary());
            return res.redirect(cachedImage.url);
        }

        let poaps = [];
        let latestMoments = [];

        // Get data
        monitor.start('getData');
        if (req.method === 'POST') {
            const { poaps: poapsParam, latestMoments: latestMomentsParam, poapapikey } = req.body;

            if (poapapikey !== process.env.POAP_API_KEY) {
                return res.status(401).json({ error: 'Invalid API key' });
            }

            if (!poapsParam) {
                return res.status(400).json({ error: 'Invalid POAPs data' });
            }

            poaps = poapsParam;
            latestMoments = latestMomentsParam;
            console.log('latestMoments', latestMoments);
        } else if (req.method === 'GET') {
            poaps = await getPoapsOfAddress(address);
        } else {
            return res.status(405).json({ error: 'Method not allowed' });
        }
        monitor.end('getData');

        // Generate image
        monitor.start('generateImage');
        const recentPoaps = poaps.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()).slice(0, 7);
        recentPoaps.reverse();

        const layer0ImageUrl = latestMoments && latestMoments.length > 0
            ? latestMoments.sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime())[0].medias[0].gateways[0].url
            : assetsManager.getAsDataUrl(assetsManager.getDefaultLayer0(), 'image/jpeg');

        const ogImage = await new ImageResponse(
            (
                <div
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {/* Layer 0 */}
                    <img
                        src={layer0ImageUrl}
                        alt="Background Layer 0"
                        style={{ position: 'absolute', objectFit: 'cover', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
                    />

                    {/* POAP images */}
                    {recentPoaps.map((poap, index) => (
                        <img
                            key={poap.tokenId}
                            src={poap.event.image_url}
                            alt={poap.event.name}
                            style={{
                                position: 'absolute',
                                left: recentPoapsPositions[index].x,
                                top: recentPoapsPositions[index].y,
                                width: 160,
                                height: 160,
                                borderRadius: '50%',
                                border: '2px solid #FF9400',
                                boxShadow: '0 8px 12px rgba(0, 0, 0, 0.8)',
                                objectFit: 'cover',
                                imageRendering: 'pixelated',
                                zIndex: 1,
                            }}
                        />
                    ))}

                    {/* Layer 1 */}
                    <img
                        src={assetsManager.getAsDataUrl(assetsManager.getLayer1(), 'image/png')}
                        alt="Background Layer 1"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2 }}
                    />

                    {/* Address */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 545,
                            bottom: 0,
                            fontFamily: 'MonaspaceXenon',
                            left: 475,
                            right: 180,
                            height: 93,
                            fontSize: '42px',
                            fontWeight: 'thin',
                            color: 'white',
                            textAlign: 'right',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            letterSpacing: '-0.1em',
                            zIndex: 3,
                            display: 'flex',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                        }}
                    >
                        <span
                            style={{
                                minWidth: '100%',
                                textAlign: 'right',
                                paddingLeft: '20px',
                                boxSizing: 'border-box',
                                lineHeight: '93px',
                            }}
                        >
                            {address.length > 32 ? `${address.slice(0, 16)}...${address.slice(-16)}` : address}
                        </span>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
                fonts: [
                    {
                        name: 'MonaspaceXenon',
                        data: fontData,
                        style: 'italic',
                        weight: 500,
                    },
                ],
            },
        );
        
        monitor.end('generateImage');

        // Clone response immediately to avoid multiple reads
        monitor.start('prepareResponse');
        const responseBlob = await ogImage.blob();
        monitor.end('prepareResponse');

        monitor.start('uploadToCloudflareBackground');
        // Start background upload task with a clone of the response
        const backgroundBlob = new Blob([responseBlob], { type: responseBlob.type });

        setImmediate(() => {
            uploadToCloudflareBackground(backgroundBlob, address as string, new PerformanceMonitor())
                .catch(console.error);
        });
        monitor.end('uploadToCloudflareBackground');

        // End main task
        monitor.end('total');
        console.log('Main task completed:', monitor.getSummary());

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        // Convert blob to buffer and send
        const arrayBuffer = await responseBlob.arrayBuffer();
        return res.send(Buffer.from(arrayBuffer));
    } catch (error) {
        monitor.end('total');
        console.error('Error generating OG image:', error);
        console.log(monitor.getSummary());
        return res.status(500).json({ error: 'Failed to generate image' });
    }
}