import { getPoapsOfAddress } from '../../../../utils/poap';
import { ImageResponse } from '@vercel/og';
import { getFromKV, setToKV } from '../../../../utils/kv';
import { assetsManager } from '../../../../utils/assetsManager';
import type { NextApiRequest, NextApiResponse } from 'next';
import { cloudflareUploadDuration, ogImageGenerationDuration, ogImageRequestsTotal, ogImageSizeBytes } from '../../../../utils/metrics';
import { PerformanceMonitor } from '../../../../utils/performanceMonitor';
import { imageValidator } from '../../../../utils/imageValidator';

const uploadTasks = new WeakMap<Blob, Promise<void>>();

async function uploadToCloudflare(
    imageBlob: Blob,
    address: string,
    monitor: PerformanceMonitor
): Promise<void> {
    monitor.start('total');
    const blobCopy = new Blob([imageBlob], { type: imageBlob.type });
    try {
        monitor.start('uploadToCloudflare');
        const formData = new FormData();
        formData.append('file', blobCopy, `${address}.png`);

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

        cloudflareUploadDuration
            .labels({ status: 'success', address })
            .observe(monitor.getDuration('uploadToCloudflare') / 1000);

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

        uploadTasks.delete(imageBlob);
    } catch (error) {
        monitor.end('total');

        console.error('Background task failed:', error);
        console.log('Failed background task metrics:', monitor.getSummary());

        cloudflareUploadDuration
            .labels({ status: 'error', address })
            .observe(monitor.getDuration('uploadToCloudflare') / 1000);

        uploadTasks.delete(imageBlob);
        throw error;
    } finally {
        URL.revokeObjectURL(URL.createObjectURL(blobCopy));
    }
};

async function streamImageResponse(imageBlob: Blob, res: NextApiResponse) {
    const stream = imageBlob.stream();
    const reader = stream.getReader();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
        }
        res.end();
    } catch (error) {
        reader.releaseLock();
        throw error;
    }
}

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

async function processPoapsWithValidation(poaps: any[], fallbackImageUrl: string) {
    const validatedPoaps = [];

    const processPromises = poaps.map(async (poap) => {
        try {
            const imageUrl = poap.event.image_url;
            const { url: validatedUrl } = await imageValidator.validateAndProcessImage(imageUrl);

            return {
                ...poap,
                event: {
                    ...poap.event,
                    image_url: validatedUrl
                }
            };
        } catch (error) {
            console.error(`Error processing POAP ${poap.tokenId}:`, error);
            return {
                ...poap,
                event: {
                    ...poap.event,
                    image_url: fallbackImageUrl
                }
            };
        }
    });

    const results = await Promise.all(processPromises);
    return results;
}

const POAPImage = ({ key, index, src, alt }) => {
    return (
        <img
            src={src}
            alt={alt}
            width={160}
            height={160}
            onError={(e) => {
                e.currentTarget.src = '/fallback-poap-image.png';
            }}
            key={key}
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
    );
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {

    const { address } = req.query;

    if (!address || Array.isArray(address)) {
        ogImageRequestsTotal.labels({ status: 'error', cache_hit: 'false' }).inc();
        return res.status(400).json({ error: 'Invalid address' });
    }

    const monitor = new PerformanceMonitor(address as string);

    monitor.start('total');

    const resources = {
        backgroundBlob: null as Blob | null,
        ogImage: null as ImageResponse | null,
        responseBlob: null as Blob | null,
        uploadTask: null as Promise<void> | null
    };

    const cleanup = () => {
        if (resources.backgroundBlob) {
            URL.revokeObjectURL(URL.createObjectURL(resources.backgroundBlob));
            resources.backgroundBlob = null;
        }
        if (resources.responseBlob) {
            URL.revokeObjectURL(URL.createObjectURL(resources.responseBlob));
            resources.responseBlob = null;
        }
        resources.ogImage = null;
    };

    try {
        ogImageRequestsTotal.labels({ status: 'pending', cache_hit: 'false' }).inc();

        // Load font
        monitor.start('loadFont');
        const fontData = assetsManager.getFont();
        monitor.end('loadFont');

        // Check cache
        monitor.start('checkCache');
        const cachedImage = await getFromKV(address);
        monitor.end('checkCache');

        if (cachedImage && Date.now() - Number(cachedImage.lastUpdated) < ONE_DAY) {
            ogImageRequestsTotal.labels({ status: 'success', cache_hit: 'true' }).inc();

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

        monitor.start('validateImages');
        const validatedPoaps = await processPoapsWithValidation(
            recentPoaps,
            assetsManager.getAsDataUrl(assetsManager.getDefaultPOAP(), 'image/png')
        );
        monitor.end('validateImages');


        const layer0ImageUrl = latestMoments && latestMoments.length > 0
            ? latestMoments.sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime())[0].medias[0].gateways[0].url
            : assetsManager.getAsDataUrl(assetsManager.getDefaultLayer0(), 'image/jpeg');

        resources.ogImage = await new ImageResponse(
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
                    {validatedPoaps.map((poap, index) => (

                        <POAPImage
                            key={poap.tokenId}
                            index={index}
                            src={poap.event.image_url}
                            alt={poap.event.name} />
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
        resources.responseBlob = await resources.ogImage.blob();
        ogImageSizeBytes.observe(resources.responseBlob.size);
        monitor.end('prepareResponse');

        monitor.start('uploadToCloudflareBackground');
        // Start background upload task with a clone of the response
        resources.backgroundBlob = new Blob([resources.responseBlob], { type: resources.responseBlob.type });

        const uploadTask = uploadToCloudflare(
            new Blob([resources.backgroundBlob], { type: resources.backgroundBlob.type }),
            address as string,
            new PerformanceMonitor(address as string)
        );
        uploadTasks.set(resources.backgroundBlob, uploadTask);

        monitor.end('uploadToCloudflareBackground');

        // End main task
        monitor.end('total');
        ogImageRequestsTotal.labels({ status: 'success', cache_hit: 'false' }).inc();
        console.log('Main task completed:', monitor.getSummary());

        await streamImageResponse(resources.responseBlob, res);
    } catch (error) {
        monitor.setStatus('error');
        monitor.end('total');

        ogImageRequestsTotal.labels({ status: 'error', cache_hit: 'false' }).inc();

        console.error('Error generating OG image:', error);
        console.log(monitor.getSummary());
        return res.status(500).json({ error: 'Failed to generate image' });
    } finally {
        cleanup();
    }
}