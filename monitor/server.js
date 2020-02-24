const { promisify } = require('util')
const fs = require('fs')
const path = require('path')
const express = require('express')
const readline = require('readline')

const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server)

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html')
})

app.use(express.static(__dirname + '/public'))

setupEvents()

server.listen(4444, () => {
    console.log(`App listening on http://localhost:${server.address().port}`)
})


// LINUX EVENT TRACING

function setupEvents() {
    // You may need to `sudo mount -t tracefs tracefs /sys/kernel/tracing` first
    const traceFsBase = '/sys/kernel/debug/tracing'

    //fs.writeFileSync(path.join(traceFsBase, 'current_tracer'), 'nop')
    writeFileSync(path.join(traceFsBase, 'trace_clock'), 'mono')
    writeFileSync(path.join(traceFsBase, 'tracing_on'), '1')

    subscribeToEvent('writeback/global_dirty_state')
    subscribeToEvent('writeback/balance_dirty_pages')
    
    const eventsPipe = readline.createInterface({
        input: fs.createReadStream(path.join(traceFsBase, 'trace_pipe')),
    })

    let stateTimer
    eventsPipe.on('line', line => {
        // FIXME: parse timestamp and these other things
        const m = /^[^:]+ ([\d.]+): (\w+): (.+)$/.exec(line)
        if (!m) return console.log('Unparseable event:', util.inspect(line))
        const [ _, timestamp, event, info ] = [...m]
        if (event === 'global_dirty_state') {
            const parsedInfo = {}
            info.split(' ').forEach(x => {
                const m = /^(\w+)=(\d+)$/.exec(x)
                parsedInfo[m[1]] = Number(m[2])
            })
            if (stateTimer) return
            io.emit('global_dirty_state', parsedInfo)
            stateTimer = setTimeout(() => stateTimer = null, 100)
        } else {
            console.log('Got event', event, info)
        }
    })

    function subscribeToEvent(name, callback) {
        // Build the parser
        const parser = buildParser(name)
        // Enable the event
        writeFileSync(path.join(traceFsBase, 'events', name, 'enable'), '1')
        // TODO
    }
    
    function buildParser(name) {
        const formatFile = path.join(traceFsBase, 'events', name, 'format')
        const lines = fs.readFileSync(formatFile, 'ascii').split('\n')
        let expectedSize = 0
        const fieldCode = []
        lines.forEach(line => {
            if (!/^[\t]field:(.*)$/.test(line)) return
            const m = /^\tfield:(?:((unsigned) )?(\w+) (\w+)\s*(?:\[(\w+)\])?);\toffset:(\d+);\tsize:(\d+);\tsigned:([01]);$/.exec(line)
            if (!m) throw Error(`Can't parse line: ${line}`)
            const [ qualifier, type, name, length, offset, size, signed ] = [m[2], m[3], m[4], m[5], Number(m[6]), Number(m[7]), Number(m[8])]
            if (length) {
                // we only support char (strings) for now
                if (qualifier || type !== 'char') throw Error(`Don't know how to parse: ${line}`)
                fieldCode.push(`result.${name} = getCString(data.slice(${offset}, ${offset + size}))`)
            } else {
                const associations = { 1: 'char', 2: 'short', 4: 'int', 8: 'long' }
                if (!{}.hasOwnProperty.call(associations, size) /*|| associations[size] !== type*/)
                    throw Error(`Don't know how to parse: ${line}`)
                const method = (size === 8 ? 'Big' : '') + (signed ? '' : 'U') + 'Int' + (size*8) + (size === 1 ? '' : 'LE')
                fieldCode.push(`result.${name} = data.read${method}(${offset})`)
                expectedSize = Math.max(expectedSize, offset + size)
            }
        })
        fieldCode.unshift('const result = {}')
        fieldCode.unshift(`if (data.length !== ${expectedSize}) throw new Error('Unexpected data length')`)
        fieldCode.push('return result')
        return new Function('getCString', 'data', fieldCode.join('\n')).bind(null, getCString)
    }
}

function getCString(x) {
    const idx = x.indexOf(0)
    if (idx === -1) throw Error('No null terminator')
    return x.slice(0, idx).toString('utf-8')
}

function parseStats(s) {
    const fields = s.trim().split('\n').map(x => /^([\w ]+): (\d+)$/.exec(x))
    return new Map(fields.map(x => [ x[1], Number(x[2]) ]))
}

// See https://github.com/nodejs/node/issues/31926
function writeFileSync(path, data) {
    const fd = fs.openSync(path, 'w')
    try {
        fs.writeSync(fd, data)
    } finally {
        fs.closeSync(fd)
    }
}
