//@ts-check
import { ApiController } from './server.js';


const baseRoutes = [ApiController.createRoute({
    url : 'json2',
    method : 'GET',
    data : {        abc: 123,},
    status : 200,
})]

/**
 * Builds and returns the API controller with all routes.
 * @returns {ApiController}
 */
export const buildController = () => {
    /**
     * @type {ApiController}
     */
    const controller = new ApiController(
        {
            routes: baseRoutes,
        /** @type {{ count: number }} */
        initialState: { count: 0 },
        /** @type {boolean} */ persistState: true,

    });
    controller
        .addRoute({
            /** @type {string} */
            url: '/api/first' /**
             * Handles the /api/first route.
             * @param {import('http').IncomingMessage} req
             * @param {import('http').ServerResponse} res
             * @returns {void}
             */,
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
            url: '/api/second/:id' /**
             * Handles the /api/second/:id route.
             * @param {import('http').IncomingMessage} req
             * @param {import('http').ServerResponse} res
             * @returns {void}
             */,
            routeAction: (req, res) => {
                const url = typeof req.url === 'string' ? req.url : '';
                /** @type {Record<string, string>} */
                const vars = ApiController.getVariablesFromPath(
                    '/api/second/:id',
                    { url }
                );
                const id = vars.id || '';
                const params = new URLSearchParams(url.split('?')[1] || '');
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.write(
                    `route ${url}  was called with id ${id} and params ${[...params.entries()]} `
                );
                res.end();
            },
        })

        .addRoute({
            /** @type {string} */
            url: '/api/jsonTry' /**
             * Handles the /api/second/:id route.
             * @param {import('http').IncomingMessage} req
             * @param {import('http').ServerResponse} res
             * @returns {void}
             */,
            routeAction: (req, res) => {


                res.writeHead(200, { 'Content-Type': 'application/json' });
                const data = {
                    abc: 123,
                };
                res.write(JSON.stringify(data));
                res.end();
            },
        });
    return controller;
};
