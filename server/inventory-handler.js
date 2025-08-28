// In server/inventory-handler.js

const { makeApiCall, parseError, createJobId, readProfiles } = require('./utils');

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

const handleGetOrgDetails = async (socket, data) => {
    try {
        const { activeProfile } = data;
        if (!activeProfile || !activeProfile.inventory || !activeProfile.inventory.orgId) {
            throw new Error('Inventory profile or orgId not configured.');
        }
        const orgId = activeProfile.inventory.orgId;
        const response = await makeApiCall('get', `/v1/organizations/${orgId}`, null, activeProfile, 'inventory');

        if (response.data && response.data.organization) {
            socket.emit('orgDetailsResult', { success: true, data: response.data.organization });
        } else {
            throw new Error('Organization not found for this profile.');
        }
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('orgDetailsResult', { success: false, error: message });
    }
};

const handleUpdateOrgDetails = async (socket, data) => {
    try {
        const { displayName, activeProfile } = data;
        if (!activeProfile || !activeProfile.inventory || !activeProfile.inventory.orgId) {
            throw new Error('Inventory profile or orgId not configured.');
        }
        
        const orgId = activeProfile.inventory.orgId;
        
        const getResponse = await makeApiCall('get', `/v1/organizations/${orgId}`, null, activeProfile, 'inventory');
        const organization = getResponse.data.organization;

        if (!organization) {
            throw new Error("Could not find the organization to update.");
        }

        const monthMap = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
        
        const updateData = {
            name: organization.name,
            contact_name: displayName,
            email: organization.email,
            is_logo_uploaded: organization.is_logo_uploaded,
            fiscal_year_start_month: monthMap[organization.fiscal_year_start_month],
            time_zone: organization.time_zone,
            language_code: organization.language_code,
            date_format: organization.date_format,
            field_separator: organization.field_separator,
            org_address: organization.org_address,
            remit_to_address: organization.remit_to_address,
            phone: organization.phone,
            fax: organization.fax,
            website: organization.website,
            currency_id: organization.currency_id,
            companyid_label: organization.company_id_label,
            companyid_value: organization.company_id_value,
            taxid_label: organization.tax_id_label,
            taxid_value: organization.tax_id_value,
            address: {
                street_address1: organization.address?.street_address1 || "",
                street_address2: organization.address?.street_address2 || "",
                city: organization.address?.city || "",
                state: organization.address?.state || "",
                country: organization.address?.country || "",
                zip: organization.address?.zip || ""
            },
            custom_fields: organization.custom_fields || []
        };
        
        const response = await makeApiCall('put', `/v1/organizations/${orgId}`, updateData, activeProfile, 'inventory');
        
        if (response.data && response.data.organization) {
            const updatedOrganization = response.data.organization;
            if (updatedOrganization.contact_name === displayName) {
                socket.emit('updateOrgDetailsResult', { success: true, data: updatedOrganization });
            } else {
                socket.emit('updateOrgDetailsResult', {
                    success: false,
                    error: 'API reported success, but the name was not updated. This may be a permissions issue.',
                    fullResponse: response.data
                });
            }
        } else {
            throw new Error('Invalid response structure from Zoho API after update.');
        }

    } catch (error) {
        const { message, fullResponse } = parseError(error);
        socket.emit('updateOrgDetailsResult', { success: false, error: message, fullResponse });
    }
};

