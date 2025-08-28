const { parseError, makeApiCall, createJobId } = require('./utils');

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
        }, 100);

        setTimeout(() => {
            if (activeJobs[jobId] && activeJobs[jobId].status !== 'ended') {
                 clearInterval(interval);
                 resolve(true);
            }
        }, ms);
    });
};

const handleStartBulkInvoice = async (socket, data) => {
    const { emails, subject, body, delay, selectedProfileName, sendCustomEmail, sendDefaultEmail } = data;
    const jobId = createJobId(socket.id, selectedProfileName, 'invoice');
    activeJobs[jobId] = { status: 'running', total: emails.length, processed: 0 };

    for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
        
        let result = { rowNumber: i + 1, email, success: false, profileName: selectedProfileName };
        
        try {
            const contactResponse = await makeApiCall('get', `/v1/contacts?email=${email}`, null, data.activeProfile, 'inventory');
            
            if (contactResponse.data.contacts.length === 0) {
                throw new Error('Contact not found in Zoho Inventory.');
            }
            const contact = contactResponse.data.contacts[0];
            result.contactId = contact.contact_id;

            const invoiceData = { customer_id: contact.contact_id };
            const createInvoiceResponse = await makeApiCall('post', '/v1/invoices', invoiceData, data.activeProfile, 'inventory');
            
            const newInvoice = createInvoiceResponse.data.invoice;
            result.invoiceId = newInvoice.invoice_id;
            result.invoiceNumber = newInvoice.invoice_number;

            if (sendCustomEmail) {
                const emailData = {
                    send_from_user_id: true,
                    to_mail_ids: [email],
                    subject: subject,
                    body: body,
                };
                await makeApiCall('post', `/v1/invoices/${newInvoice.invoice_id}/email`, emailData, data.activeProfile, 'inventory');
                result.details = `Custom email sent for invoice ${newInvoice.invoice_number}.`;
            } else if (sendDefaultEmail) {
                const emailData = { send_from_user_id: true };
                await makeApiCall('post', `/v1/invoices/${newInvoice.invoice_id}/email`, emailData, data.activeProfile, 'inventory');
                result.details = `Default email sent for invoice ${newInvoice.invoice_number}.`;
            } else {
                 result.details = `Invoice ${newInvoice.invoice_number} created but not emailed.`;
            }

            result.success = true;

        } catch (error) {
            const { message } = parseError(error);
            result.error = message;
        }

        socket.emit('invoiceResult', result);
        activeJobs[jobId].processed++;
        
        if (activeJobs[jobId].processed < activeJobs[jobId].total) {
            const shouldContinue = await interruptibleSleep(delay * 1000, jobId);
            if (!shouldContinue) break;
        }
    }

    if (activeJobs[jobId]) {
        socket.emit(activeJobs[jobId].status === 'ended' ? 'bulkEnded' : 'bulkComplete', { profileName: selectedProfileName, jobType: 'invoice' });
        delete activeJobs[jobId];
    }
};

const handleSendSingleInvoice = async (data) => {
    const { email, subject, body, selectedProfileName, sendCustomEmail, sendDefaultEmail } = data;
    try {
        const profiles = await require('./utils').getProfiles();
        const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
        if (!activeProfile) throw new Error("Profile not found");

        const contactResponse = await makeApiCall('get', `/v1/contacts?email=${email}`, null, activeProfile, 'inventory');
        if (contactResponse.data.contacts.length === 0) throw new Error('Contact not found.');
        const contact = contactResponse.data.contacts[0];

        const invoiceData = { customer_id: contact.contact_id };
        const createInvoiceResponse = await makeApiCall('post', '/v1/invoices', invoiceData, activeProfile, 'inventory');
        const newInvoice = createInvoiceResponse.data.invoice;

        let emailResponseData = null;
        if (sendCustomEmail) {
            const emailData = { send_from_user_id: true, to_mail_ids: [email], subject, body };
            emailResponseData = (await makeApiCall('post', `/v1/invoices/${newInvoice.invoice_id}/email`, emailData, activeProfile, 'inventory')).data;
        } else if (sendDefaultEmail) {
            const emailData = { send_from_user_id: true };
            emailResponseData = (await makeApiCall('post', `/v1/invoices/${newInvoice.invoice_id}/email`, emailData, activeProfile, 'inventory')).data;
        }

        return { success: true, message: `Invoice ${newInvoice.invoice_number} processed.`, fullResponse: { invoice: newInvoice, email: emailResponseData } };
    } catch (error) {
        return { success: false, ...parseError(error) };
    }
};

