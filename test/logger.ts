import 'mocha'
import * as assert from 'assert'
import * as Koa from 'koa'
import * as bunyan from 'bunyan'
import * as http from 'http'
import {Writable} from 'stream'

import {JsonRpc, JsonRpcError, utils, rpcLogger, requestLogger} from './../src/'
const {jsonRequest} = utils

class TestStream extends Writable {
    chunks: any[] = []
    _write(chunk, encoding, callback) {
        this.chunks.push(chunk)
        callback()
    }
    last(n: number) {
        return this.chunks.slice(-n)
    }
}

describe('logger', function() {
    const port = process.env['TEST_HTTP_PORT'] ? parseInt(process.env['TEST_HTTP_PORT'] as string) : 63205
    assert(isFinite(port), 'invalid test port')

    const app = new Koa()
    const logStream = new TestStream({objectMode: true})
    const logger = bunyan.createLogger({
        name: 'rpc-test',
        streams: [{
            level: 'debug',
            type: 'raw',
            stream: logStream
        }]
    })

    const rpc = new JsonRpc()
    app.use(requestLogger(logger))
    app.use(rpcLogger(logger))
    app.use(rpc.middleware)


    const uuidPattern = /[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}/
    rpc.register('test', async function() {
        assert(this.log && this.ctx['log'], 'missing logger')
        assert(uuidPattern.test(this.ctx['req_id']), 'invalid uuid')
        return true
    })

    rpc.register('log', async function(foo: string) {
        this.log.warn({foo}, 'Goodbye Horses')
    })

    const server = http.createServer(app.callback())

    before((done) => {
        server.listen(port, 'localhost', done)
    })

    after((done) => {
        server.close(done)
    })

    const opts = {port, protocol: 'http:', method: 'post'}

    let id = 0
    async function rpcRequest(method: string, params?: any[]) {
        const rv = await jsonRequest(opts, {id: ++id, jsonrpc: '2.0', method, params})
        if (rv.error) {
            throw new Error(rv.error.message)
        }
        return rv.result
    }

    it('should attach logger and uuid', async function() {
        const rv = await rpcRequest('test')
        assert.equal(rv, true)
    })

    it('should log rpc requests', async function() {
        await rpcRequest('log', ['Hello'])
        const msgs = logStream.last(4)
        assert.equal(msgs[0].msg, '<-- POST /')
        assert.equal(msgs[1].foo, 'Hello')
        assert.equal(msgs[2].rpc_req, 'log:2')
        assert.equal(msgs[3].msg, '--> POST / 200')
    })

    it('should log batch requests', async function() {
        await jsonRequest(opts, [
            {id: 'one', jsonrpc: '2.0', method: 'test'},
            {id: 'two', jsonrpc: '2.0', method: 'test'},
        ])
        const msgs = logStream.last(3)
        assert.equal(msgs[0].msg, 'rpc call')
        assert.equal(msgs[1].msg, 'rpc call')
        assert.equal(msgs[2].msg, '--> POST / 200')
    })

    it('should log rpc errors', async function() {
        await jsonRequest(opts, {id: 'one', jsonrpc: 'fail', method: 'test'})
        const msgs = logStream.last(3)
        assert.equal(msgs[0].msg, '<-- POST /')
        assert.equal(msgs[1].msg, 'Invalid Request: invalid rpc version')
        assert.equal(msgs[2].msg, '--> POST / 200')
    })

})
