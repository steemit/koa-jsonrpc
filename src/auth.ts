/**
 * @file Steem rpc-auth extension to JsonRpc
 * @author Johan Nordberg <johan@steemit.com>
 * See https://github.com/steemit/json-rpc
 */

import {SignedJsonRpcRequest, validate as validateSignature, VerifyMessage} from '@steemit/rpc-auth'
import * as assert from 'assert'
import {Authority, Client, ClientOptions, PublicKey, Signature} from 'dsteem'
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

    private client: Client
    private cacheExpiry = 2 * 60 * 1000 // ms
    private authCache = new Map<string, {auth: Authority, timestamp: number}>()

    /**
     * @param rpcNode    Address to steemd node used for signature verification.
     * @param namespace  Optional namespace to add to all methods.
     */
    constructor(public rpcNode: string, namespace?: string, options?: ClientOptions) {
        super(namespace)
        this.client = new Client(rpcNode, options)
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
        const self = this
        const paramNames = getParamNames(method)
        return async function(__signed: any) { // tslint:disable-line
            const req = this.request as SignedJsonRpcRequest
            let params: any
            try {
                params = await validateSignature(req, self.verifier)
            } catch (cause) {
                throw new JsonRpcError(401, {cause}, 'Unauthorized')
            }
            const ctx = this as JsonRpcAuthMethodContext
            ctx.account = req.params.__signed.account
            return await method.apply(ctx, resolveParams(params, paramNames))
        }

    }

    private verifier: VerifyMessage = async (message: Buffer, signatures: string[], accountName: string) => {
        assert.equal(message.byteLength, 32, 'Invalid message')
        assert(accountName.length >= 3 && accountName.length <= 16, 'Invalid account name')

        let postingAuth: Authority

        const now = Date.now()
        const cached = this.authCache.get(accountName)
        if (cached && cached.timestamp + this.cacheExpiry > now) {
            postingAuth = cached.auth
        } else {
            const [account] = await this.client.database.getAccounts([accountName])

            if (!account) {
                throw new Error('No such account')
            }

            postingAuth = account.posting

            this.authCache.set(accountName, {
                timestamp: now, auth: postingAuth
            })
        }

        if (postingAuth.key_auths.length !== 1) {
            throw new Error('Unsupported posting key configuration for account')
        }

        const [keyWif, keyWeight] = postingAuth.key_auths[0]

        if (postingAuth.weight_threshold > keyWeight) {
            throw new Error('Signing key not above weight threshold')
        }

        if (signatures.length !== 1) {
            throw new Error('Multisig not supported')
        }

        const prefix = this.client.addressPrefix
        const key = PublicKey.from(keyWif, prefix)
        const signature = Signature.fromString(signatures[0])

        const signKey = signature.recover(message, prefix)

        if (key.toString() !== signKey.toString()) {
            throw new Error('Invalid signature')
        }
    }

}
