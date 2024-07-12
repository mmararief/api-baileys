const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@adiwajshing/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('http');
const path = require('path');
const QRCode = require('qrcode');
const fs = require('fs/promises');
const cors = require('cors');  // Import cors

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(cors());  // Use cors

let sock;
let isAuthenticated = false;



const startSock = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        version: [2, 2413, 1],
    });



    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;
        if (qr) {
            console.log('QR RECEIVED', qr);
            const qrCodeDataURL = await QRCode.toDataURL(qr);
            io.emit('qr', qrCodeDataURL);
        }

        if (connection === 'open') {
            console.log('WhatsApp connected');
            isAuthenticated = true;
            io.emit('authenticated', true);
        }

        if (connection === 'close') {
            isAuthenticated = false;
            const shouldReconnect = (update.lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startSock();
            } else {
                io.emit('authenticated', false);
            }
        }
    });

    sock.ev.on('chats.set', () => {
        // can use "store.chats" however you want, even after the socket dies out
        // "chats" => a KeyedDB instance
        console.log('got chats', store.chats.all())
    })
    

    sock.ev.on('contacts.set', () => {
        console.log('got contacts', Object.values(store.contacts))
    })

    

    sock.ev.on('creds.update', saveCreds);

    return sock;
};

startSock();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/auth-status', async (req, res) => {
    res.status(200).json({ authenticated: isAuthenticated });
});

app.post('/logout', async (req, res) => {
    if (sock) {
        await sock.logout();
        await fs.rm('auth_info_baileys', { recursive: true, force: true });
        isAuthenticated = false;
        io.emit('authenticated', false);
        res.status(200).send('Logged out');
        startSock(); 
    } else {
        res.status(400).send('No active session');
    }
});

app.get('/current-user', async (req, res) => {
    if (currentUser) {
      res.status(200).json(currentUser);
    } else {
      res.status(404).send('No user logged in');
    }
  });

app.post('/send-message', async (req, res) => {
    let { phoneNumber, message } = req.body;
    if (!phoneNumber || !message) {
        return res.status(400).send('Phone number and message are required');
    }

    if (!phoneNumber.endsWith('@s.whatsapp.net')) {
        phoneNumber = `${phoneNumber}@s.whatsapp.net`;
    }

    try {
        await sock.sendMessage(phoneNumber, { text: message });
        res.status(200).send('Message sent');
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).send('Failed to send message');
    }
});

io.on('connection', (socket) => {
    console.log('Client connected');
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
