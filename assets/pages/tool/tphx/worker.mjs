import { transformPixels } from './transform.mjs';

self.onmessage = ({ data: { pixels, width, height, settings } }) => {
    try {
        const result = transformPixels(pixels, width, height, settings);
        self.postMessage({ result }, [result]);
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};
