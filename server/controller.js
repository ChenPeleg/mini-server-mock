//@ts-check
import { ApiController } from './server.js';

/**
 * Builds and returns the API controller with all routes.
 * @returns {ApiController}
 */
export const buildController = () => {
    /**
     * @type {ApiController}
     */
    const controller = new ApiController({
        /** @type {{ count: number }} */
        initialState: { count: 0 },
        /** @type {boolean} */
        persistState: true,
    });
    controller
        .addRoute({
            /** @type {string} */
            route: '/api/first',
            /**
             * Handles the /api/first route.
             * @param {import('http').IncomingMessage} req
             * @param {import('http').ServerResponse} res
             * @returns {void}
             */
            routeAction: (req, res) => {
                controller.state.count = controller.state.count + 1;
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.write(
                    `route ${req.url}  was called ${controller.state.count} times`
                );
                res.end();
            },
        })
        .addRoute({
            /** @type {string} */
            route: '/api/second/:id',
            /**
             * Handles the /api/second/:id route.
             * @param {import('http').IncomingMessage} req
             * @param {import('http').ServerResponse} res
             * @returns {void}
             */
            routeAction: (req, res) => {
                // Defensive: ensure req.url is a string
                const url = typeof req.url === 'string' ? req.url : '';
                const vars = ApiController.getVariablesFromPath(
                    '/api/second/:id',
                    { url }
                );
                const id = vars.id ?? '';
                const params = new URLSearchParams(url.split('?')[1] || '');
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.write(
                    `route ${url}  was called with id ${id} and params ${[...params.entries()]}`
                );
                res.end();
            },
        });
    return controller;
};
