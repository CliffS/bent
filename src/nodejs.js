const http = require('http')
const https = require('https')
const url = require('url')
const bl = require('bl')
const isStream = require('is-stream')
const caseless = require('caseless')
const bent = require('./core')

class StatusError extends Error {
  constructor (res, ...params) {
    super(...params)

    Error.captureStackTrace(this, StatusError)
    this.message = `Incorrect statusCode: ${res.statusCode}`
    this.statusCode = res.statusCode
    this.responseBody = new Promise((resolve) => {
      let buffers = []
      res.on('data', chunk => buffers.push(chunk))
      res.on('end', () => resolve(Buffer.concat(buffers)))
    })
  }
}

const mkrequest = (statusCodes, method, encoding, headers, baseurl) => (_url, body = null) => {
  _url = baseurl + _url
  let parsed = url.parse(_url)
  let h
  if (parsed.protocol === 'https:') {
    h = https
  } else if (parsed.protocol === 'http:') {
    h = http
  } else {
    throw new Error(`Unknown protocol, ${parsed.protocol}`)
  }
  let request = {
    path: parsed.path,
    port: parsed.port,
    method: method,
    headers: headers || {},
    hostname: parsed.hostname
  }
  if (encoding === 'json') {
    let c = caseless(request.headers)
    if (!c.get('accept')) {
      c.set('accept', 'application/json')
    }
  }
  return new Promise((resolve, reject) => {
    let req = h.request(request, res => {
      if (!statusCodes.has(res.statusCode)) {
        return reject(new StatusError(res))
      }
      if (!encoding) return resolve(res)
      else {
        res.pipe(bl((err, buff) => {
          /* istanbul ignore if */
          if (err) return reject(err)
          /* We already guard against these
             above so that we get an early error. */
          /* istanbul ignore else */
          if (encoding === 'buffer') {
            resolve(buff)
          } else if (encoding === 'json') {
            let ret
            try {
              ret = JSON.parse(buff.toString())
              resolve(ret)
            } catch (e) {
              e.message += `str"${buff.toString()}"`
              reject(e)
            }
          } else if (encoding === 'string') {
            resolve(buff.toString())
          }
        }))
      }
    })
    req.on('error', reject)
    if (body) {
      if (Buffer.isBuffer(body)) {
        req.end(body)
      } else if (isStream(body)) {
        body.pipe(req)
      } else if (typeof body === 'object') {
        req.end(JSON.stringify(body))
      } else {
        reject(new Error('Unknown body type.'))
      }
    } else {
      req.end()
    }
  })
}

module.exports = bent(mkrequest)
