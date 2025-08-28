const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const { 
    prisma, 
    getProfiles, 
    parseError, 
    getValidAccessToken, 
    makeApiCall, 
    createJobId,
    clearAllTicketLogs
} = require('./utils');
const deskHandler = require('./desk-handler');
const inventoryHandler = require('./inventory-handler');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const frontendUrl = process.env.PUBLIC_URL || 'http://localhost:8080';
const port = process.env.PORT || 3000;
const REDIRECT_URI = `${frontendUrl}/api/zoho/callback`;

const io = new Server(server, { 
    cors: { 
        origin: frontendUrl,
        methods: ["GET", "POST"]
    } 
});

const activeJobs = {};
deskHandler.setActiveJobs(activeJobs);
inventoryHandler.setActiveJobs(activeJobs);
const authStates = {};

app.use(cors({ origin: frontendUrl }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.post('/api/zoho/auth', (req, res) => {
    const { clientId, clientSecret, socketId } = req.body;
    if (!clientId || !clientSecret || !socketId) {
        return res.status(400).send('Client ID, Client Secret, and Socket ID are required.');
    }
    const state = crypto.randomBytes(16).toString('hex');
    authStates[state] = { clientId, clientSecret, socketId };
    setTimeout(() => delete authStates[state], 300000);
    const combinedScopes = 'Desk.tickets.ALL,Desk.settings.ALL,Desk.basic.READ,ZohoInventory.contacts.ALL,ZohoInventory.invoices.ALL,ZohoInventory.settings.ALL,ZohoInventory.settings.UPDATE,ZohoInventory.settings.READ';
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=${combinedScopes}&client_id=${clientId.trim()}&response_type=code&access_type=offline&redirect_uri=${REDIRECT_URI}&prompt=consent&state=${state}`;
    res.json({ authUrl });
});

app.get('/api/zoho/callback', async (req, res) => {
    const { code, state } = req.query;
    const authData = authStates[state];
    if (!authData) return res.status(400).send('<h1>Error</h1><p>Invalid or expired session state.</p>');
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
        if (!refresh_token) throw new Error('Refresh token not found.');
        io.to(authData.socketId).emit('zoho-refresh-token', { refreshToken: refresh_token });
        res.send('<h1>Success!</h1><p>You can close this window.</p><script>window.close();</script>');
    } catch (error) {
        const { message } = parseError(error);
        io.to(authData.socketId).emit('zoho-refresh-token-error', { error: message });
        res.status(500).send(`<h1>Error</h1><p>Failed to get token: ${message}.</p>`);
    }
});

app.get('/api/profiles', async (req, res) => {
    try {
        const allProfiles = await getProfiles();
        res.json(allProfiles);
    } catch (error) {
        console.error('[ERROR] Fetching profiles:', error);
        res.status(500).json({ message: "Could not load profiles from database." });
    }
});

app.post('/api/profiles', async (req, res) => {
    console.log('[INFO] Received request to create profile:', req.body.profileName);
    try {
        const newProfile = req.body;
        if (!newProfile || !newProfile.profileName) {
            return res.status(400).json({ success: false, error: "Profile name is required." });
        }
        const createdProfile = await prisma.profile.create({
            data: {
                profileName: newProfile.profileName.trim(),
                clientId: newProfile.clientId.trim(),
                clientSecret: newProfile.clientSecret.trim(),
                refreshToken: newProfile.refreshToken.trim(),
                deskOrgId: newProfile.desk?.orgId?.trim(),
                defaultDepartmentId: newProfile.desk?.defaultDepartmentId?.trim(),
                fromEmailAddress: newProfile.desk?.fromEmailAddress?.trim(),
                mailReplyAddressId: newProfile.desk?.mailReplyAddressId?.trim(),
                inventoryOrgId: newProfile.inventory?.orgId?.trim(),
            }
        });
        console.log('[SUCCESS] Profile created successfully:', createdProfile.profileName);
        res.json({ success: true, profile: createdProfile });
    } catch (error) {
        console.error('[ERROR] Failed to add profile:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ success: false, error: "A profile with this name already exists." });
        }
        res.status(500).json({ success: false, error: "Failed to add profile to database." });
    }
});

app.put('/api/profiles/:id', async (req, res) => {
    const { id } = req.params;
    console.log('[INFO] Received request to update profile ID:', id);
    try {
        const updatedProfileData = req.body;
        const updatedProfile = await prisma.profile.update({
            where: { id: parseInt(id, 10) },
            data: {
                profileName: updatedProfileData.profileName.trim(),
                clientId: updatedProfileData.clientId.trim(),
                clientSecret: updatedProfileData.clientSecret.trim(),
                refreshToken: updatedProfileData.refreshToken.trim(),
                deskOrgId: updatedProfileData.desk?.orgId?.trim(),
                defaultDepartmentId: updatedProfileData.desk?.defaultDepartmentId?.trim(),
                fromEmailAddress: updatedProfileData.desk?.fromEmailAddress?.trim(),
                mailReplyAddressId: updatedProfileData.desk?.mailReplyAddressId?.trim(),
                inventoryOrgId: updatedProfileData.inventory?.orgId?.trim(),
            }
        });
        console.log('[SUCCESS] Profile updated successfully:', updatedProfile.profileName);
        res.json({ success: true, profile: updatedProfile });
    } catch (error) {
        console.error('[ERROR] Failed to update profile:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ success: false, error: "A profile with the new name already exists." });
        }
        if (error.code === 'P2025') {
             return res.status(404).json({ success: false, error: "Profile not found." });
        }
        res.status(500).json({ success: false, error: "Failed to update profile in database." });
    }
});

// CORRECTED: The route now uses the profile's 'id' for deletion
app.delete('/api/profiles/:id', async (req, res) => {
    const { id } = req.params;
    console.log('[INFO] Received request to delete profile ID:', id);
    try {
        await prisma.profile.delete({
            where: { id: parseInt(id, 10) }
        });
        console.log('[SUCCESS] Profile deleted successfully with ID:', id);
        res.json({ success: true });
    } catch (error) {
        console.error('[ERROR] Failed to delete profile:', error);
        if (error.code === 'P2025') {
             return res.status(404).json({ success: false, error: "Profile not found." });
        }
        res.status(500).json({ success: false, error: "Failed to delete profile from database." });
    }
});

io.on('connection', (socket) => {
    console.log(`[INFO] New connection. Socket ID: ${socket.id}`);
    const deskListeners = {
        'startBulkCreate': deskHandler.handleStartBulkCreate,
        'getEmailFailures': deskHandler.handleGetEmailFailures,
        'clearEmailFailures': deskHandler.handleClearEmailFailures,
        'clearTicketLogs': async (socket) => {
            try {
                await clearAllTicketLogs();
                socket.emit('clearTicketLogsResult', { success: true });
            } catch (error) {
                socket.emit('clearTicketLogsResult', { success: false, error: 'Failed to clear logs from database.' });
            }
        },
        'getMailReplyAddressDetails': deskHandler.handleGetMailReplyAddressDetails,
        'updateMailReplyAddressDetails': deskHandler.handleUpdateMailReplyAddressDetails,
    };
    for (const [event, handler] of Object.entries(deskListeners)) {
        socket.on(event, async (data) => {
            const profiles = await getProfiles();
            const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null;
            handler(socket, { ...data, activeProfile });
        });
    }
    const inventoryListeners = {
        'startBulkInvoice': inventoryHandler.handleStartBulkInvoice,
        'getOrgDetails': inventoryHandler.handleGetOrgDetails,
        'updateOrgDetails': inventoryHandler.handleUpdateOrgDetails,
        'getInvoices': inventoryHandler.handleGetInvoices,
        'deleteInvoices': inventoryHandler.handleDeleteInvoices,
    };
    for (const [event, handler] of Object.entries(inventoryListeners)) {
        socket.on(event, async (data) => {
            const profiles = await getProfiles();
            const activeProfile = data ? profiles.find(p => p.profileName === data.selectedProfileName) : null;
            handler(socket, { ...data, activeProfile });
        });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

server.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
});
