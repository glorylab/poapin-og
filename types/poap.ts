export interface POAPEvent {
    id: number;
    fancy_id: string;
    name: string;
    event_url: string;
    image_url: string;
    country: string;
    city: string;
    description: string;
    year: number;
    start_date: string;
    end_date: string;
    expiry_date: string;
    supply: number;
}

export interface POAP {
    event: POAPEvent;
    tokenId: string;
    owner: string;
    chain: string;
    created: string;
}

export interface POAPDetail {
    event: POAPEvent;
    tokenId: string;
    owner: string;
    layer: string;
    created: string;
    supply: {
        total: number;
        order: number;
    };
}

export interface POAPActivity {
    created: string;
    id: string;
    owner: {
        id: string;
        tokensOwned: number;
        ens: string;
    };
    transferCount: string;
}