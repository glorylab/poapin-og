import sharp from 'sharp';
import fetch from 'node-fetch';

interface ImageDimensions {
    width: number;
    height: number;
}

interface ValidatedImage {
    url: string;
    dimensions: ImageDimensions;
}

class ImageValidator {
    private cache = new Map<string, ValidatedImage>();
    private converting = new Map<string, Promise<string>>();

    private async convertWebpToPng(buffer: Buffer): Promise<Buffer> {
        return await sharp(buffer)
            .png()
            .toBuffer();
    }

    private async getImageType(buffer: Buffer): Promise<string> {
        const metadata = await sharp(buffer).metadata();
        return metadata.format || 'unknown';
    }

    private async convertAndStore(url: string, buffer: Buffer): Promise<string> {

        if (this.converting.has(url)) {
            return await this.converting.get(url)!;
        }

        try {
            const convertPromise = (async () => {
                const imageType = await this.getImageType(buffer);
                
                if (imageType === 'webp') {
                    const pngBuffer = await this.convertWebpToPng(buffer);

                    return `data:image/png;base64,${pngBuffer.toString('base64')}`;
                }
                
                return url;
            })();

            this.converting.set(url, convertPromise);
            const result = await convertPromise;
            this.converting.delete(url);
            return result;
        } catch (error) {
            this.converting.delete(url);
            throw error;
        }
    }

    async validateAndProcessImage(url: string): Promise<ValidatedImage> {

        if (this.cache.has(url)) {
            return this.cache.get(url)!;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.statusText}`);
            }

            const buffer = await response.buffer();
            const metadata = await sharp(buffer).metadata();

            if (!metadata.width || !metadata.height) {
                throw new Error('Invalid image metadata');
            }

            const processedUrl = await this.convertAndStore(url, buffer);

            const validatedImage = {
                url: processedUrl,
                dimensions: {
                    width: metadata.width,
                    height: metadata.height
                }
            };

            this.cache.set(url, validatedImage);
            return validatedImage;

        } catch (error) {
            console.error(`Error processing image from ${url}:`, error);
            throw error;
        }
    }

    clearCache() {
        this.cache.clear();
        this.converting.clear();
    }
}

export const imageValidator = new ImageValidator();