/**
 * @file Misc utilities.
 * @author Johan Nordberg <johan@steemit.com>
 */

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
