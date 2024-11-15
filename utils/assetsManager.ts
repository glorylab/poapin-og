import fs from 'fs';
import path from 'path';

export class AssetsManager {
    private static instance: AssetsManager;
    private defaultPOAP: Buffer;
    private layer0: Buffer;
    private layer1: Buffer;
    private font: Buffer;

    private constructor() {
        const assetsDir = path.join(process.cwd(), 'assets');
        
        this.defaultPOAP = fs.readFileSync(
            path.join(assetsDir, 'images', 'default-poap.png')
        );
        
        this.layer0 = fs.readFileSync(
            path.join(assetsDir, 'images', 'layer0.jpg')
        );
        
        this.layer1 = fs.readFileSync(
            path.join(assetsDir, 'images', 'layer1.png')
        );
        
        this.font = fs.readFileSync(
            path.join(assetsDir, 'fonts', 'MonaspaceXenon-WideMediumItalic.otf')
        );
    }

    public static getInstance(): AssetsManager {
        if (!AssetsManager.instance) {
            AssetsManager.instance = new AssetsManager();
        }
        return AssetsManager.instance;
    }

    public getDefaultPOAP(): Buffer {
        return this.defaultPOAP;
    }

    public getDefaultLayer0(): Buffer {
        return this.layer0;
    }

    public getLayer1(): Buffer {
        return this.layer1;
    }

    public getFont(): Buffer {
        return this.font;
    }

    public getAsDataUrl(buffer: Buffer, mimeType: string): string {
        const base64 = buffer.toString('base64');
        return `data:${mimeType};base64,${base64}`;
    }
}

export const assetsManager = AssetsManager.getInstance();