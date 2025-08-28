const { makeApiCall, parseError, writeToTicketLog, createJobId, getProfiles } = require('./utils');

let activeJobs = {};

const setActiveJobs = (jobsObject) => {
  activeJobs = jobsObject;
};

const interruptibleSleep = (ms, jobId) => {
    return new Promise(resolve => {
        if (ms <= 0) return resolve();
        const interval = 100;
        let elapsed = 0;
        const timerId = setInterval(() => {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') {
                clearInterval(timerId);
                return resolve();
            }
            elapsed += interval;
            if (elapsed >= ms) {
                clearInterval(timerId);
                resolve();
            }
        }, interval);
    });
};

const handleSendSingleTicket = async (data) => {
    const { email, subject, description, selectedProfileName, sendDirectReply } = data;
    if (!email || !selectedProfileName) {
        return { success: false, error: 'Missing email or profile.' };
    }
    const profiles = await getProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);

    try {
        if (!activeProfile) {
            return { success: false, error: 'Profile not found.' };
        }
        
        const deskConfig = activeProfile.desk;
        const ticketData = { 
            subject, 
            description, 
            departmentId: deskConfig.defaultDepartmentId, 
            contact: { email },
            channel: 'Email' 
        };

        const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile, 'desk');
        const newTicket = ticketResponse.data;
        let fullResponseData = { ticketCreate: newTicket };

        writeToTicketLog({ ticketNumber: newTicket.ticketNumber, email });

        if (sendDirectReply) {
            try {
                const replyData = {
                    fromEmailAddress: deskConfig.fromEmailAddress,
                    to: email,
                    content: description,
                    contentType: 'html',
                    channel: 'EMAIL'
                };
                const replyResponse = await makeApiCall('post', `/api/v1/tickets/${newTicket.id}/sendReply`, replyData, activeProfile, 'desk');
                fullResponseData.sendReply = replyResponse.data;
            } catch (replyError) {
                fullResponseData.sendReply = parseError(replyError);
            }
        }

        return { success: true, fullResponse: fullResponseData, message: `Ticket #${newTicket.ticketNumber} created.` };

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        return { success: false, error: message, fullResponse };
    }
};

const handleVerifyTicketEmail = async (data) => {
    const { ticket, profileName } = data;
    if (!ticket || !profileName) {
        return { success: false, details: 'Missing ticket or profile information for verification.' };
    }
    const profiles = await getProfiles();
    const activeProfile = profiles.find(p => p.profileName === profileName);
    if (!activeProfile) {
        return { success: false, details: 'Profile not found for verification.' };
    }
    return await verifyTicketEmail(null, { ticket, profile: activeProfile });
};


const handleSendTestTicket = async (socket, data) => {
    const { email, subject, description, selectedProfileName, sendDirectReply, verifyEmail, activeProfile } = data;
     if (!email || !selectedProfileName) {
        return socket.emit('testTicketResult', { success: false, error: 'Missing email or profile.' });
    }
    try {
        if (!activeProfile) {
            return socket.emit('testTicketResult', { success: false, error: 'Profile not found.' });
        }
        
        const deskConfig = activeProfile.desk;

        const ticketData = { 
            subject, 
            description, 
            departmentId: deskConfig.defaultDepartmentId, 
            contact: { email },
            channel: 'Email' 
        };

        const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile, 'desk');
        const newTicket = ticketResponse.data;
        let fullResponseData = { ticketCreate: newTicket };

        writeToTicketLog({ ticketNumber: newTicket.ticketNumber, email });

        if (sendDirectReply) {
            try {
                const replyData = {
                    fromEmailAddress: deskConfig.fromEmailAddress,
                    to: email,
                    content: description,
                    contentType: 'html',
                    channel: 'EMAIL'
                };
                const replyResponse = await makeApiCall('post', `/api/v1/tickets/${newTicket.id}/sendReply`, replyData, activeProfile, 'desk');
                fullResponseData.sendReply = replyResponse.data;
            } catch (replyError) {
                fullResponseData.sendReply = parseError(replyError);
            }
        }

        socket.emit('testTicketResult', { success: true, fullResponse: fullResponseData });

        if (verifyEmail) {
            verifyTicketEmail(socket, {ticket: newTicket, profile: activeProfile, resultEventName: 'testTicketVerificationResult'});
        }

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('testTicketResult', { success: false, error: message, fullResponse });
    }
};

