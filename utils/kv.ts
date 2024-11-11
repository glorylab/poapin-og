const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;
const CLOUDFLARE_KV_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;

const KV_API_URL = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE_ID}`;

export async function getFromKV(key: string) {
    try {
        const response = await fetch(`${KV_API_URL}/values/${key}`, {
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            },
        });

        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const value = await response.text();
        return value ? JSON.parse(value) : null;
    } catch (error) {
        console.error('Error getting from KV:', error);
        return null;
    }
}

export async function setToKV(key: string, value: any) {
    try {
        const response = await fetch(`${KV_API_URL}/values/${key}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify(value),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        console.error('Error setting to KV:', error);
        throw error;
    }
}