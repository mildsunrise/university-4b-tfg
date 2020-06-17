// May not work with old Node.JS versions,
// see https://github.com/nodejs/node/pull/32006

const { writeFileSync, createReadStream } = require('fs')
const path = require('path')
const express = require('express')
const readline = require('readline')
const { execSync } = require('child_process')

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
    const pageSize = Number(execSync('getconf PAGESIZE'))
    // You may need to `sudo mount -t tracefs tracefs /sys/kernel/tracing` first
    const traceFsBase = '/sys/kernel/tracing'

    //writeFileSync(path.join(traceFsBase, 'current_tracer'), 'nop')
    writeFileSync(path.join(traceFsBase, 'trace_clock'), 'mono')
    writeFileSync(path.join(traceFsBase, 'tracing_on'), '1')

    const subscribeToEvent = (name) =>
        writeFileSync(path.join(traceFsBase, 'events', name, 'enable'), '1')

    subscribeToEvent('writeback/global_dirty_state')
    subscribeToEvent('writeback/balance_dirty_pages')

    const eventsPipe = readline.createInterface({
        input: createReadStream(path.join(traceFsBase, 'trace_pipe')),
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
            io.emit('global_dirty_state', { ...parsedInfo, pageSize })
            stateTimer = setTimeout(() => stateTimer = null, 100)
        } else {
            console.log('Got event', event, info)
        }
    })
}

