const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PROFILES_PATH = path.join(__dirname, 'profiles.json');
const TICKET_LOG_PATH = path.join(__dirname, 'ticket-log.json');
const tokenCache = {};

const readProfiles = () => {
    try {
        if (fs.existsSync(PROFILES_PATH)) {
            const data = fs.readFileSync(PROFILES_PATH);
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('[ERROR] Could not read profiles.json:', error);
    }
    return [];
};

const writeProfiles = (profiles) => {
    try {
        fs.writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2));
    } catch (error) {
        console.error('[ERROR] Could not write to profiles.json:', error);
    }
};

const readTicketLog = () => {
    try {
        if (fs.existsSync(TICKET_LOG_PATH)) {
            const data = fs.readFileSync(TICKET_LOG_PATH);
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('[ERROR] Could not read ticket-log.json:', error);
    }
    return [];
};

const writeToTicketLog = (newEntry) => {
    const log = readTicketLog();
    log.push(newEntry);
    try {
        fs.writeFileSync(TICKET_LOG_PATH, JSON.stringify(log, null, 2));
    } catch (error) {
        console.error('[ERROR] Could not write to ticket-log.json:', error);
    }
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
    writeProfiles,
    readTicketLog,
    writeToTicketLog,
    createJobId,
    parseError,
    getValidAccessToken,
    makeApiCall
};