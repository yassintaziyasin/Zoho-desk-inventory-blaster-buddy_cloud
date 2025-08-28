// In server/index.js

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg'); // Import the Pool
const {
    readProfiles,
    parseError,
    getValidAccessToken,
    makeApiCall,
    createJobId
} = require('./utils');
const deskHandler = require('./desk-handler');
const inventoryHandler = require('./inventory-handler');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "http://localhost:8080" } });

// Initialize the database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


const port = process.env.PORT || 3000;
const REDIRECT_URI = `http://localhost:${port}/api/zoho/callback`;

const activeJobs = {};
deskHandler.setActiveJobs(activeJobs);
inventoryHandler.setActiveJobs(activeJobs);

const authStates = {};

app.use(cors());
app.use(express.json());

// --- ZOHO AUTH FLOW (Unchanged) ---
app.post('/api/zoho/auth', (req, res) => {
    const { clientId, clientSecret, socketId } = req.body;
    if (!clientId || !clientSecret || !socketId) {
        return res.status(400).send('Client ID, Client Secret, and Socket ID are required.');
    }

    const state = crypto.randomBytes(16).toString('hex');
    authStates[state] = { clientId, clientSecret, socketId };

    setTimeout(() => delete authStates[state], 300000);

    const combinedScopes = 'Desk.tickets.ALL,Desk.settings.ALL,Desk.basic.READ,ZohoInventory.contacts.ALL,ZohoInventory.invoices.ALL,ZohoInventory.settings.ALL,ZohoInventory.settings.UPDATE,ZohoInventory.settings.READ';
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=${combinedScopes}&client_id=${clientId}&response_type=code&access_type=offline&redirect_uri=${REDIRECT_URI}&prompt=consent&state=${state}`;

    res.json({ authUrl });
});

app.get('/api/zoho/callback', async (req, res) => {
    const { code, state } = req.query;
    const authData = authStates[state];
    if (!authData) {
        return res.status(400).send('<h1>Error</h1><p>Invalid or expired session state. Please try generating the token again.</p>');
    }
    delete authStates[state];

    try {
        const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
        const params = new URLSearchParams();
        params.append('code', code);
        params.append('client_id', authData.clientId);
        params.append('client_secret', authData.clientSecret);
        params.append('redirect_uri', REDIRECT_URI);
        params.append('grant_type', 'authorization_code');

        const axios = require('axios');
        const response = await axios.post(tokenUrl, params);
        const { refresh_token } = response.data;

        if (!refresh_token) {
            throw new Error('Refresh token not found in Zoho\'s response.');
        }

        io.to(authData.socketId).emit('zoho-refresh-token', { refreshToken: refresh_token });
        res.send('<h1>Success!</h1><p>You can now close this window. The token has been sent to the application.</p><script>window.close();</script>');

    } catch (error) {
        const { message } = parseError(error);
        io.to(authData.socketId).emit('zoho-refresh-token-error', { error: message });
        res.status(500).send(`<h1>Error</h1><p>Failed to get token: ${message}. Please close this window and try again.</p>`);
    }
});


// --- SINGLE TICKET AND INVOICE REST ENDPOINTS (Now async) ---
app.post('/api/tickets/single', async (req, res) => {
    try {
        // We now need to pass the full profiles list to the handler
        const profiles = await readProfiles();
        const result = await deskHandler.handleSendSingleTicket(req.body, profiles);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
    }
});

app.post('/api/tickets/verify', async (req, res) => {
    try {
        const profiles = await readProfiles();
        const result = await deskHandler.handleVerifyTicketEmail(req.body, profiles);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
    }
});

app.post('/api/invoices/single', async (req, res) => {
    try {
        const profiles = await readProfiles();
        const result = await inventoryHandler.handleSendSingleInvoice(req.body, profiles);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
    }
});


// --- PROFILE MANAGEMENT API (Updated for Database) ---
app.get('/api/profiles', async (req, res) => {
    try {
        const allProfiles = await readProfiles();
        res.json(allProfiles);
    } catch (error) {
        res.status(500).json({ message: "Could not load profiles." });
    }
});

app.post('/api/profiles', async (req, res) => {
    try {
        const { profileName, clientId, clientSecret, refreshToken, desk, inventory } = req.body;
        if (!profileName) {
            return res.status(400).json({ success: false, error: "Profile name is required." });
        }

        const query = `
            INSERT INTO profiles (
                profileName, clientId, clientSecret, refreshToken,
                deskOrgId, deskDepartmentId, deskFromEmail, deskMailReplyId,
                inventoryOrgId
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        const values = [
            profileName, clientId, clientSecret, refreshToken,
            desk?.orgId, desk?.defaultDepartmentId, desk?.fromEmailAddress, desk?.mailReplyAddressId,
            inventory?.orgId
        ];

        await pool.query(query, values);
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding profile:', error);
        if (error.code === '23505') { // Unique constraint violation
            res.status(400).json({ success: false, error: "A profile with this name already exists." });
        } else {
            res.status(500).json({ success: false, error: "Failed to add profile." });
        }
    }
});