const handleStartBulkInvoice = async (socket, data) => {
    const { emails, subject, body, delay, selectedProfileName, activeProfile, sendCustomEmail, sendDefaultEmail } = data;
    const jobId = createJobId(socket.id, selectedProfileName, 'invoice');
    activeJobs[jobId] = { status: 'running' };

    try {
        if (!activeProfile || !activeProfile.inventory) {
            throw new Error('Inventory profile configuration is missing.');
        }

        for (let i = 0; i < emails.length; i++) {
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;
            while (activeJobs[jobId]?.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (i > 0 && delay > 0) await interruptibleSleep(delay * 1000, jobId);
            if (!activeJobs[jobId] || activeJobs[jobId].status === 'ended') break;

            const email = emails[i];
            const rowNumber = i + 1;
            let contactResponsePayload = {};
            let contactPersonIds = [];

            socket.emit('invoiceResult', { rowNumber, email, stage: 'contact', details: 'Searching for contact...', profileName: selectedProfileName });
            
            const contactName = email.split('@')[0];
            let contactId;
            
            try {
                const searchResponse = await makeApiCall('get', `/v1/contacts?email=${encodeURIComponent(email)}`, null, activeProfile, 'inventory');
                if (searchResponse.data.contacts && searchResponse.data.contacts.length > 0) {
                    contactId = searchResponse.data.contacts[0].contact_id;
                    console.log(`[INFO] Found existing contact for ${email} with ID: ${contactId}`);
                } else {
                    socket.emit('invoiceResult', { rowNumber, email, stage: 'contact', details: 'Contact not found, creating...', profileName: selectedProfileName });
                    const newContactData = { contact_name: contactName, contact_persons: [{ email: email, is_primary_contact: true }] };
                    const createResponse = await makeApiCall('post', '/v1/contacts', newContactData, activeProfile, 'inventory');
                    contactId = createResponse.data.contact.contact_id;
                    console.log(`[INFO] Created new contact for ${email} with ID: ${contactId}`);
                }
                
                // Fetch full contact details to get contact_person_id
                const contactDetailsResponse = await makeApiCall('get', `/v1/contacts/${contactId}`, null, activeProfile, 'inventory');
                const contact = contactDetailsResponse.data.contact;
                if (Array.isArray(contact.contact_persons) && contact.contact_persons.length > 0) {
                    contactPersonIds = contact.contact_persons.map(p => p.contact_person_id);
                    console.log(`[INFO] Found contact person IDs for ${email}: ${contactPersonIds.join(', ')}`);
                } else {
                    throw new Error('Could not find a contact person for the contact.');
                }

                contactResponsePayload = { success: true, fullResponse: contactDetailsResponse.data };
                socket.emit('invoiceResult', { rowNumber, email, stage: 'invoice', details: 'Contact processed. Creating invoice...', contactResponse: contactResponsePayload, profileName: selectedProfileName });
            
            } catch (contactError) {
                const { message, fullResponse } = parseError(contactError);
                contactResponsePayload = { success: false, fullResponse };
                socket.emit('invoiceResult', { rowNumber, email, stage: 'complete', success: false, details: `Contact Error: ${message}`, contactResponse: contactResponsePayload, profileName: selectedProfileName });
                continue;
            }

            let invoiceId;
            let invoiceResponsePayload;
            try {
                const invoiceData = {
                    customer_id: contactId,
                    contact_persons_associated: contactPersonIds.map(id => ({ contact_person_id: id })),
                    line_items: [{ name: "Default Service", rate: 100.00, quantity: 1 }],
                };

                if (sendDefaultEmail) {
                    invoiceData.custom_subject = subject;
                    invoiceData.custom_body = body;
                }
                
                const invoiceUrl = `/v1/invoices${sendDefaultEmail ? '?send=true' : ''}`;

                const invoiceResponse = await makeApiCall('post', invoiceUrl, invoiceData, activeProfile, 'inventory');
                invoiceId = invoiceResponse.data.invoice.invoice_id;
                invoiceResponsePayload = { success: true, fullResponse: invoiceResponse.data };
                
                if (sendDefaultEmail) {
                    if (invoiceResponse.data.message.includes("error while sending the invoice")) {
                        socket.emit('invoiceResult', {
                            rowNumber,
                            email,
                            stage: 'complete',
                            success: false,
                            details: invoiceResponse.data.message,
                            invoiceResponse: invoiceResponsePayload,
                            contactResponse: contactResponsePayload,
                            profileName: selectedProfileName
                        });
                        continue;
                    } else {
                        socket.emit('invoiceResult', {
                            rowNumber,
                            email,
                            stage: 'complete',
                            success: true,
                            details: `Invoice created and default email sent.`,
                            invoiceResponse: invoiceResponsePayload,
                            contactResponse: contactResponsePayload,
                            emailResponse: { success: true, fullResponse: { message: "Email sent via Zoho's default mechanism." } },
                            profileName: selectedProfileName
                        });
                        continue;
                    }
                } else {
                    socket.emit('invoiceResult', {
                        rowNumber, 
                        email, 
                        stage: 'invoice', 
                        details: 'Invoice created.',
                        invoiceResponse: invoiceResponsePayload,
                        contactResponse: contactResponsePayload,
                        profileName: selectedProfileName
                    });
                }
            } catch (invoiceError) {
                const { message, fullResponse } = parseError(invoiceError);
                invoiceResponsePayload = { success: false, fullResponse };
                socket.emit('invoiceResult', { rowNumber, email, stage: 'complete', success: false, details: `Invoice Creation Error: ${message}`, contactResponse: contactResponsePayload, invoiceResponse: invoiceResponsePayload, profileName: selectedProfileName });
                continue;
            }

            if (sendCustomEmail) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const emailData = {
                        to_mail_ids: [email],
                        subject: subject,
                        body: `${body} <br><br>Invoice Number: ${invoiceResponsePayload.fullResponse?.invoice?.invoice_number}`,
                    };
                    const emailApiResponse = await makeApiCall('post', `/v1/contacts/${contactId}/email`, emailData, activeProfile, 'inventory');
                    const emailSendResponsePayload = { success: true, fullResponse: emailApiResponse.data };
                    socket.emit('invoiceResult', {
                        rowNumber, email, stage: 'complete', success: true,
                        details: `Custom email sent for Invoice #${invoiceResponsePayload.fullResponse?.invoice?.invoice_number}.`,
                        invoiceNumber: invoiceResponsePayload.fullResponse?.invoice?.invoice_number,
                        emailResponse: emailSendResponsePayload,
                        contactResponse: contactResponsePayload,
                        invoiceResponse: invoiceResponsePayload,
                        profileName: selectedProfileName
                    });
                } catch (emailError) {
                    const { message, fullResponse } = parseError(emailError);
                    const emailSendResponsePayload = { success: false, fullResponse };
                    socket.emit('invoiceResult', {
                        rowNumber, email, stage: 'complete', success: false,
                        details: `Custom Email Send Error: ${message}`,
                        emailResponse: emailSendResponsePayload,
                        contactResponse: contactResponsePayload,
                        invoiceResponse: invoiceResponsePayload,
                        profileName: selectedProfileName
                    });
                }
            } else if (!sendDefaultEmail) {
                socket.emit('invoiceResult', {
                    rowNumber, email, stage: 'complete', success: true,
                    details: 'Invoice created without sending email.',
                    invoiceNumber: invoiceResponsePayload.fullResponse?.invoice?.invoice_number,
                    invoiceResponse: invoiceResponsePayload,
                    contactResponse: contactResponsePayload,
                    profileName: selectedProfileName
                });
            }
        }
    } catch (error) {
        socket.emit('bulkError', { message: error.message || 'A critical server error occurred.', profileName: selectedProfileName, jobType: 'invoice' });
    } finally {
        if (activeJobs[jobId]) {
            const finalStatus = activeJobs[jobId].status;
            if (finalStatus === 'ended') {
                socket.emit('bulkEnded', { profileName: selectedProfileName, jobType: 'invoice' });
            } else {
                socket.emit('bulkComplete', { profileName: selectedProfileName, jobType: 'invoice' });
            }
            delete activeJobs[jobId];
        }
    }
};

