
@steemit/jsonrpc
================

Spec compliant JSON RPC Server middleware for Koa


```javascript
const Koa = require('koa')
const {JsonRpc} = require('@steemit/jsonrpc')

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
