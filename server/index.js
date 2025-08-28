const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const crypto = require('crypto');
const { initializeDatabase } = require('./db'); // Import the initializer
const { getProfiles, createProfile, updateProfile, parseError, clearTicketLogs } = require('./utils');
const deskHandler = require('./desk-handler');
const inventoryHandler = require('./inventory-handler');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } }); // Allow all origins for simplicity in deployment

const port = process.env.PORT || 3000;
// Use environment variable for redirect URI in production
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI || `http://localhost:${port}/api/zoho/callback`;

const activeJobs = {};
deskHandler.setActiveJobs(activeJobs);
inventoryHandler.setActiveJobs(activeJobs);

const authStates = {};

app.use(cors());
app.use(express.json());

// --- ZOHO AUTH FLOW ---
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

// --- SINGLE TICKET AND INVOICE REST ENDPOINTS ---
app.post('/api/tickets/single', async (req, res) => {
    try {
        const result = await deskHandler.handleSendSingleTicket(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
    }
});

app.post('/api/tickets/verify', async (req, res) => {
    try {
        const result = await deskHandler.handleVerifyTicketEmail(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
    }
});

app.post('/api/invoices/single', async (req, res) => {
    try {
        const result = await inventoryHandler.handleSendSingleInvoice(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
    }
});

// --- PROFILE MANAGEMENT API ---
app.get('/api/profiles', async (req, res) => {
    try {
        const allProfiles = await getProfiles();
        res.json(allProfiles);
    } catch (error) {
        res.status(500).json({ message: "Could not load profiles." });
    }
});

app.post('/api/profiles', async (req, res) => {
    try {
        const newProfile = req.body;
        if (!newProfile || !newProfile.profileName) {
            return res.status(400).json({ success: false, error: "Profile name is required." });
        }
        await createProfile(newProfile);
        const allProfiles = await getProfiles();
        res.json({ success: true, profiles: allProfiles });
    } catch (error) {
        if (error.constraint === 'profiles_profile_name_key') {
             return res.status(400).json({ success: false, error: "A profile with this name already exists." });
        }
        res.status(500).json({ success: false, error: "Failed to add profile." });
    }
});

app.put('/api/profiles/:profileNameToUpdate', async (req, res) => {
    try {
        const { profileNameToUpdate } = req.params;
        const updatedProfileData = req.body;
        await updateProfile(profileNameToUpdate, updatedProfileData);
        const allProfiles = await getProfiles();
        res.json({ success: true, profiles: allProfiles });
    } catch (error) {
        if (error.constraint === 'profiles_profile_name_key') {
             return res.status(400).json({ success: false, error: "A profile with the new name already exists." });
        }
        res.status(500).json({ success: false, error: "Failed to update profile." });
    }
});


// --- SOCKET.IO CONNECTION HANDLING ---
io.on('connection', (socket) => {
    console.log(`[INFO] New connection. Socket ID: ${socket.id}`);

    socket.on('checkApiStatus', async (data) => {
        try {
            const { selectedProfileName, service = 'desk' } = data;
            const profiles = await getProfiles();
            const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
            if (!activeProfile) throw new Error("Profile not found");
            
            // Re-import makeApiCall here to avoid circular dependency issues if utils needs it
            const { makeApiCall, getValidAccessToken } = require('./utils');
            const tokenResponse = await getValidAccessToken(activeProfile, service);

            let validationData = {};
            if (service === 'inventory') {
                if (!activeProfile.inventory || !activeProfile.inventory.orgId) {
                    throw new Error('Inventory Organization ID is not configured for this profile.');
                }
                const orgsResponse = await makeApiCall('get', '/v1/organizations', null, activeProfile, 'inventory');
                const currentOrg = orgsResponse.data.organizations.find(org => org.organization_id === activeProfile.inventory.orgId);
                if (!currentOrg) throw new Error('Inventory Organization ID is invalid or does not match this profile.');
                validationData = { 
                    orgName: currentOrg.name, 
                    agentInfo: { firstName: currentOrg.contact_name, lastName: '' } 
                };

            } else { // Default to 'desk'
                if (!activeProfile.desk || !activeProfile.desk.orgId) {
                    throw new Error('Desk Organization ID is not configured for this profile.');
                }
                const agentResponse = await makeApiCall('get', '/api/v1/myinfo', null, activeProfile, 'desk');
                 validationData = { 
                    agentInfo: agentResponse.data,
                    orgName: agentResponse.data.orgName 
                };
            }

            socket.emit('apiStatusResult', { 
                success: true, 
                message: `Connection to Zoho ${service.charAt(0).toUpperCase() + service.slice(1)} API is successful.`,
                fullResponse: { ...tokenResponse, ...validationData }
            });
        } catch (error) {
            const { message, fullResponse } = parseError(error);
            socket.emit('apiStatusResult', { 
                success: false, 
                message: `Connection failed: ${message}`,
                fullResponse: fullResponse
            });
        }
    });

    socket.on('pauseJob', ({ profileName, jobType }) => {
        const jobId = createJobId(socket.id, profileName, jobType);
        if (activeJobs[jobId]) activeJobs[jobId].status = 'paused';
    });

    socket.on('resumeJob', ({ profileName, jobType }) => {
        const jobId = createJobId(socket.id, profileName, jobType);
        if (activeJobs[jobId]) activeJobs[jobId].status = 'running';
    });

    socket.on('endJob', ({ profileName, jobType }) => {
        const jobId = createJobId(socket.id, profileName, jobType);
        if (activeJobs[jobId]) activeJobs[jobId].status = 'ended';
    });

    socket.on('disconnect', () => {
        Object.keys(activeJobs).forEach(jobId => {
            if (jobId.startsWith(socket.id)) delete activeJobs[jobId];
        });
    });

    // --- ZOHO DESK LISTENERS (delegated to desk-handler) ---
    const deskListeners = {
        'startBulkCreate': deskHandler.handleStartBulkCreate,
        'getEmailFailures': deskHandler.handleGetEmailFailures,
        'clearEmailFailures': deskHandler.handleClearEmailFailures,
        'clearTicketLogs': async (socket) => {
            try {
                await clearTicketLogs();
                socket.emit('clearTicketLogsResult', { success: true });
            } catch (error) {
                socket.emit('clearTicketLogsResult', { success: false, error: 'Failed to clear logs.' });
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

    // --- ZOHO INVENTORY LISTENERS (delegated to inventory-handler) ---
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


// Start the server after initializing the database
initializeDatabase().then(() => {
    server.listen(port, () => {
        console.log(`🚀 Server is running on http://localhost:${port}`);
    });
});