const handleSendSingleInvoice = async (data) => {
    const { email, subject, body, selectedProfileName, sendCustomEmail, sendDefaultEmail } = data;
    if (!email || !subject || !body || !selectedProfileName) {
        return { success: false, error: 'Missing required fields.' };
    }
    const profiles = await readProfiles();
    const activeProfile = profiles.find(p => p.profileName === selectedProfileName);
    
    if (!activeProfile || !activeProfile.inventory) {
        return { success: false, error: 'Inventory profile not configured.' };
    }

    let fullResponse = {};

    try {
        const searchResponse = await makeApiCall('get', `/v1/contacts?email=${encodeURIComponent(email)}`, null, activeProfile, 'inventory');
        let contactId;
        let contactPersonIds = [];

        if (searchResponse.data.contacts && searchResponse.data.contacts.length > 0) {
            contactId = searchResponse.data.contacts[0].contact_id;
            fullResponse.contact = { status: 'found', data: searchResponse.data };
        } else {
            const contactName = email.split('@')[0];
            const newContactData = { contact_name: contactName, contact_persons: [{ email: email, is_primary_contact: true }] };
            const createResponse = await makeApiCall('post', '/v1/contacts', newContactData, activeProfile, 'inventory');
            contactId = createResponse.data.contact.contact_id;
            fullResponse.contact = { status: 'created', data: createResponse.data };
        }
        
        const contactDetailsResponse = await makeApiCall('get', `/v1/contacts/${contactId}`, null, activeProfile, 'inventory');
        const contact = contactDetailsResponse.data.contact;
        if (Array.isArray(contact.contact_persons) && contact.contact_persons.length > 0) {
            contactPersonIds = contact.contact_persons.map(p => p.contact_person_id);
        } else {
            throw new Error('Could not find a contact person for the contact.');
        }

        const invoiceData = {
            customer_id: contactId,
            contact_persons_associated: contactPersonIds.map(id => ({ contact_person_id: id })),
            line_items: [{ name: "Service", description: "General service provided", rate: 0.00, quantity: 1 }],
        };
        
        if (sendDefaultEmail) {
            invoiceData.custom_subject = subject;
            invoiceData.custom_body = body;
        }

        const invoiceUrl = `/v1/invoices${sendDefaultEmail ? '?send=true' : ''}`;
        const invoiceResponse = await makeApiCall('post', invoiceUrl, invoiceData, activeProfile, 'inventory');
        const invoiceId = invoiceResponse.data.invoice.invoice_id;
        fullResponse.invoice = invoiceResponse.data;
        
        if (sendCustomEmail) {
             const emailData = {
                subject: subject,
                body: `${body} <br><br>Invoice Number: ${invoiceResponse.data.invoice.invoice_number}`,
                send_from_org_email_id: false,
                to_mail_ids: [email],
                contact_persons: contactPersonIds,
                documents: []
            };
            
            const emailApiResponse = await makeApiCall('post', `/v1/contacts/${contactId}/email`, emailData, activeProfile, 'inventory');
            fullResponse.email = emailApiResponse.data;
        }
        
        const message = sendDefaultEmail 
            ? `Invoice ${invoiceResponse.data.invoice.invoice_number} created and default email sent.`
            : sendCustomEmail
            ? `Invoice ${invoiceResponse.data.invoice.invoice_number} created and custom email sent.`
            : `Invoice ${invoiceResponse.data.invoice.invoice_number} created without sending email.`;

        return { 
            success: true, 
            message,
            fullResponse: fullResponse
        };

    } catch (error) {
        const { message, fullResponse: errorResponse } = parseError(error);
        fullResponse.error = errorResponse;
        return { success: false, error: message, fullResponse: fullResponse };
    }
};

