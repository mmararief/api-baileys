const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@adiwajshing/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('http');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const server = createServer(app);
const io = new Server(server);

const startSock = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        version: [2, 2413, 1],
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        if (qr) {
            console.log('QR RECEIVED', qr);
            const qrCodeDataURL = await QRCode.toDataURL(qr);
            io.emit('qr', qrCodeDataURL);
        }

        if (connection === 'close') {
            const shouldReconnect = (update.lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startSock();
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
}

startSock();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log('Client connected');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