const handleStartBulkCreate = async (socket, data) => {
    const { emails, subject, description, delay, selectedProfileName, sendDirectReply, verifyEmail, activeProfile } = data;
    
    const jobId = createJobId(socket.id, selectedProfileName, 'ticket');
    activeJobs[jobId] = { status: 'running' };

    try {
        if (!activeProfile) {
            throw new Error('Profile not found.');
        }

        const deskConfig = activeProfile.desk;

        if (sendDirectReply && !deskConfig.fromEmailAddress) {
            throw new Error(`Profile "${selectedProfileName}" is missing "fromEmailAddress".`);
        }
        
        for (let i = 0; i < emails.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            while (activeJobs[jobId]?.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const email = emails[i];
            if (!email.trim()) continue;

            const ticketData = { 
                subject, 
                description, 
                departmentId: deskConfig.defaultDepartmentId, 
                contact: { email },
                channel: 'Email' 
            };

            try {
                const ticketResponse = await makeApiCall('post', '/api/v1/tickets', ticketData, activeProfile, 'desk');
                const newTicket = ticketResponse.data;
                let successMessage = `Ticket #${newTicket.ticketNumber} created.`;
                let fullResponseData = { ticketCreate: newTicket };
                let overallSuccess = true; 

                writeToTicketLog({ ticketNumber: newTicket.ticketNumber, email });

                if (sendDirectReply) {
                    try {
                        const replyData = {
                            fromEmailAddress: deskConfig.fromEmailAddress,
                            to: email,
                            content: description,
                            contentType: 'html',
                            channel: 'EMAIL'
                        };

                        const replyResponse = await makeApiCall('post', `/api/v1/tickets/${newTicket.id}/sendReply`, replyData, activeProfile, 'desk');
                        
                        successMessage = `Ticket #${newTicket.ticketNumber} created and reply sent.`;
                        fullResponseData.sendReply = replyResponse.data;
                    } catch (replyError) {
                        overallSuccess = false;
                        const { message } = parseError(replyError);
                        successMessage = `Ticket #${newTicket.ticketNumber} created, but reply failed: ${message}`;
                        fullResponseData.sendReply = { error: parseError(replyError) };
                    }
                }

                socket.emit('ticketResult', { 
                    email, 
                    success: overallSuccess,
                    ticketNumber: newTicket.ticketNumber, 
                    details: successMessage,
                    fullResponse: fullResponseData,
                    profileName: selectedProfileName
                });

                if (verifyEmail) {
                    verifyTicketEmail(socket, { ticket: newTicket, profile: activeProfile });
                }

            } catch (error) {
                const { message, fullResponse } = parseError(error);
                socket.emit('ticketResult', { email, success: false, error: message, fullResponse, profileName: selectedProfileName });
            }
        }

    } catch (error) {
        socket.emit('bulkError', { message: error.message || 'A critical server error occurred.', profileName: selectedProfileName, jobType: 'ticket' });
    } finally {
        if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            if (finalStatus === 'ended') {
                socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'ticket' });
            } else {
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'ticket' });
            }
            delete activeJobs[jobId];
        }
    }
};

