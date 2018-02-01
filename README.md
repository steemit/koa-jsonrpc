
@steemit/koa-jsonrpc
====================

*Build status: [![CircleCI](https://circleci.com/gh/steemit/koa-jsonrpc.svg?style=svg)](https://circleci.com/gh/steemit/koa-jsonrpc)*

Spec compliant JSON RPC Server middleware for Koa


```javascript
const Koa = require('koa')
const {JsonRpc} = require('@steemit/koa-jsonrpc')

const rpc = new JsonRpc()
rpc.register('my_method', async (foo, bar) => {
    return foo + bar
})

const app = new Koa()
app.use(rpc.middleware)
app.listen(8080)

```

```
$ curl -X POST -d '{"id":1,"jsonrpc":"2.0","method":"my_method","params":["honkey","tonk"]}' localhost:8080
{"jsonrpc":"2.0","id":1,"result":"honkeytonk"}
```
