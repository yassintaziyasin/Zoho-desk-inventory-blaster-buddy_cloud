const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

// Create a single, shared instance of the Prisma Client
const prisma = new PrismaClient();

// --- NEW DATABASE FUNCTIONS ---

/**
 * Fetches all profiles from the database.
 * @returns {Promise<Array>} A promise that resolves to an array of profiles.
 */
async function getProfiles() {
    const profilesFromDb = await prisma.profile.findMany();
    // The frontend expects desk and inventory properties to be objects.
    // This function reshapes the flat data from the database into the nested structure the app needs.
    return profilesFromDb.map(p => ({
        profileName: p.profileName,
        clientId: p.clientId,
        clientSecret: p.clientSecret,
        refreshToken: p.refreshToken,
        desk: {
            orgId: p.deskOrgId,
            defaultDepartmentId: p.defaultDepartmentId,
            fromEmailAddress: p.fromEmailAddress,
            mailReplyAddressId: p.mailReplyAddressId,
        },
        inventory: {
            orgId: p.inventoryOrgId,
        }
    }));
}

/**
 * Creates a new ticket log entry in the database.
 * @param {object} logData - The data for the ticket log.
 */
async function createTicketLogEntry(logData) {
    await prisma.ticketLog.create({
        data: {
            email: logData.email,
            success: logData.success,
            ticketNumber: logData.ticketNumber,
            details: logData.details,
            profileName: logData.profileName,
        },
    });
}

/**
 * Deletes all ticket log entries from the database.
 */
async function clearAllTicketLogs() {
    await prisma.ticketLog.deleteMany({});
}


// --- EXISTING ZOHO HELPER FUNCTIONS (Unchanged, but important) ---

const parseError = (error) => {
    let message = 'An unknown error occurred.';
    let fullResponse = null;
    if (axios.isAxiosError(error)) {
        message = error.response?.data?.message || error.response?.data?.error || error.message;
        fullResponse = error.response?.data || { message: error.message };
    } else if (error instanceof Error) {
        message = error.message;
        fullResponse = { message: error.message };
    }
    return { message, fullResponse };
};

const getValidAccessToken = async (profile, service = 'desk') => {
    const tokenUrl = 'https://accounts.zoho.com/oauth/v2/token';
    const params = new URLSearchParams();
    params.append('refresh_token', profile.refreshToken);
    params.append('client_id', profile.clientId);
    params.append('client_secret', profile.clientSecret);
    params.append('grant_type', 'refresh_token');

    try {
        const response = await axios.post(tokenUrl, params);
        const { access_token } = response.data;
        if (!access_token) {
            throw new Error('Failed to refresh access token, token not found in response.');
        }
        return { success: true, accessToken: access_token };
    } catch (error) {
        const { message, fullResponse } = parseError(error);
        console.error(`[ERROR] Failed to refresh access token for ${profile.profileName} (${service}): ${message}`);
        throw new Error(`Token refresh failed: ${message}`);
    }
};

const makeApiCall = async (method, url, data, profile, service = 'desk') => {
    const { accessToken } = await getValidAccessToken(profile, service);
    const baseURL = service === 'inventory' 
        ? 'https://www.zohoapis.com/inventory' 
        : 'https://desk.zoho.com';
    
    const headers = {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
    };
    if (service === 'desk') {
        headers['orgId'] = profile.desk.orgId;
    } else {
        headers['X-ZOHO-ORGANIZATION-ID'] = profile.inventory.orgId;
    }

    return axios({
        method,
        url: `${baseURL}${url}`,
        data,
        headers,
    });
};

const createJobId = (socketId, profileName, jobType) => `${socketId}-${profileName}-${jobType}`;

module.exports = {
    prisma, // Export prisma instance for use in other files
    getProfiles,
    createTicketLogEntry,
    clearAllTicketLogs,
    parseError,
    getValidAccessToken,
    makeApiCall,
    createJobId,
};
