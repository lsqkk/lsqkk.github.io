import { publicResource, publicResourceEndpoint, RelayError } from './_public-resource.js';

const exposed = ['content-type', 'content-length', 'cache-control', 'date', 'etag', 'last-modified', 'location', 'server'];

export default publicResourceEndpoint(async ({ url, method }, res) => {
    const result = await publicResource(url, { method, limit: 1024 * 1024 });
    const data = {
        status: result.status,
        headers: exposed.filter(name => result.headers[name] !== undefined).map(name => [name, result.headers[name]]),
        body: result.body.toString('utf8'),
        url: result.url.href
    };
    if (Buffer.byteLength(JSON.stringify(data)) > 4 * 1024 * 1024) throw new RelayError('响应编码后体积超出限制', 413);
    return res.status(200).json(data);
});
