//@ts-check

import http from 'http';
import { extname, join as joinPath } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';
import { readFile, writeFile } from 'node:fs/promises';

export class MiniServer {
    /**
     * @typedef {Object} MainServerOptions
     * @property {string} [root]
     * @property {number} [port]
     * @property {string} [staticFolder]
     * @property {boolean} [devHotReload]
     * @property { ApiController} [apiController]
     */

    /**
     * @param {MainServerOptions} [options]
     */
    constructor({
        root,
        port,
        staticFolder,
        apiController,
        devHotReload,
    } = {}) {
        this.staticFolder = staticFolder || 'public';
        this.root = root || process.cwd();
        this.port = port || 4200;
        this.apiConteoller = apiController;
        this.hotRelaodfile = `hot-reload-${Math.random().toString(36).substring(6)}.js`;
        this.devHotReload = devHotReload || false;
    }

    /**
     * @returns {string}
     */
    get htmlHotReloadWorker() {
        return `onconnect = (e) => {
    const port = e.ports[0];
    const evtSource = new EventSource('http://localhost:35729');
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
        try { 
            const myWorker = new SharedWorker("${this.hotRelaodfile}", {
                name: 'reload-worker',
            });
            myWorker.port.start();
            myWorker.port.onmessage = (e) => {
                if (e.data === 'reload') {
                    window.location.reload();
                }
            };
         } catch (err) {
            console.error('Hot reload worker failed to start:', err);
         }
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
        if (filename.includes('.well-known')) {
            response.end();
            return;
        }
        if (this.devHotReload && url.replace('/', '') === this.hotRelaodfile) {
            response.writeHead(200, { 'Content-Type': 'text/javascript' });
            response.write(this.htmlHotReloadWorker, 'binary');
            response.end();
            return;
        }
        /** @type {Record<string, string>} */
        const contentTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'text/javascript',
            '.json': 'text/json',
            '.svg': 'image/svg+xml',
        };
        if (!existsSync(filename)) {
            if (filename.includes('api')) {
                response.writeHead(400, { 'Content-Type': 'text/plain' });
                response.write('API call not found');
                response.end();
                return;
            }
            console.error(`File not found: ${filename}`);
            filename = joinPath(process.cwd(), '/404.html');
        } else if (statSync(filename).isDirectory()) {
            filename += '/index.html';
        }

        try {
            let file = readFileSync(filename, 'binary');
            if (filename.endsWith('.html') && this.devHotReload) {
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
        const url = typeof request.url === 'string' ? request.url : '';
        // @ts-expect-error this is a cloned message
        return this.apiConteoller.use({ ...request, url }, response);
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
        this.staticFileServer(request, response);
    }
}

/**
 * @typedef {'GET' | 'PSOT' | 'PUT' | 'PATCH' | 'DELETE'} RouteMethod
 */

/**
 * @typedef {Object} ApiControllerRoute
 * @property {string} url
 * @property {RouteMethod} [method]
 * @property {(req: import('http').IncomingMessage, res: import('http').ServerResponse) => void} routeAction
 */

export class ApiController {
    #stateSaveFileName = './server.state.temp';

    /**
     * @param {{routes? :ApiControllerRoute[]  , initialState?: any, persistState?: boolean,stateSaveFile? : string  }} args
     */
    constructor({ routes, initialState, persistState, stateSaveFile } = {}) {
        this.persistState = persistState || false;
        this.#stateSaveFileName = stateSaveFile || this.#stateSaveFileName;
        /** @type {ApiControllerRoute[]} */
        this.routes = routes || [];
        this.state = initialState || {};
        if (this.persistState) {
            this.tryToLoadState().then();
        }
    }

    /**
     * @param {Omit<ApiControllerRoute, 'routeAction'>} route
     * @param {{ url: string; method?: string; }} request
     */
    static isRouteMatch(route, request) {
        const pathParts = route.url.split('/');
        const requestParts = request.url.split('/');

        if (pathParts.length !== requestParts.length) {
            return false;
        }
        if (
            route.method &&
            request.method &&
            route.method.toUpperCase() !== request.method.toUpperCase()
        ) {
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

    /**
     *
     * @param {{url : string, method? : RouteMethod, data : any, status? : number}} args
     * @param method
     * @param data
     * @param status
     * @return {ApiControllerRoute}
     */
    static createRoute({ url, method, data, status }) {
        return {
            url,
            method: method || 'GET',
            routeAction: (req, res) => {
                res.writeHead(status || 200, {
                    'Content-Type': 'application/json',
                });
                res.write(JSON.stringify(data || {}));
                res.end();
            },
        };
    }

    async tryToLoadState() {
        try {
            const state = await readFile(this.#stateSaveFileName, 'utf8');
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
            ApiController.isRouteMatch(
                {
                    url: r.url,
                    method: r.method,
                },
                { url, method: request.method }
            )
        );
        if (!route) {
            return { handled: false };
        }
        route.routeAction(request, response);
        if (this.persistState) {
            writeFile(
                this.#stateSaveFileName,
                JSON.stringify(this.state, null, 2),
                'utf8'
            ).then();
        }
        return { handled: true };
    }

    /**\
     *
     * @param {ApiControllerRoute} route
     * @return {ApiController}
     */
    addRoute(route) {
        this.routes.push(route);
        return this;
    }
}
