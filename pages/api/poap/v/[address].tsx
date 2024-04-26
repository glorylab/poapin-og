import { createClient } from '@vercel/kv';
import { getPoapsOfAddress } from '../../../../utils/poap';
import { ImageResponse } from '@vercel/og';


const font = fetch('https://assets.glorylab.xyz/MonaspaceXenon-WideMediumItalic.otf').then((res) =>
    res.arrayBuffer(),
);

export const config = {
    runtime: 'edge',
};

const kvClient = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

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

export default async function handler(request) {

    try {
        const fontData = await font;
        const address = request.nextUrl.searchParams.get('address');

        if (!address) {
            return new Response('Invalid address', { status: 400 });
        }

        const cachedImage = await kvClient.hgetall(address);

        if (cachedImage && Date.now() - Number(cachedImage.lastUpdated) < ONE_MINUTE) {
            return Response.redirect(cachedImage.url as string);
        }

        let poaps = [];
        let latestMoments = [];

        if (request.method === 'POST') {
            const { poaps: poapsParam, latestMoments: latestMomentsParam, poapapikey } = await request.json();

            if (poapapikey !== process.env.POAP_API_KEY) {
                return new Response('Invalid API key', { status: 401 });
            }

            if (!poapsParam) {
                return new Response('Invalid POAPs data', { status: 400 });
            }

            poaps = poapsParam;
            latestMoments = latestMomentsParam;
            console.log('latestMoments', latestMoments);
        } else if (request.method === 'GET') {
            poaps = await getPoapsOfAddress(address);
        } else {
            return new Response('Invalid method', { status: 405 });
        }

        const recentPoaps = poaps.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()).slice(0, 7);
        recentPoaps.reverse();

        const layer0ImageUrl = latestMoments && latestMoments.length > 0
            ? latestMoments.sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime())[0].medias[0].gateways[0].url
            : 'https://nexus.glorylab.xyz/1/5/layer0_aabdf64adf.jpg';

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
                        src="https://nexus.glorylab.xyz/1/5/layer1_248de33d2e.png"
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

        const formData = new FormData();
        formData.append('file', await ogImage.blob(), `${address}.png`);

        const compressedImageResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            },
            body: formData,
        });

        const responseData = await compressedImageResponse.json();

        if (!responseData.success) {
            console.error('Failed to upload image to Cloudflare:', responseData.errors);
            return new Response('Failed to generate image', { status: 500 });
        }

        const compressedImageUrl = responseData.result.variants[0];

        await kvClient.hset(address, {
            url: compressedImageUrl,
            lastUpdated: Date.now().toString(),
        });

        return Response.redirect(compressedImageUrl);
    } catch (error) {
        console.error('Error generating OG image:', error);
        return new Response('Failed to generate image', { status: 500 });
    }
}