import { ImageResponse } from '@vercel/og';
import { getPoapsOfAddress } from '../../../../utils/poap';

const font = fetch(new URL('../../../../assets/MonaspaceXenon-WideMediumItalic.otf', import.meta.url)).then(
    (res) => res.arrayBuffer()
)

export const config = {
    runtime: 'edge',
};

const recentPoapsPositions = [
    { x: 310, y: 435 },
    { x: 380, y: 415 },
    { x: 450, y: 435 },
    { x: 520, y: 415 },
    { x: 590, y: 395 },
    { x: 660, y: 415 },
    { x: 730, y: 435 },
];

export default async function handler(request) {

    const fontData = await font;

    const address = request.nextUrl.searchParams.get('address');
    if (!address) {
        return new Response('Invalid address', { status: 400 });
    }
    const poaps = await getPoapsOfAddress(address);
    const recentPoaps = poaps.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()).slice(0, 7);
    recentPoaps.reverse();

    return new ImageResponse(
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
                    src="https://nexus.glorylab.xyz/1/5/layer0_aabdf64adf.jpg"
                    alt="Background Layer 0"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
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
}