const verifyTicketEmail = async (socket, { ticket, profile, resultEventName = 'ticketUpdate' }) => {
    let fullResponse = { ticketCreate: ticket, verifyEmail: {} };
    try {
        if (socket) { // Only delay for WebSocket-based calls
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        const [workflowHistoryResponse, notificationHistoryResponse] = await Promise.all([
            makeApiCall('get', `/api/v1/tickets/${ticket.id}/History?eventFilter=WorkflowHistory`, null, profile, 'desk'),
            makeApiCall('get', `/api/v1/tickets/${ticket.id}/History?eventFilter=NotificationRuleHistory`, null, profile, 'desk')
        ]);

        const allHistoryEvents = [
            ...(workflowHistoryResponse.data.data || []),
            ...(notificationHistoryResponse.data.data || [])
        ];
        
        fullResponse.verifyEmail.history = { workflowHistory: workflowHistoryResponse.data, notificationHistory: notificationHistoryResponse.data };

        let result;
        if (allHistoryEvents.length > 0) {
            result = {
                success: true, 
                details: 'Email verification: Sent successfully.',
                fullResponse,
            };
        } else {
            const failureResponse = await makeApiCall('get', `/api/v1/emailFailureAlerts?department=${profile.desk.defaultDepartmentId}`, null, profile, 'desk');
            const failure = failureResponse.data.data?.find(f => String(f.ticketNumber) === String(ticket.ticketNumber));
            fullResponse.verifyEmail.failure = failure || "No specific failure found for this ticket.";
            
            result = {
                success: false, 
                details: failure ? `Email verification: Failed. Reason: ${failure.reason}` : 'Email verification: Not Found.',
                fullResponse,
            };
        }
        
        if (socket) {
            socket.emit(resultEventName, { ticketNumber: ticket.ticketNumber, ...result, profileName: profile.profileName });
        } else {
            return result;
        }

    } catch (error) {
        const { message, fullResponse: errorResponse } = parseError(error);
        console.error(`Failed to verify email for ticket #${ticket.ticketNumber}:`, message);
        fullResponse.verifyEmail.error = errorResponse;
        const result = {
            success: false,
            details: `Email verification: Failed to check status.`,
            fullResponse,
        };
        if (socket) {
            socket.emit(resultEventName, { ticketNumber: ticket.ticketNumber, ...result, profileName: profile.profileName });
        } else {
            return result;
        }
    }
};

const handleGetEmailFailures = async (socket, data) => {
    try {
        const { activeProfile } = data;
        if (!activeProfile || !activeProfile.desk) {
            throw new Error('Desk profile not found for fetching email failures.');
        }

        const departmentId = activeProfile.desk.defaultDepartmentId;
        const response = await makeApiCall('get', `/api/v1/emailFailureAlerts?department=${departmentId}&limit=50`, null, activeProfile, 'desk');
        
        const failures = response.data.data || [];
        // This function is no longer available, so we remove this logic.
        // The frontend can handle matching if needed, or we can add a new DB query.
        // For now, we return the direct data.
        const failuresWithEmails = failures.map(failure => ({
            ...failure,
            email: 'Unknown', // Or fetch from DB if necessary
        }));

        socket.emit('emailFailuresResult', { success: true, data: failuresWithEmails });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('emailFailuresResult', { success: false, error: message });
    }
};

const handleClearEmailFailures = async (socket, data) => {
    try {
        const { activeProfile } = data;
        if (!activeProfile || !activeProfile.desk) {
            throw new Error('Desk profile not found for clearing email failures.');
        }

        const departmentId = activeProfile.desk.defaultDepartmentId;
        await makeApiCall('patch', `/api/v1/emailFailureAlerts?department=${departmentId}`, null, activeProfile, 'desk');
        
        socket.emit('clearEmailFailuresResult', { success: true });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('clearEmailFailuresResult', { success: false, error: message });
    }
};

const handleGetMailReplyAddressDetails = async (socket, data) => {
    try {
        const { activeProfile } = data;

        if (!activeProfile || !activeProfile.desk) {
            return socket.emit('mailReplyAddressDetailsResult', { success: false, error: 'Desk profile not found' });
        }
        
        const mailReplyAddressId = activeProfile.desk.mailReplyAddressId;
        if (!mailReplyAddressId) {
            return socket.emit('mailReplyAddressDetailsResult', { success: true, notConfigured: true });
        }

        const response = await makeApiCall('get', `/api/v1/mailReplyAddress/${mailReplyAddressId}`, null, activeProfile, 'desk');
        socket.emit('mailReplyAddressDetailsResult', { success: true, data: response.data });

    } catch (error) {
        const { message } = parseError(error);
        socket.emit('mailReplyAddressDetailsResult', { success: false, error: message });
    }
};

const handleUpdateMailReplyAddressDetails = async (socket, data) => {
    try {
        const { displayName, activeProfile } = data;

        if (!activeProfile || !activeProfile.desk || !activeProfile.desk.mailReplyAddressId) {
            throw new Error('Mail Reply Address ID is not configured for this profile.');
        }

        const mailReplyAddressId = activeProfile.desk.mailReplyAddressId;
        const updateData = { displayName };
        const response = await makeApiCall('patch', `/api/v1/mailReplyAddress/${mailReplyAddressId}`, updateData, activeProfile, 'desk');
        
        socket.emit('updateMailReplyAddressResult', { success: true, data: response.data });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('updateMailReplyAddressResult', { success: false, error: message });
    }
};

module.exports = {
    setActiveJobs,
    handleSendTestTicket,
    handleStartBulkCreate,
    handleGetEmailFailures,
    handleClearEmailFailures,
    handleGetMailReplyAddressDetails,
    handleUpdateMailReplyAddressDetails,
    handleSendSingleTicket,
    handleVerifyTicketEmail
};
