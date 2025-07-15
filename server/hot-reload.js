import { spawn } from 'child_process';
import { existsSync, readFileSync, watch } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { lstat } from 'fs/promises';
import http from 'http';

class HotReload {
    debouncedRestart = this.debounce(this.restartServer.bind(this), 1000);
    clients = [];

    constructor({ serverFilePath, htmlReloadPort } = {}) {
        this.htmlReloadPort = htmlReloadPort || null;
        this.rootPath = resolve(process.cwd());
        this.ignoredPatterns = this.getIgnoredPatterns(this.rootPath);
        this.serverFilePath = serverFilePath || 'main.js';
        this.server = null;
        this.lastFileChanged = '';
        this.timeout = null;
    }

    run() {
        console.log(
            `\x1b[33m 🚀 Hot reload watching files in "${this.rootPath}" \x1b[0m`
        );
        this.startServer();
        this.startHtmlReloadServer();
        this.watchFiles();
    }

    startHtmlReloadServer() {
        if (!this.htmlReloadPort) return;
        const htmlHotReloadServer = http.createServer((request, response) => {
            const headers = {
                'Content-Type': 'text/event-stream',
                Connection: 'keep-alive',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
                'Access-Control-Max-Age': 2592000,
            };
            if (request.method === 'OPTIONS') {
                request.writeHead(204, headers);
                request.end();
                return;
            }
            response.writeHead(200, headers);
            const data = `Listening for HTML changes on port ${this.htmlReloadPort}...`;
            response.write(data);
            const clientId = Date.now();
            const newClient = {
                id: clientId,
                response,
            };
            this.clients.push(newClient);
            request.on('close', () => {
                this.clients = this.clients.filter(
                    (client) => client.id !== clientId
                );
            });
        });
        htmlHotReloadServer.listen(this.htmlReloadPort);
    }

    startServer() {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const allArgs = process.argv.slice(2);
        this.server = spawn('node', [
            resolve(__dirname, this.serverFilePath),
            ...allArgs,
        ]);
        this.server.stdout.on('data', (data) => console.log(data.toString()));
        this.server.stderr.on('data', (data) =>
            console.error(`stderr: ${data}`)
        );
    }

    restartServer() {
        console.log(
            `\x1b[33m 🔄 File ${this.lastFileChanged} was changed, restarting server... \x1b[0m`
        );

        this.server.kill();
        this.startServer();
        this.clients.forEach((client) => {
            client.response.write(
                [`event: message`, `id: ${client.id}`, `data: reload\n\n`].join(
                    '\n'
                )
            );
        });
    }

    debounce(func, wait) {
        return (...args) => {
            if (this.timeout) clearTimeout(this.timeout);
            const later = () => {
                clearTimeout(this.timeout);
                func(...args);
            };
            clearTimeout(this.timeout);
            this.timeout = setTimeout(later, wait);
        };
    }

    watchFiles() {
        watch(
            this.rootPath,
            { recursive: true },
            async (eventType, filename) => {
                try {
                    const path = resolve(this.rootPath, filename);
                    if (!existsSync(path) || filename.includes('~')) return;
                    const stats = await lstat(resolve(this.rootPath, filename));
                    if (!stats.isFile()) return;
                    if (
                        this.ignoredPatterns.some((pattern) =>
                            pattern.test(filename)
                        )
                    )
                        return;
                    this.lastFileChanged = filename;
                    this.debouncedRestart();
                } catch (error) {
                    console.error(error);
                }
            }
        );
    }

    getIgnoredPatterns(root) {
        const gitignoreToRegExp = (pattern) => {
            // Convert glob syntax to RegExp syntax
            let regExp = pattern.replace(/([.?+^$[\]\\(){}|-])/g, '\\$1'); // escape special RegExp characters
            regExp = regExp.replace(/\*\*/g, '.*'); // '**' matches any number of directories
            regExp = regExp.replace(/\*/g, '[^/]*'); // '*' matches any number of non-directory characters
            regExp = regExp.replace(/\/$/, '(?:/|$)'); // if the pattern ends with '/', it should match either '/' or the end of the string
            regExp = '^' + regExp + '$'; // the pattern should match the whole string

            return new RegExp(regExp);
        };
        const ignoredPatterns = [
            /\.git*/g,
            /node_modules/,
            /dist/,
            /build/,
            /coverage/,
            /test/,
            /out/,
            /temp/,
            /.idea/,
            /.vscode/,
            /.git/,
            /.github/,
            /.*\.log/,
        ];

        const gitignore = resolve(root, '.gitignore');
        if (existsSync(gitignore)) {
            const patterns = readFileSync(gitignore, 'utf8').split('\n');
            patterns.forEach((pattern) => {
                if (pattern.trim() !== '') {
                    ignoredPatterns.push(
                        new RegExp(gitignoreToRegExp(pattern))
                    );
                }
            });
        }
        return ignoredPatterns;
    }
}

const hotReload = new HotReload({
    serverFilePath: 'server.js',
    htmlReloadPort: 8000,
});
hotReload.run();
