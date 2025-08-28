const { parseError, makeApiCall, createJobId, createTicketLogEntry } = require('./utils');

let activeJobs = {};

const interruptibleSleep = (ms, jobId) => {
    return new Promise(resolve => {
        const interval = setInterval(() => {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') {
                clearInterval(interval);
                resolve(false); // Job was ended
            } else if (activeJobs[jobId].status === 'running') {
                clearInterval(interval);
                resolve(true); // Continue job
            }
            // If paused, do nothing and wait for the next check
        }, 100);

        setTimeout(() => {
            if (activeJobs[jobId] && activeJobs[jobId].status !== 'ended') {
                 clearInterval(interval);
                 resolve(true); // Time's up, continue
            }
        }, ms);
    });
};

const handleStartBulkCreate = async (socket, data) => {
    const { emails, subject, description, delay, selectedProfileName, sendDirectReply, verifyEmail, displayName } = data;
    const jobId = createJobId(socket.id, selectedProfileName, 'ticket');
    activeJobs[jobId] = { status: 'running', total: emails.length, processed: 0 };

    for (const email of emails) {
        if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

        const ticketData = {
            subject: subject,
            description: description,
            contact: { email: email },
            departmentId: data.activeProfile.desk.defaultDepartmentId
        };
        
        let result = { email, success: false, profileName: selectedProfileName };

        try {
            const response = await makeApiCall('post', '/api/v1/tickets', ticketData, data.activeProfile);
            result.success = true;
            result.ticketNumber = response.data.ticketNumber;
            result.details = `Ticket ${response.data.ticketNumber} created.`;
            result.fullResponse = { ticketCreate: response.data };

            if (sendDirectReply) {
                const replyData = {
                    contentType: "html",
                    content: description,
                    fromEmailAddress: data.activeProfile.desk.fromEmailAddress,
                    displayName: displayName
                };
                const replyResponse = await makeApiCall('post', `/api/v1/tickets/${response.data.id}/sendReply`, replyData, data.activeProfile);
                result.details += " Public reply sent.";
                result.fullResponse.sendReply = replyResponse.data;
            }

            if (verifyEmail) {
                setTimeout(async () => {
                    try {
                        const verifyResponse = await makeApiCall('get', `/api/v1/tickets/${response.data.id}/conversations`, null, data.activeProfile);
                        const hasNotification = verifyResponse.data.data.some(convo => convo.type === 'notification' && convo.isOutOfBand === false);
                        socket.emit('ticketUpdate', {
                            profileName: selectedProfileName,
                            ticketNumber: response.data.ticketNumber,
                            success: hasNotification,
                            details: hasNotification ? 'Automation email confirmed.' : 'Automation email NOT found.',
                            fullResponse: verifyResponse.data
                        });
                    } catch(verifyError) {
                        socket.emit('ticketUpdate', {
                            profileName: selectedProfileName,
                            ticketNumber: response.data.ticketNumber,
                            success: false,
                            details: `Verification failed: ${parseError(verifyError).message}`,
                            fullResponse: parseError(verifyError).fullResponse
                        });
                    }
                }, 10000);
            }

        } catch (error) {
            const { message, fullResponse } = parseError(error);
            result.error = message;
            result.fullResponse = fullResponse;
        }
        
        // MODIFIED: Use the new async database function
        await createTicketLogEntry({ ...result, profileName: selectedProfileName });
        socket.emit('ticketResult', result);
        
        activeJobs[jobId].processed++;
        if (activeJobs[jobId].processed < activeJobs[jobId].total) {
            const shouldContinue = await interruptibleSleep(delay * 1000, jobId);
            if (!shouldContinue) break;
        }
    }

    if (activeJobs[jobId]) {
        socket.emit(activeJobs[jobId].status === 'ended' ? 'bulkEnded' : 'bulkComplete', { profileName: selectedProfileName, jobType: 'ticket' });
        delete activeJobs[jobId];
    }
};

// Other handlers remain largely the same as they don't interact with the JSON files directly for logging.
// They use makeApiCall which is already updated.

