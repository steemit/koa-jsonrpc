/**
 * @file Misc utilities.
 * @author Johan Nordberg <johan@steemit.com>
 */

import * as assert from 'assert'
import * as http from 'http'
import * as https from 'https'
import {VError} from 'verror'

/**
 * Reads stream to memory and tries to parse the result as JSON.
 */
export async function readJson(stream: NodeJS.ReadableStream): Promise<any> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        stream.on('error', reject)
        stream.on('data', (chunk: Buffer) => { chunks.push(chunk) })
        stream.on('end', () => {
            if (chunks.length === 0) {
                resolve(undefined)
                return
            }
            try {
                const data = JSON.parse(Buffer.concat(chunks).toString())
                resolve(data)
            } catch (error) {
                reject(error)
            }
        })
    })
}

/**
 * Sends JSON data to server and read JSON response.
 */
export async function jsonRequest(options: https.RequestOptions, data: any) {
    return new Promise<any>((resolve, reject) => {
        let body: Buffer
        try {
            body = Buffer.from(JSON.stringify(data))
        } catch (cause) {
            throw new VError({cause, name: 'RequestError'}, 'Unable to stringify request data')
        }
        let request: http.ClientRequest
        if (!options.protocol || options.protocol === 'https:') {
            request = https.request(options)
        } else {
            request = http.request(options)
        }
        request.on('error', (cause) => {
            reject(new VError({cause, name: 'RequestError'}, 'Unable to send request'))
        })
        request.on('response', async (response: http.IncomingMessage) => {
            try {
                resolve(await readJson(response))
            } catch (cause) {
                const info = {code: response.statusCode}
                reject(new VError({cause, info, name: 'ResponseError'}, 'Unable to read response data'))
            }
        })
        request.setHeader('Accept', 'application/json')
        request.setHeader('Content-Type', 'application/json')
        request.setHeader('Content-Length', body.length)
        request.write(body)
        request.end()
    })
}

/**
 * Sleep for N milliseconds.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms)
    })
}

/**
 * Resolve params object to positional array.
 */
export function resolveParams(params: any[] | {[key: string]: any}, names: string[]) {
    assert(typeof params === 'object', 'not an object or array')
    if (!Array.isArray(params)) {
        // resolve named arguments to positional
        const rv: any[] = names.map(() => undefined)
        for (const key of Object.keys(params)) {
            const idx = names.indexOf(key)
            assert(idx !== -1, `unknown param: ${ key }`)
            rv[idx] = params[key]
        }
        return rv
    } else {
        return params
    }
}

// https://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically
// tslint:disable-next-line
const STRIP_COMMENTS = /(\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s*=[^,\)]*(('(?:\\'|[^'\r\n])*')|("(?:\\"|[^"\r\n])*"))|(\s*=[^,\)]*))/mg
const ARGUMENT_NAMES = /([^\s,]+)/g

/**
 * Get parameter names for function as array.
 */
export function getParamNames(func) {
  const fnStr = func.toString().replace(STRIP_COMMENTS, '')
  const result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES)
  return result || []
}
