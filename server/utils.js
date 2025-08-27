const { Pool } = require('pg');
const axios = require('axios');

// The connection string will be provided by Zeabur as an environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // The error "The server does not support SSL connections" indicates we should disable it
  // for Zeabur's internal network.
  ssl: false
});

const tokenCache = {};

const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('executed query', { text, duration, rows: res.rowCount });
  return res;
};

// This function will create the necessary tables if they don't exist
const createTables = async () => {
  const createProfilesTable = `
    CREATE TABLE IF NOT EXISTS profiles (
      id SERIAL PRIMARY KEY,
      "profileName" VARCHAR(255) UNIQUE NOT NULL,
      "clientId" VARCHAR(255) NOT NULL,
      "clientSecret" VARCHAR(255) NOT NULL,
      "refreshToken" TEXT NOT NULL,
      desk JSONB,
      inventory JSONB
    );
  `;
  const createTicketLogTable = `
    CREATE TABLE IF NOT EXISTS ticket_log (
      id SERIAL PRIMARY KEY,
      "ticketNumber" VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await query(createProfilesTable);
  await query(createTicketLogTable);
};

// Initialize the database tables when the server starts
createTables().catch(console.error);

const readProfiles = async () => {
  const { rows } = await query('SELECT * FROM profiles');
  return rows;
};

const addProfile = async (profile) => {
  const { profileName, clientId, clientSecret, refreshToken, desk, inventory } = profile;
  const { rows } = await query(
    'INSERT INTO profiles ("profileName", "clientId", "clientSecret", "refreshToken", desk, inventory) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [profileName, clientId, clientSecret, refreshToken, JSON.stringify(desk), JSON.stringify(inventory)]
  );
  return rows[0];
};

const updateProfile = async (profileNameToUpdate, updatedProfileData) => {
  const { profileName, clientId, clientSecret, refreshToken, desk, inventory } = updatedProfileData;
  const { rows } = await query(
    'UPDATE profiles SET "profileName" = $1, "clientId" = $2, "clientSecret" = $3, "refreshToken" = $4, desk = $5, inventory = $6 WHERE "profileName" = $7 RETURNING *',
    [profileName, clientId, clientSecret, refreshToken, JSON.stringify(desk), JSON.stringify(inventory), profileNameToUpdate]
  );
  return rows[0];
};

const readTicketLog = async () => {
  const { rows } = await query('SELECT * FROM ticket_log ORDER BY created_at DESC');
  return rows;
};

const writeToTicketLog = async (newEntry) => {
  const { ticketNumber, email } = newEntry;
  await query('INSERT INTO ticket_log ("ticketNumber", email) VALUES ($1, $2)', [ticketNumber, email]);
};

const clearTicketLog = async () => {
  await query('DELETE FROM ticket_log');
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
    readProfiles,
    addProfile,
    updateProfile,
    readTicketLog,
    writeToTicketLog,
    clearTicketLog,
    createJobId,
    parseError,
    getValidAccessToken,
    makeApiCall
};