const handleSendSingleTicket = async (data) => {
    const { email, subject, description, sendDirectReply, selectedProfileName, displayName } = data;
    try {
        const profiles = await require('./utils').getProfiles();
        const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
        if (!activeProfile) throw new Error("Profile not found");

        const ticketData = {
            subject: subject,
            description: description,
            contact: { email: email },
            departmentId: activeProfile.desk.defaultDepartmentId
        };
        
        const response = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile);
        let fullResponse = { ticketCreate: response.data };

        if (sendDirectReply) {
            const replyData = {
                contentType: "html",
                content: description,
                fromEmailAddress: activeProfile.desk.fromEmailAddress,
                displayName: displayName
            };
            const replyResponse = await makeApiCall('post', `/api/v1/tickets/${response.data.id}/sendReply`, replyData, activeProfile);
            fullResponse.sendReply = replyResponse.data;
        }
        
        return { success: true, fullResponse };
    } catch (error) {
        return { success: false, ...parseError(error) };
    }
};

const handleVerifyTicketEmail = async (data) => {
     const { ticket, profileName } = data;
     try {
        const profiles = await require('./utils').getProfiles();
        const activeProfile = profiles.find(p => p.profileName === profileName);
        if (!activeProfile) throw new Error("Profile not found");

        const verifyResponse = await makeApiCall('get', `/api/v1/tickets/${ticket.id}/conversations`, null, activeProfile);
        const hasNotification = verifyResponse.data.data.some(convo => convo.type === 'notification' && convo.isOutOfBand === false);
        
        return {
            success: hasNotification,
            details: hasNotification ? 'Automation email confirmed.' : 'Automation email NOT found.',
            fullResponse: { verifyEmail: verifyResponse.data }
        };
    } catch (error) {
        return { success: false, details: `Verification failed: ${parseError(error).message}`, fullResponse: { verifyEmail: parseError(error).fullResponse } };
    }
};

const handleGetEmailFailures = async (socket, { activeProfile }) => {
    try {
        const response = await makeApiCall('get', `/api/v1/departments/${activeProfile.desk.defaultDepartmentId}/emailfailures`, null, activeProfile);
        socket.emit('emailFailuresResult', { success: true, data: response.data.data });
    } catch (error) {
        socket.emit('emailFailuresResult', { success: false, error: parseError(error).message });
    }
};

const handleClearEmailFailures = async (socket, { activeProfile }) => {
    try {
        await makeApiCall('delete', `/api/v1/departments/${activeProfile.desk.defaultDepartmentId}/emailfailures`, null, activeProfile);
        socket.emit('clearEmailFailuresResult', { success: true });
    } catch (error) {
        socket.emit('clearEmailFailuresResult', { success: false, error: parseError(error).message });
    }
};

const handleGetMailReplyAddressDetails = async (socket, { activeProfile }) => {
    if (!activeProfile.desk.mailReplyAddressId) {
        return socket.emit('mailReplyAddressDetailsResult', { success: true, notConfigured: true });
    }
    try {
        const response = await makeApiCall('get', `/api/v1/mail/${activeProfile.desk.mailReplyAddressId}`, null, activeProfile);
        socket.emit('mailReplyAddressDetailsResult', { success: true, data: response.data });
    } catch (error) {
        socket.emit('mailReplyAddressDetailsResult', { success: false, error: parseError(error).message });
    }
};

const handleUpdateMailReplyAddressDetails = async (socket, { activeProfile, displayName }) => {
    if (!activeProfile.desk.mailReplyAddressId) {
        return socket.emit('updateMailReplyAddressResult', { success: false, error: 'Mail Reply Address ID not configured.' });
    }
    try {
        const data = { displayName };
        const response = await makeApiCall('patch', `/api/v1/mail/${activeProfile.desk.mailReplyAddressId}`, data, activeProfile);
        socket.emit('updateMailReplyAddressResult', { success: true, data: response.data });
    } catch (error) {
        socket.emit('updateMailReplyAddressResult', { success: false, error: parseError(error).message });
    }
};


module.exports = {
    setActiveJobs: (jobs) => { activeJobs = jobs; },
    handleStartBulkCreate,
    handleSendSingleTicket,
    handleVerifyTicketEmail,
    handleGetEmailFailures,
    handleClearEmailFailures,
    handleGetMailReplyAddressDetails,
    handleUpdateMailReplyAddressDetails,
};
