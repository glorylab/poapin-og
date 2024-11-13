import { readFileSync } from 'fs';
import path from 'path';

class AssetsManager {
    private static instance: AssetsManager;
    private assets: {
        font?: Buffer;
        layer1?: Buffer;
        defaultLayer0?: Buffer;
    } = {};

    private constructor() {}

    public static getInstance(): AssetsManager {
        if (!AssetsManager.instance) {
            AssetsManager.instance = new AssetsManager();
        }
        return AssetsManager.instance;
    }

    private loadAsset(relativePath: string): Buffer {
        const filePath = path.join(process.cwd(), 'assets', relativePath);
        try {
            return readFileSync(filePath);
        } catch (error) {
            console.error(`Error loading asset: ${filePath}`, error);
            throw new Error(`Failed to load asset: ${filePath}`);
        }
    }

    public getFont(): Buffer {
        if (!this.assets.font) {
            this.assets.font = this.loadAsset('fonts/MonaspaceXenon-WideMediumItalic.otf');
        }
        return this.assets.font;
    }

    public getLayer1(): Buffer {
        if (!this.assets.layer1) {
            this.assets.layer1 = this.loadAsset('images/layer1.png');
        }
        return this.assets.layer1;
    }

    public getDefaultLayer0(): Buffer {
        if (!this.assets.defaultLayer0) {
            this.assets.defaultLayer0 = this.loadAsset('images/layer0.jpg');
        }
        return this.assets.defaultLayer0;
    }

    public getAsDataUrl(buffer: Buffer, mimeType: string): string {
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
}

export const assetsManager = AssetsManager.getInstance();