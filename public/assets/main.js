class ApiCall {
    constructor({ path, query, body, method, name }) {
        this.path = path || '';
        this.query = query || {};
        this.body = body || {};
        this.method = method || 'GET';
        this.name = name || 'Unknown';
        this.id = `${name}${path}${JSON.stringify(query)}${method}`
            .split('')
            .reduce((s, c) => (Math.imul(31, s) + c.charCodeAt(0)) | 0, 0);
    }
}

class Main {
    init() {
        const button = document.querySelector('#callButton');

        this.select = document.querySelector('#callSelect');
        this.calls = this.buildCalls();
        this.calls.forEach((call) => {
            const option = document.createElement('option');
            option.text = call.name;
            option.value = call.id;
            this.select.add(option);
        });
        this.selectedCallInfo = document.querySelector('#selectedCallInfo');

        this.select.addEventListener('change', (ev) => {
            this.selectionChanged(ev);
        });
        button.onclick = (ev) => this.callApi(ev);
    }

    selectionChanged(ev) {
        const call = this.calls.find((c) => +c.id === +ev.target.value);

        if (!call) return;
        this.selectedCallInfo.innerHTML = `${call.name} ${call.path} ${call.method}`;
    }

    async callApi(ev) {
        const call = this.calls.find((c) => +c.id === +this.select.value);

        if (!call) return;
        const req = {
            method: call.method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        if (call.method.toUpperCase() !== 'GET') {
            req.body = JSON.stringify(call.body);
        }
        const result = await fetch(call.path, req);

        // if (result.headers.get('Content-Type') === 'application/json') {
        //     const data = await result.json();
        // }
        const data =
            result.headers.get('Content-Type') === 'application/json'
                ? await result.json()
                : await result.text();
        this.displayData(data);
    }

    buildCalls() {
        return [
            new ApiCall({
                path: '/api/first',
                method: 'GET',
                name: 'First',
            }),
            new ApiCall({
                path: '/api/second/123123?var1=2&var2=gotohell',
                method: 'GET',
                name: 'Second',
            }),
            new ApiCall({
                path: '/api/third',
                method: 'GET',
                name: 'Third',
            }),
        ];
    }

    displayData(data) {
        document.querySelector('#responseCallInfo').innerHTML = JSON.stringify(
            data,
            null,
            2
        );
    }
}

new Main().init();
