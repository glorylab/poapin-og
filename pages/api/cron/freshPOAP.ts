import { createClient } from '@vercel/kv';

const kvClient = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const initialDate = new Date('2024-05-13T17:00:00Z');
initialDate.setUTCHours(initialDate.getUTCHours() + 9);
const INITIAL_TIMESTAMP = Math.floor(initialDate.getTime() / 1000);

export default async function handler(req, res) {

  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  if (req.method === 'POST') {
    try {
      const lastUpdateTimestamp = await kvClient.get('lastUpdateTimestampOfPOAP') || INITIAL_TIMESTAMP;
      const currentTimestamp = Math.floor(Date.now() / 1000);

      const query = `
        query {
          poaps(where: { minted_on: { _gte: ${lastUpdateTimestamp}, _lte: ${currentTimestamp} } }) {
            minted_on
            collector_address
          }
        }
      `;

      const response = await fetch('https://public.compass.poap.tech/v1/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const { data } = await response.json();
      const poaps = data.poaps;

      const uniqueAddresses: string[] = Array.from(new Set(poaps.map((poap: any) => poap.collector_address)));

      for (const address of uniqueAddresses) {
        await fetch(`/api/poap/v/${address}`, { method: 'GET' });
      }

      await kvClient.set('lastUpdateTimestampOfPOAP', currentTimestamp);

      res.status(200).json({ message: 'POAPs updated successfully' });
    } catch (error) {
      console.error('Error updating POAPs:', error);
      res.status(500).json({ message: 'Failed to update POAPs' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}