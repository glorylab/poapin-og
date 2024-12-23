import { getFromKV, setToKV } from '../../../utils/kv';

const initialDate = new Date('2024-05-13T17:00:00Z');
initialDate.setUTCHours(initialDate.getUTCHours() + 9);
const INITIAL_TIMESTAMP = Math.floor(initialDate.getTime() / 1000);

function sendRequest(address) {
  fetch(`https://og.poap.in/api/poap/v/${address}`, { method: 'GET' })
    .then(response => console.log(`fetch: ${address}`))
    .catch(error => console.error(`Failed to send request to ${address}: ${error}`));
}

export default async function handler(req, res) {

  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  if (req.method === 'GET') {
    try {
      const lastUpdateTimestamp = await getFromKV('lastUpdateTimestampOfPOAP') || INITIAL_TIMESTAMP;
      const currentTimestamp = Math.floor(Date.now() / 1000);
      console.info('Last update timestamp:', lastUpdateTimestamp);

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

      console.info('POAPs:', poaps);

      const uniqueAddresses: string[] = Array.from(new Set(poaps.map((poap: any) => poap.collector_address)));
      console.info('Unique addresses:', uniqueAddresses);

      for (const address of uniqueAddresses) {
        // Wait 10 milliseconds before sending the next request
        setTimeout(() => sendRequest(address), 10);
      }

      await setToKV('lastUpdateTimestampOfPOAP', currentTimestamp);
      console.info('lastUpdateTimestampOfPOAP:', currentTimestamp);

      res.status(200).json({ message: 'POAPs updated successfully' });
    } catch (error) {
      console.error('Error updating POAPs:', error);
      res.status(500).json({ message: 'Failed to update POAPs' });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
