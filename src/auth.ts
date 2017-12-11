/**
 * @file Steem rpc-auth extension to JsonRpc
 * @author Johan Nordberg <johan@steemit.com>
 * See https://github.com/steemit/json-rpc
 */

import {SignedJsonRpcRequest, validate as validateSignature, VerifyMessage} from '@steemit/rpc-auth'
import * as assert from 'assert'
import {RequestOptions} from 'https'
import {parse as parseUrl} from 'url'
import {JsonRpc, JsonRpcError, JsonRpcMethod, JsonRpcMethodContext} from './jsonrpc'
import {getParamNames, jsonRequest, resolveParams} from './utils'

export interface JsonRpcAuthMethodContext extends JsonRpcMethodContext {
    account: string
}

export type JsonRpcAuthMethod = (this: JsonRpcAuthMethodContext, ...params) => any

/**
 * JsonRpc subclass that adds request signature verification.
 */
export class JsonRpcAuth extends JsonRpc {

    private requestOptions: RequestOptions
    private seqNo = 0

    /**
     * @param rpcNode    Address to steemd node used for signature verification.
     * @param namespace  Optional namespace to add to all methods.
     */
    constructor(public rpcNode: string, namespace?: string) {
        super(namespace)
        this.requestOptions = parseUrl(rpcNode)
        this.requestOptions.method = 'post'
    }

    /**
     * Register a rpc method that requires request signing.
     * @param name    Method name.
     * @param method  Method implementation.
     */
    public registerAuthenticated(name: string, method: JsonRpcAuthMethod) {
        this.register(name, this.makeHandler(method))
     }

    private makeHandler(method: JsonRpcAuthMethod): JsonRpcMethod {
        const verifier = this.verifier
        const paramNames = getParamNames(method)
        return async function(__signed: any) { // tslint:disable-line
            const req = this.request as SignedJsonRpcRequest
            let params: any
            try {
                params = await validateSignature(req, verifier)
            } catch (cause) {
                throw new JsonRpcError(401, {cause}, 'Unauthorized')
            }
            const ctx = this as JsonRpcAuthMethodContext
            ctx.account = req.params.__signed.account
            return await method.apply(ctx, resolveParams(params, paramNames))
        }

    }

    private verifier: VerifyMessage = async (message: Buffer, signatures: string[], account: string) => {
        const payload = {
            jsonrpc: '2.0',
            method: 'call',
            id: ++this.seqNo,
            params: ['database_api', 'verify_signatures', [{
                hash: message.toString('hex'),
                signatures,
                required_posting: [account],
            }]]
        }
        const response = await jsonRequest(this.requestOptions, payload)
        assert(response.id === payload.id, 'rpc node response id mismatch')
        if (response.result.valid !== true) {
            throw new Error('Invalid signature')
        }
    }

}
