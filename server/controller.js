import { ApiController } from './server.js';

export const buildController = () => {
    const controller = new ApiController({
        initialState: { count: 0 },
        persistState: true,
    });
    controller
        .addRoute({
            route: '/api/first',
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
            route: '/api/second/:id',
            routeAction: (req, res) => {
                const { id } = ApiController.getVariablesFromPath(
                    '/api/second/:id',
                    req
                );
                const params = new URLSearchParams(req.url.split('?')[1]);
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.write(
                    `route ${req.url}  was called with id ${id} and params ${[...params.entries()]}`
                );
                res.end();
            },
        });
    return controller;
};
