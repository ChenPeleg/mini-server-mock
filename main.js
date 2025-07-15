import { buildController } from './server/controller.js';
import { MiniServer } from './server/server.js';



const server = new MiniServer({
    port: 4200,
    staticFolder: 'public',
    apiController: buildController(),
    devHotReload: true,
});
server.start();
