import 'mocha'
import * as assert from 'assert'
import * as Koa from 'koa'
import * as http from 'http'
import {sign} from '@steemit/rpc-auth'
import {PrivateKey} from 'dsteem'

import {JsonRpcAuth, utils} from './../src/'
const {jsonRequest} = utils

describe('Auth', function() {
    this.slow(1000)
    this.timeout(2000)

    const port = process.env['TEST_HTTP_PORT'] ? parseInt(process.env['TEST_HTTP_PORT'] as string) : 63205
    assert(isFinite(port), 'invalid test port')

    const app = new Koa()
    const rpc = new JsonRpcAuth('https://mock.town')
    app.use(rpc.middleware)

    const keys = {
        foo: PrivateKey.fromSeed('foo'),
        bar: PrivateKey.fromSeed('bar'),
    }

    const mockAccounts = {
        foo: {
            posting: {
                weight_threshold: 1,
                account_auths: [],
                key_auths: [[keys.foo.createPublic().toString(), 1]]
            }
        },
        bar: {
            posting: {
                weight_threshold: 1,
                account_auths: [],
                key_auths: [[keys.bar.createPublic().toString(), 1]]
            }
        }
    }

    const _rpc = rpc as any
    _rpc.client.call = async (api: string, method: string, params = []) => {
        const apiMethod = `${ api }-${ method }`
        switch (apiMethod) {
            case 'database_api-get_accounts':
                assert.equal(params.length, 1, 'can only mock single account lookups')
                return [mockAccounts[params[0]]]
            default:
                throw new Error(`No mock data for: ${ apiMethod }`)
        }
    }

    const sudoers = [
        'foo'
    ]

    rpc.registerAuthenticated('sudo', async function (command) {
        this.assert(sudoers.includes(this.account), 'Nope')
        return `sudo ${ command }`
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

    before((done) => { server.listen(port, 'localhost', done) })
    after((done) => { server.close(done) })

    const opts = {port, protocol: 'http:', method: 'post'}

    it('verifies signed request', async function() {
        const req: any = {
            jsonrpc: '2.0',
            id: 1,
            method: 'sudo',
            params: {command: 'make me a sandwich'},
        }
        const signed = sign(req, 'foo', [keys.foo.toString()])
        const rv = await jsonRequest(opts, signed)
        assert.deepEqual(rv, { jsonrpc: '2.0', id: 1, result: 'sudo make me a sandwich' })
    })

    it('rejects unsigned request', async function() {
        let rv: any
        const req: any = {
            jsonrpc: '2.0',
            id: 1,
            method: 'sudo',
            params: {command: 'make me a sandwich'},
        }
        rv = await jsonRequest(opts, req)
        assert.deepEqual(rv, { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid params: unknown param: command' } })
        req.params = {__signed: {foo: 'baz'}}
        rv = await jsonRequest(opts, req)
        assert.deepEqual(rv, { jsonrpc: '2.0', id: 1, error: { code: 401, message: 'Unauthorized: Missing account' } })
    })

    it('rejects invalid signature', async function() {
        const key = PrivateKey.fromSeed('this aint no key ive ever heard of').toString()
        const req: any = {
            jsonrpc: '2.0',
            id: 1,
            method: 'sudo',
            params: {command: 'make me a sandwich'},
        }
        const signed = sign(req, 'foo', [key])
        const rv = await jsonRequest(opts, signed)
        assert.deepEqual(rv, { jsonrpc: '2.0', id: 1, error: { code: 401, message: 'Unauthorized: Verification failed (Invalid signature)' } })
    })

    it('rejects wrong user', async function() {
        const req: any = {
            jsonrpc: '2.0',
            id: 1,
            method: 'sudo',
            params: {command: 'make me a sandwich'},
        }
        const signed = sign(req, 'bar', [keys.bar.toString()])
        const rv = await jsonRequest(opts, signed)
        assert.deepEqual(rv, { jsonrpc: '2.0', id: 1, error: { code: 400, message: 'Nope' } })
    })

    it('rejects bad signature', async function() {
        const key = PrivateKey.fromSeed('lol').toString()
        const req: any = {
            jsonrpc: '2.0',
            id: 1,
            method: 'sudo',
            params: {command: 'make me a sandwich'},
        }
        const signed = sign(req, 'foo', [key])
        const rv = await jsonRequest(opts, signed)
        assert.deepEqual(rv, { jsonrpc: '2.0', id: 1, error: { code: 401, message: 'Unauthorized: Verification failed (Invalid signature)' } })
    })


})