const handleGetInvoices = async (socket, data) => {
    try {
        const { activeProfile, status, search_text, page, per_page } = data;
        if (!activeProfile || !activeProfile.inventory) {
            throw new Error('Inventory profile not found for fetching invoices.');
        }
        
        let url = `/v1/invoices?page=${page}&per_page=${per_page}&`;
        if (status) {
            url += `status=${status}&`;
        }
        if (search_text) {
            url += `search_text=${search_text}&`;
        }

        const response = await makeApiCall('get', url, null, activeProfile, 'inventory');
        const invoices = response.data.invoices;

        // Enrich invoices with customer email
        const enrichedInvoices = await Promise.all(invoices.map(async (invoice) => {
            if (invoice.customer_id) {
                try {
                    const contactResponse = await makeApiCall('get', `/v1/contacts/${invoice.customer_id}`, null, activeProfile, 'inventory');
                    return {
                        ...invoice,
                        email: contactResponse.data.contact.email
                    };
                } catch (error) {
                    // if contact fetch fails, return invoice without email
                    return invoice;
                }
            }
            return invoice;
        }));

        socket.emit('invoicesResult', { 
            success: true, 
            invoices: enrichedInvoices, 
            page_context: response.data.page_context 
        });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('invoicesResult', { success: false, error: message });
    }
};

const handleDeleteInvoices = async (socket, data) => {
    try {
        const { activeProfile, invoiceIds } = data;
        if (!activeProfile || !activeProfile.inventory) {
            throw new Error('Inventory profile not found for deleting invoices.');
        }
        if (!invoiceIds || invoiceIds.length === 0) {
            throw new Error('No invoices selected for deletion.');
        }
        
        let deletedCount = 0;
        for (const invoiceId of invoiceIds) {
            await makeApiCall('delete', `/v1/invoices/${invoiceId}`, null, activeProfile, 'inventory');
            deletedCount++;
            socket.emit('invoiceDeleteProgress', { deletedCount, total: invoiceIds.length });
        }
        
        socket.emit('invoicesDeletedResult', { success: true, deletedCount: invoiceIds.length });
    } catch (error) {
        const { message } = parseError(error);
        socket.emit('invoicesDeletedResult', { success: false, error: message });
    }
};

module.exports = {
    setActiveJobs,
    handleStartBulkInvoice,
    handleGetOrgDetails,
    handleUpdateOrgDetails,
    handleSendSingleInvoice,
    handleGetInvoices,
    handleDeleteInvoices,
};