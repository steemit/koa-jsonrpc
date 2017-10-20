/**
 * @file JSONRPC bunyan logging middleware for koa.
 * @author Johan Nordberg <johan@steemit.com>
 */

import * as bunyan from 'bunyan'
import * as Koa from 'koa'
import * as UUID from 'uuid/v4'

import {JsonRpcRequest, JsonRpcResponse} from './jsonrpc'

/**
 * Create a log middleware. Attaches a bunyan child logger
 * with the uuid and ip to the request context.
 * Should be first in chain.
 */
export function requestLogger(logger: bunyan, level = 'debug'): Koa.Middleware {
    return (ctx: Koa.Context, next) => {
        ctx['start_time'] = process.hrtime()
        const uuid = ctx.request.get('X-Amzn-Trace-Id') || ctx.request.get('X-Request-Id') || UUID()
        ctx['req_id'] = uuid
        ctx.response.set('X-Request-Id', uuid)
        const log = logger.child({
            req_id: uuid,
            req_ip: ctx.request.ip
        })
        ctx['log'] = log
        log[level]('<-- %s %s', ctx.method, ctx.path)
        const done = () => {
            const delta = process.hrtime(ctx['start_time'])
            const ms = delta[0] * 1e3 + delta[1] / 1e6
            const size = ctx.response.length
            log[level]({ms, size}, '--> %s %s %d', ctx.method, ctx.path, ctx.status)
        }
        ctx.res.once('close', done)
        ctx.res.once('finish', done)
        return next()
    }
}

/** Create a RPC logging middleware. */
export function rpcLogger(logger: bunyan, level = 'debug'): Koa.Middleware {
    logger.addSerializers({
        rpc_req: (req: JsonRpcRequest) => {
            return {id: req.id, method: req.method}
        }
    })
    return async (ctx: Koa.Context, next) => {
        await next()
        const logResponse = (response: JsonRpcResponse) => {
            let log: bunyan = ctx['log'] || logger
            if (response.request) {
                log = log.child({rpc_req: response.request})
            }
            if (response.error) {
                log.error(response.error)
            } else {
                log[level]({ms: response.time}, 'rpc call')
            }
        }
        if (ctx['rpc_responses']) {
            ctx['rpc_responses'].forEach(logResponse)
        }
    }
}
