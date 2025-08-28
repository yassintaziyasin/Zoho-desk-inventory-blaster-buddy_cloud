// In server/utils.js

const { Pool } = require('pg');
const axios = require('axios');

// Zeabur will provide the DATABASE_URL environment variable automatically.
// For local development, you'll need to set this yourself.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const tokenCache = {};

// --- PROFILES MANAGEMENT ---

const readProfiles = async () => {
  try {
    const result = await pool.query('SELECT * FROM profiles');
    // Convert database rows to the nested structure the app expects
    return result.rows.map(row => ({
      profileName: row.profilename,
      clientId: row.clientid,
      clientSecret: row.clientsecret,
      refreshToken: row.refreshtoken,
      desk: {
        orgId: row.deskorgid,
        defaultDepartmentId: row.deskdepartmentid,
        fromEmailAddress: row.deskfromemail,
        mailReplyAddressId: row.deskmailreplyid,
      },
      inventory: {
        orgId: row.inventoryorgid,
      },
    }));
  } catch (error) {
    console.error('[DB ERROR] Could not read profiles:', error);
    return [];
  }
};

const writeProfiles = async (profiles) => {
    // This function is more complex now as it needs to handle updates and inserts.
    // For simplicity, we will handle this in the API endpoints directly.
    // This function can be a placeholder or removed.
    console.log("Profile writing is now handled directly in the API endpoints.");
};


// --- TICKET LOG MANAGEMENT ---

const readTicketLog = async () => {
    try {
        const result = await pool.query('SELECT * FROM ticket_logs ORDER BY "createdAt" DESC');
        return result.rows;
    } catch (error) {
        console.error('[DB ERROR] Could not read ticket-log:', error);
        return [];
    }
}

const writeToTicketLog = async (newEntry) => {
    try {
        const { ticketNumber, email } = newEntry;
        await pool.query(
            'INSERT INTO ticket_logs ("ticketNumber", email) VALUES ($1, $2)',
            [ticketNumber, email]
        );
    } catch (error) {
        console.error('[DB ERROR] Could not write to ticket-log:', error);
    }
}

// --- JOB AND API UTILS (Unchanged) ---

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
    writeProfiles, // We keep this export for now to avoid breaking other files
    readTicketLog,
    writeToTicketLog,
    createJobId,
    parseError,
    getValidAccessToken,
    makeApiCall
};