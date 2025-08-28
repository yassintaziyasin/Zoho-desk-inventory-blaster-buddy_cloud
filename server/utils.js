const axios = require('axios');
const db = require('./db'); // Import the new db module

const tokenCache = {};

// Fetches all profiles from the database
const getProfiles = async () => {
    try {
        const { rows } = await db.query('SELECT * FROM profiles ORDER BY profile_name ASC');
        // The database returns snake_case, but the app uses camelCase.
        // We need to map the column names.
        return rows.map(p => ({
            profileName: p.profile_name,
            clientId: p.client_id,
            clientSecret: p.client_secret,
            refreshToken: p.refresh_token,
            desk: p.desk_config,
            inventory: p.inventory_config
        }));
    } catch (error) {
        console.error('[ERROR] Could not read profiles from database:', error);
        return [];
    }
};

// Creates a new profile in the database
const createProfile = (profileData) => {
    const { profileName, clientId, clientSecret, refreshToken, desk, inventory } = profileData;
    const query = `
        INSERT INTO profiles(profile_name, client_id, client_secret, refresh_token, desk_config, inventory_config)
        VALUES($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;
    const values = [profileName, clientId, clientSecret, refreshToken, JSON.stringify(desk), JSON.stringify(inventory)];
    return db.query(query, values);
};

// Updates an existing profile in the database
const updateProfile = (originalProfileName, profileData) => {
    const { profileName, clientId, clientSecret, refreshToken, desk, inventory } = profileData;
    const query = `
        UPDATE profiles
        SET profile_name = $1, client_id = $2, client_secret = $3, refresh_token = $4, desk_config = $5, inventory_config = $6
        WHERE profile_name = $7
        RETURNING *;
    `;
    const values = [profileName, clientId, clientSecret, refreshToken, JSON.stringify(desk), JSON.stringify(inventory), originalProfileName];
    return db.query(query, values);
};


// Writes a new ticket log entry to the database
const writeToTicketLog = (newEntry) => {
    const { ticketNumber, email } = newEntry;
    const query = 'INSERT INTO ticket_logs(ticket_number, email) VALUES($1, $2)';
    db.query(query, [ticketNumber, email]).catch(err => console.error('[ERROR] Could not write to ticket_logs table:', err));
};

// Clears all entries from the ticket_logs table
const clearTicketLogs = () => {
    return db.query('DELETE FROM ticket_logs');
};


const createJobId = (socketId, profileName, jobType) => `${socketId}_${profileName}_${jobType}`;

const parseError = (error) => {
    if (error.response) {
        if (error.response.data && error.response.data.message) {
            return {
                message: error.response.data.message,
                fullResponse: error.response.data
            };
        }
        if (typeof error.response.data === 'string' && error.response.data.includes('<title>')) {
            const titleMatch = error.response.data.match(/<title>(.*?)<\/title>/);
            const title = titleMatch ? titleMatch[1] : 'HTML Error Page Received';
            return {
                message: `Zoho Server Error: ${title}`,
                fullResponse: error.response.data
            };
        }
        return {
            message: `HTTP Error ${error.response.status}: ${error.response.statusText}`,
            fullResponse: error.response.data || error.response.statusText
        };
    } else if (error.request) {
        return {
            message: 'Network Error: No response received from Zoho API.',
            fullResponse: error.message
        };
    }
    return {
        message: error.message || 'An unknown error occurred.',
        fullResponse: error.stack
    };
};

const getValidAccessToken = async (profile, service) => {
    const now = Date.now();
    const cacheKey = `${profile.profileName}_${service}`;

    if (tokenCache[cacheKey] && tokenCache[cacheKey].data.access_token && tokenCache[cacheKey].expiresAt > now) {
        return tokenCache[cacheKey].data;
    }

    const scopes = {
        desk: 'Desk.tickets.ALL,Desk.settings.ALL',
        inventory: 'ZohoInventory.contacts.ALL,ZohoInventory.invoices.ALL,ZohoInventory.settings.ALL,ZohoInventory.settings.UPDATE'
    };

    const serviceScopes = scopes[service] || scopes.desk + ',' + scopes.inventory;

    try {
        const params = new URLSearchParams({
            refresh_token: profile.refreshToken,
            client_id: profile.clientId,
            client_secret: profile.clientSecret,
            grant_type: 'refresh_token',
            scope: serviceScopes
        });

        const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', params);
        
        if (response.data.error) {
            throw new Error(response.data.error);
        }
        
        const { expires_in } = response.data;
        tokenCache[cacheKey] = { data: response.data, expiresAt: now + ((expires_in - 60) * 1000) };
        return response.data;

    } catch (error) {
        const { message } = parseError(error);
        console.error(`TOKEN_REFRESH_FAILED for ${profile.profileName} (${service}):`, message);
        throw error;
    }
};

const makeApiCall = async (method, relativeUrl, data, profile, service) => {
    const tokenResponse = await getValidAccessToken(profile, service);
    const accessToken = tokenResponse.access_token;
    if (!accessToken) {
        throw new Error('Failed to retrieve a valid access token.');
    }

    const serviceConfig = profile[service];
    if (!serviceConfig || !serviceConfig.orgId) {
        throw new Error(`Configuration for service "${service}" or its orgId is missing in profile "${profile.profileName}".`);
    }

    const baseUrls = {
        desk: 'https://desk.zoho.com',
        inventory: 'https://www.zohoapis.com/inventory'
    };
    
    const baseUrl = baseUrls[service];
    const fullUrl = `${baseUrl}${relativeUrl}`;
    const orgId = serviceConfig.orgId;

    const headers = { 
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        ...(service === 'desk' && { 'orgId': orgId })
    };

    const params = service === 'inventory' ? { organization_id: orgId } : {};
    
    return axios({ method, url: fullUrl, data, headers, params });
};


module.exports = {
    getProfiles,
    createProfile,
    updateProfile,
    writeToTicketLog,
    clearTicketLogs,
    createJobId,
    parseError,
    getValidAccessToken,
    makeApiCall
};
