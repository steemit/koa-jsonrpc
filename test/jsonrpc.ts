import 'mocha'
import * as assert from 'assert'
import * as Koa from 'koa'
import * as http from 'http'

import {JsonRpc, JsonRpcError, utils} from './../src/'
const {jsonRequest} = utils

describe('JsonRpc', function() {

    const port = process.env['TEST_HTTP_PORT'] ? parseInt(process.env['TEST_HTTP_PORT'] as string) : 63205
    assert(isFinite(port), 'invalid test port')

    const agent = new http.Agent({keepAlive: true})
    const app = new Koa()

    const rpc = new JsonRpc()
    app.use(rpc.middleware)

    rpc.register('subtract',  async (minuend, subtrahend) => {
        await utils.sleep(10)
        return minuend - subtrahend
    })

    rpc.register('sum', async (...args) => {
        return args.reduce((prev, now) => prev+now, 0)
    })

    rpc.register('throw', async (message) => {
        throw new Error(message)
    })

    rpc.register('throw2', async (message) => {
        throw new JsonRpcError(12345, {info: {message}}, 'I meant for this to happen')
    })

    rpc.register('update',  async () => {})
    rpc.register('notify_hello',  async () => {})
    rpc.register('notify_sum',  async () => {})
    rpc.register('get_data',  async () => ["hello", 5])

    rpc.register('ctx', async function(foo: string) {
        return {ip: this.ctx.request.ip, foo}
    })

    async function send(body: string) {
        return new Promise((resolve, reject) => {
            const request = http.request({port, method: 'post'}, (response) => {
                response.on('error', reject)
                response.on('data', (data) => { resolve(data.toString()) })
            })
            request.write(body)
            request.end()
        })
    }

    const server = http.createServer(app.callback())

    before((done) => {
        server.listen(port, 'localhost', done)
    })

    after((done) => {
        agent.destroy()
        server.close(done)
    })

    const opts = {port, agent, protocol: 'http:', method: 'post'}

    // http://www.jsonrpc.org/specification#examples

    it('rpc call with positional parameters', async function() {
        let rv: any
        rv = await jsonRequest(opts, {"jsonrpc": "2.0", "method": "subtract", "params": [42, 23], "id": 1})
        assert.deepEqual(rv, {"jsonrpc": "2.0", "result": 19, "id": 1})
        rv = await jsonRequest(opts, {"jsonrpc": "2.0", "method": "subtract", "params": [23, 42], "id": 2})
        assert.deepEqual(rv, {"jsonrpc": "2.0", "result": -19, "id": 2})
    })

    it('rpc call with named parameters', async function() {
        let rv: any
        rv = await jsonRequest(opts, {"jsonrpc": "2.0", "method": "subtract", "params": {"subtrahend": 23, "minuend": 42}, "id": 3})
        assert.deepEqual(rv, {"jsonrpc": "2.0", "result": 19, "id": 3})
        rv = await jsonRequest(opts, {"jsonrpc": "2.0", "method": "subtract", "params": {"minuend": 42, "subtrahend": 23}, "id": 4})
        assert.deepEqual(rv, {"jsonrpc": "2.0", "result": 19, "id": 4})
    })

    it('a Notification', async function() {
        const rv = await jsonRequest(opts, {"jsonrpc": "2.0", "method": "update", "params": [1,2,3,4,5]})
        assert.deepEqual(rv, undefined)
    })

    it('rpc call of non-existent method', async function() {
        const rv = await jsonRequest(opts, {"jsonrpc": "2.0", "method": "foobar", "id": "1"})
        assert.deepEqual(rv, {"jsonrpc": "2.0", "error": {"code": -32601, "message": "Method not found"}, "id": "1"})
    })

    it('rpc call with invalid JSON', async function() {
        const rv: any = await send(`{"jsonrpc": "2.0", "method": "foobar, "params": "bar", "baz]`)
        assert.deepEqual(JSON.parse(rv),  {"jsonrpc": "2.0", "error": {"code": -32700, "message": "Parse error: Unexpected token p in JSON at position 39"}, "id": null})
    })

    it('rpc call with invalid Request object', async function() {
        const rv = await jsonRequest(opts, {"jsonrpc": "2.0", "method": 1, "params": "bar"})
        assert.deepEqual(rv, {"jsonrpc": "2.0", "error": {"code": -32600, "message": "Invalid Request: invalid method"}, "id": null})
    })

    it('rpc call Batch, invalid JSON', async function() {
        const rv: any = await send(`[{"jsonrpc": "2.0", "method": "sum", "params": [1,2,4], "id": "1"},{"jsonrpc": "2.0", "method"]`)
        assert.deepEqual(JSON.parse(rv),  {"jsonrpc": "2.0", "error": {"code": -32700, "message": "Parse error: Unexpected token ] in JSON at position 94"}, "id": null})
    })

    it('rpc call with an empty Array', async function() {
        const rv = await jsonRequest(opts, [])
        assert.deepEqual(rv, {"jsonrpc": "2.0", "error": {"code": -32600, "message": "Invalid Request"}, "id": null})
    })

    it('rpc call with an invalid Batch (but not empty)', async function() {
        const rv = await jsonRequest(opts, [1])
        assert.deepEqual(rv, [{"jsonrpc": "2.0", "error": {"code": -32600, "message": "Invalid Request: invalid rpc version"}, "id": null}])
    })

    it('rpc call with invalid Batch', async function() {
        const rv = await jsonRequest(opts, [1,2,3])
        assert.deepEqual(rv, [
            {"jsonrpc": "2.0", "error": {"code": -32600, "message": "Invalid Request: invalid rpc version"}, "id": null},
            {"jsonrpc": "2.0", "error": {"code": -32600, "message": "Invalid Request: invalid rpc version"}, "id": null},
            {"jsonrpc": "2.0", "error": {"code": -32600, "message": "Invalid Request: invalid rpc version"}, "id": null}
        ])
    })

    it('rpc call Batch', async function() {
        const rv = await jsonRequest(opts, [
            {"jsonrpc": "2.0", "method": "sum", "params": [1,2,4], "id": "1"},
            {"jsonrpc": "2.0", "method": "notify_hello", "params": [7]},
            {"jsonrpc": "2.0", "method": "subtract", "params": [42,23], "id": "2"},
            {"foo": "boo"},
            {"jsonrpc": "2.0", "method": "foo.get", "params": {"name": "myself"}, "id": "5"},
            {"jsonrpc": "2.0", "method": "get_data", "id": "9"}
        ])
        assert.deepEqual(rv, [
            {"jsonrpc": "2.0", "result": 7, "id": "1"},
            {"jsonrpc": "2.0", "result": 19, "id": "2"},
            {"jsonrpc": "2.0", "error": {"code": -32600, "message": "Invalid Request: invalid rpc version"}, "id": null},
            {"jsonrpc": "2.0", "error": {"code": -32601, "message": "Method not found"}, "id": "5"},
            {"jsonrpc": "2.0", "result": ["hello", 5], "id": "9"}
        ])
    })

    it('rpc call Batch (all notifications)', async function() {
        const rv = await jsonRequest(opts, [
            {"jsonrpc": "2.0", "method": "notify_sum", "params": [1,2,4]},
            {"jsonrpc": "2.0", "method": "notify_hello", "params": [7]}
        ])
        assert.deepEqual(rv, undefined)
    })

    // extra

    it('should handle invalid param names', async function() {
        const rv = await jsonRequest(opts, {"jsonrpc": "2.0", "method": "subtract", "params": {"foo": "horse"}, "id": 2})
        assert.deepEqual(rv, { jsonrpc: '2.0', id: 2, error: { code: -32602, message: 'Invalid params: unknown param: foo' } })
    })

    it('should handle invalid method', async function() {
        const rv = await jsonRequest({port, protocol: 'http:', method: 'put'}, 42)
        assert.deepEqual(rv, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Method Not Allowed' } })
    })

    it('should handle unexpected errors thrown in rpc method', async function() {
        const rv = await jsonRequest(opts, {"jsonrpc": "2.0", "method": "throw", "params": ["banana"], "id": 2})
        assert.deepEqual(rv, { jsonrpc: '2.0', id: 2, error: { code: -32603, message: 'Internal error: banana' } })
    })

    it('should handle expected errors thrown in rpc method', async function() {
        const rv = await jsonRequest(opts, {"jsonrpc": "2.0", "method": "throw2", "params": ["banana"], "id": 2})
        assert.deepEqual(rv, { jsonrpc: '2.0', id: 2, error: { data: {message: 'banana'}, code: 12345, message: 'I meant for this to happen' } })
    })

    it('should bind request context to rpc handler', async function() {
        const rv = await jsonRequest(opts, {"jsonrpc": "2.0", "method": "ctx", "params": ["baz"], "id": 2})
        assert.deepEqual(rv, { jsonrpc: '2.0', id: 2, result: {ip: '127.0.0.1', foo: 'baz'}})
    })

})

