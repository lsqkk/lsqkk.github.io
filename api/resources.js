import remoteImport from './_remote-import.js';
import terminalHttp from './_terminal-http.js';
import streamProxy from './_stream-proxy.js';

const handlers = new Map([
    ['remote-import', remoteImport],
    ['terminal-http', terminalHttp],
    ['stream-proxy', streamProxy]
]);

export default function handler(req, res) {
    const route = handlers.get(req.query?.resourceRoute);
    if (!route) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).json({ error: 'Unknown resource route' });
    }
    return route(req, res);
}
