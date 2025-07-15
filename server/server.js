//@ts-check

import http from 'http';
import { extname, join as joinPath } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';
import { readFile, writeFile } from 'node:fs/promises';
import { buildController } from './controller.js';

class MainServer {
    /**
     * @typedef {Object} MainServerOptions
     * @property {string} [root]
     * @property {number} [port]
     * @property {string} [staticFolder]
     * @property {ApiController} [apiController]
     */

    /**
     * @param {MainServerOptions} [options]
     */
    constructor({ root, port, staticFolder, apiController } = {}) {
        this.staticFolder = staticFolder || 'public';
        this.root = root || process.cwd();
        this.port = port || 4200;
        this.apiConteoller = apiController;
        this.hotRelaodfile = `hot-reload-${Math.random().toString(36).substring(6)}.js`;
    }

    /**
     * @returns {string}
     */
    get htmlHotReloadWorker() {
        return `onconnect = (e) => {
    const port = e.ports[0];
    const evtSource = new EventSource('http://localhost:8000');
    evtSource.addEventListener('message', (e) => {
        port.postMessage(e.data);
    });
    port.start();
};
`;
    }

    /**
     * @returns {string}
     */
    get htmlHotReloadScript() {
        return `<script>
        const myWorker = new SharedWorker("${this.hotRelaodfile}", {
            name: 'reload-worker',
        });
        myWorker.port.start();
        myWorker.port.onmessage = (e) => {
            if (e.data === 'reload') {
                window.location.reload();
            }
        };
    </script>`;
    }

    /**
     * Starts the HTTP server.
     * @returns {void}
     */
    start() {
        const server = http.createServer(this.serverMainHandler.bind(this));
        // @ts-ignore
        server.listen(parseInt(this.port, 10));
        console.log(
            '\x1b[36m Server running at http://localhost:' +
                this.port +
                '\x1b[0m'
        );
    }

    /**
     * Serves static files or the hot reload worker.
     * @param {import('http').IncomingMessage} request
     * @param {import('http').ServerResponse} response
     * @returns {void}
     */
    staticFileServer(request, response) {
        const url = typeof request.url === 'string' ? request.url : '';
        const basePath = joinPath(this.root, this.staticFolder);
        let filename = joinPath(basePath, url);
        if (url.replace('/', '') === this.hotRelaodfile) {
            response.writeHead(200, { 'Content-Type': 'text/javascript' });
            response.write(this.htmlHotReloadWorker, 'binary');
            response.end();
            return;
        }
        const contentTypesByExtension = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'text/javascript',
            '.json': 'text/json',
            '.svg': 'image/svg+xml',
        };
        // Fix: add index signature to allow string indexing
        /** @type {Record<string, string>} */
        const contentTypes = contentTypesByExtension;
        if (!existsSync(filename)) {
            if (filename.includes('api')) {
                response.writeHead(400, { 'Content-Type': 'text/plain' });
                response.write('API call not found');
                response.end();
                return;
            }
            filename = joinPath(process.cwd(), '/404.html');
        } else if (statSync(filename).isDirectory()) {
            filename += '/index.html';
        }

        try {
            let file = readFileSync(filename, 'binary');
            if (filename.endsWith('.html')) {
                file = file.replace(
                    '</head>',
                    `${this.htmlHotReloadScript}</head>`
                );
            }

            /** @type {import('http').OutgoingHttpHeaders} */
            const headers = {};
            const contentType = contentTypes[extname(filename)];
            if (contentType) {
                headers['Content-Type'] = contentType;
            }
            response.writeHead(200, headers);
            response.write(file, 'binary');
            response.end();
        } catch (err) {
            console.error(err);
            response.writeHead(500, { 'Content-Type': 'text/plain' });
            response.write(err + '\n');
            response.end();
        }
    }

    /**
     * Handles API calls by delegating to the ApiController.
     * @param {import('http').IncomingMessage} request
     * @param {import('http').ServerResponse} response
     * @returns {any}
     */
    apiCallsServer(request, response) {
        if (!this.apiConteoller) {
            return;
        }
        // Defensive: ensure url is always a string for ApiController
        const url = typeof request.url === 'string' ? request.url : '';

        //@ts-expect-error this is a cloned message
        return this.apiConteoller.use({ ...request, url } , response);
    }

    /**
     * Main server handler for all requests.
     * @param {import('http').IncomingMessage} request
     * @param {import('http').ServerResponse} response
     * @returns {Promise<void>}
     */
    async serverMainHandler(request, response) {
        const result = await this.apiCallsServer(request, response);
        if (result && result.handled) {
            return;
        }
        // Fix: pass original request object, not a spread, to staticFileServer
        this.staticFileServer(request, response);
    }
}

/**
 * @typedef {Object} ApiControllerRoute
 * @property {string} route
 * @property {(req: import('http').IncomingMessage, res: import('http').ServerResponse) => void} routeAction
 */

export class ApiController {
    static stateSaveFileName = './server.state.temp';

    /**
     * @param {{initialState?: any, persistState?: boolean }} args
     */
    constructor({ initialState, persistState } = {}) {
        this.persistState = persistState || false;
        /** @type {ApiControllerRoute[]} */
        this.routes = [];
        this.state = initialState || {};
        if (this.persistState) {
            this.tryToLoadState().then();
        }
    }

    /**
     * @param {string} path
     * @param {{ url: string; }} request
     */
    static isRouteMatch(path, request) {
        const pathParts = path.split('/');
        const requestParts = request.url.split('/');
        if (pathParts.length !== requestParts.length) {
            return false;
        }
        return pathParts.every((part, i) => {
            if (part.startsWith(':')) {
                return true;
            }
            return part === requestParts[i];
        });
    }

    /**
     * @param {string} path
     * @param {{ url: string; }} request
     * @returns {Record<string, string>}
     */
    static getVariablesFromPath(path, request) {
        const requestWithoutQuery = request.url.split('?')[0];
        const pathParts = path.split('/');
        const requestParts = requestWithoutQuery.split('/');
        /** @type {Record<string, string>} */
        const variables = {};
        pathParts.forEach((part, i) => {
            if (part.startsWith(':')) {
                variables[part.substring(1)] = requestParts[i] || '';
            }
        });
        return variables;
    }

    async tryToLoadState() {
        try {
            const state = await readFile(
                ApiController.stateSaveFileName,
                'utf8'
            );
            this.state = JSON.parse(state);
        } catch (err) {
            console.log('state not loaded', err);
        }
    }


    /**
     * Handles a request and delegates to the correct route.
     * @param {import('http').IncomingMessage} request
     * @param {import('http').ServerResponse} response
     * @returns {{handled: boolean}}
     */
    use(request, response) {
        const url = typeof request.url === 'string' ? request.url : '';
        const route = this.routes.find((r) =>
            ApiController.isRouteMatch(r.route, { url })
        );
        if (!route) {
            return { handled: false };
        }
        // Always call routeAction with the original IncomingMessage
        route.routeAction(request, response);
        if (this.persistState) {
            writeFile(
                ApiController.stateSaveFileName,
                JSON.stringify(this.state, null, 2),
                'utf8'
            ).then();
        }
        return { handled: true };
    }

    // @ts-ignore
    addRoute({ route, routeAction }) {
        this.routes.push({ route, routeAction });
        return this;
    }
}

const server = new MainServer({
    port: 4200,
    staticFolder: 'public',
    apiController: buildController(),
});
server.start();