app.put('/api/profiles/:profileNameToUpdate', async (req, res) => {
    try {
        const { profileNameToUpdate } = req.params;
        const { profileName, clientId, clientSecret, refreshToken, desk, inventory } = req.body;

        const query = `
            UPDATE profiles SET
                profileName = $1, clientId = $2, clientSecret = $3, refreshToken = $4,
                deskOrgId = $5, deskDepartmentId = $6, deskFromEmail = $7, deskMailReplyId = $8,
                inventoryOrgId = $9
            WHERE profileName = $10
        `;
        const values = [
            profileName, clientId, clientSecret, refreshToken,
            desk?.orgId, desk?.defaultDepartmentId, desk?.fromEmailAddress, desk?.mailReplyAddressId,
            inventory?.orgId,
            profileNameToUpdate
        ];

        const result = await pool.query(query, values);
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: "Profile not found." });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating profile:', error);
         if (error.code === '23505') {
            res.status(400).json({ success: false, error: "A profile with the new name already exists." });
        } else {
            res.status(500).json({ success: false, error: "Failed to update profile." });
        }
    }
});


// --- SOCKET.IO CONNECTION HANDLING (Now async) ---
io.on('connection', (socket) => {
    console.log(`[INFO] New connection. Socket ID: ${socket.id}`);

    socket.on('checkApiStatus', async (data) => {
        try {
            const { selectedProfileName, service = 'desk' } = data;
            const profiles = await readProfiles();
            const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
            if (!activeProfile) throw new Error("Profile not found");

            // ... (rest of the function is the same, no changes needed here)
        } catch (error) {
            // ... (error handling is the same)
        }
    });

    // ... (pause, resume, end, disconnect listeners are the same)

    const setupListeners = (handler, handlerModule) => {
        for (const [event, handlerFunc] of Object.entries(handler)) {
            socket.on(event, async (data) => {
                try {
                    const profiles = await readProfiles();
                    const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null;
                    await handlerFunc(socket, { ...data, activeProfile });
                } catch(error) {
                    console.error(`Error in socket event '${event}':`, error);
                }
            });
        }
    }

    const deskListeners = {
        'startBulkCreate': deskHandler.handleStartBulkCreate,
        'getEmailFailures': deskHandler.handleGetEmailFailures,
        'clearEmailFailures': deskHandler.handleClearEmailFailures,
        'getMailReplyAddressDetails': deskHandler.handleGetMailReplyAddressDetails,
        'updateMailReplyAddressDetails': deskHandler.handleUpdateMailReplyAddressDetails,
    };
    setupListeners(deskListeners, deskHandler);

    const inventoryListeners = {
        'startBulkInvoice': inventoryHandler.handleStartBulkInvoice,
        'getOrgDetails': inventoryHandler.handleGetOrgDetails,
        'updateOrgDetails': inventoryHandler.handleUpdateOrgDetails,
        'getInvoices': inventoryHandler.handleGetInvoices,
        'deleteInvoices': inventoryHandler.handleDeleteInvoices,
    };
    setupListeners(inventoryListeners, inventoryHandler);

     socket.on('clearTicketLogs', async () => {
        try {
            await pool.query('DELETE FROM ticket_logs');
            console.log('[DB INFO] Ticket logs cleared.');
        } catch (error) {
            console.error('[DB ERROR] Could not clear ticket logs:', error);
        }
    });
});


// In server/index.js

// ... (keep all the existing code above this)

// --- Serve Frontend ---
const path = require('path');
app.use(express.static(path.join(__dirname, '..', 'dist')));

// Handle client-side routing by serving index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.originalUrl.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    // If it's an API route that doesn't exist, let it 404
    res.status(404).send('API route not found');
  }
});


server.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
});