const handleGetOrgDetails = async (socket, { activeProfile }) => {
    // CORRECTED: Add a check to ensure activeProfile exists.
    if (!activeProfile) {
        return socket.emit('orgDetailsResult', { success: false, error: 'No active profile selected.' });
    }
    try {
        const response = await makeApiCall('get', '/v1/organizations', null, activeProfile, 'inventory');
        const currentOrg = response.data.organizations.find(org => org.organization_id === activeProfile.inventory.orgId);
        if (!currentOrg) throw new Error('Organization not found for this profile.');
        socket.emit('orgDetailsResult', { success: true, data: currentOrg });
    } catch (error) {
        socket.emit('orgDetailsResult', { success: false, error: parseError(error).message });
    }
};

const handleUpdateOrgDetails = async (socket, { activeProfile, displayName }) => {
    // CORRECTED: Add a check to ensure activeProfile exists.
    if (!activeProfile) {
        return socket.emit('updateOrgDetailsResult', { success: false, error: 'No active profile selected.' });
    }
    try {
        const data = { name: displayName }; // Assuming we update the org name, adjust if it's contact_name
        const response = await makeApiCall('put', `/v1/organizations/${activeProfile.inventory.orgId}`, data, activeProfile, 'inventory');
        socket.emit('updateOrgDetailsResult', { success: true, data: response.data.organization });
    } catch (error) {
        socket.emit('updateOrgDetailsResult', { success: false, error: parseError(error).message });
    }
};

const handleGetInvoices = async (socket, { activeProfile, status, search_text, page, per_page }) => {
    // CORRECTED: Add a check to ensure activeProfile exists.
    if (!activeProfile) {
        return socket.emit('invoicesResult', { success: false, error: 'No active profile selected.' });
    }
    try {
        let url = `/v1/invoices?page=${page}&per_page=${per_page}`;
        if (status) url += `&status=${status}`;
        if (search_text) url += `&search_text=${search_text}`;
        
        const response = await makeApiCall('get', url, null, activeProfile, 'inventory');
        socket.emit('invoicesResult', { success: true, invoices: response.data.invoices, page_context: response.data.page_context });
    } catch (error) {
        socket.emit('invoicesResult', { success: false, error: parseError(error).message });
    }
};

const handleDeleteInvoices = async (socket, { activeProfile, invoiceIds }) => {
    // CORRECTED: Add a check to ensure activeProfile exists.
    if (!activeProfile) {
        return socket.emit('invoicesDeletedResult', { success: false, error: 'No active profile selected.' });
    }
    let deletedCount = 0;
    try {
        for (const id of invoiceIds) {
            await makeApiCall('delete', `/v1/invoices/${id}`, null, activeProfile, 'inventory');
            deletedCount++;
            socket.emit('invoiceDeleteProgress', { deletedCount, total: invoiceIds.length });
        }
        socket.emit('invoicesDeletedResult', { success: true, deletedCount });
    } catch (error) {
        socket.emit('invoicesDeletedResult', { success: false, error: parseError(error).message, deletedCount });
    }
};

module.exports = {
    setActiveJobs: (jobs) => { activeJobs = jobs; },
    handleStartBulkInvoice,
    handleSendSingleInvoice,
    handleGetOrgDetails,
    handleUpdateOrgDetails,
    handleGetInvoices,
    handleDeleteInvoices,
};
