import { POAP } from "../types/poap";

export async function getPoapsOfAddress(address: string): Promise<POAP[]> {
    const apiKey = process.env.POAP_API_KEY;
    if (!apiKey) {
      throw new Error('API key not found');
    }
  
    const res = await fetch(`https://api.poap.tech/actions/scan/${address}`, {
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
        charset: 'utf-8',
      },
    });
  
    if (!res.ok) {
      throw new Error('Failed to fetch POAPs');
    }
  
    const data = await res.json();
    return data;
  }