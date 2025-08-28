import React, { useState, useEffect, useRef } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { io, Socket } from 'socket.io-client';
import { useToast } from '@/hooks/use-toast';
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import SingleTicket from "@/pages/SingleTicket";
import { ProfileModal } from '@/components/dashboard/ProfileModal';
import BulkInvoices from '@/pages/BulkInvoices';
import SingleInvoice from '@/pages/SingleInvoice';
import EmailStatics from '@/pages/EmailStatics';
import { InvoiceResult } from '@/components/dashboard/inventory/InvoiceResultsDisplay';
import { useJobTimer } from '@/hooks/useJobTimer';

const queryClient = new QueryClient();
const SERVER_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_SERVER_URL || "http://localhost:3000");

// --- Interfaces ---
export interface TicketFormData {
  emails: string;
  subject: string;
  description: string;
  delay: number;
  sendDirectReply: boolean;
  verifyEmail: boolean;
  displayName: string;
}

export interface InvoiceFormData {
  emails: string;
  subject: string;
  body: string;
  delay: number;
  displayName: string;
  sendCustomEmail: boolean;
  sendDefaultEmail: boolean;
}

export interface TicketResult {
  email: string;
  success: boolean;
  ticketNumber?: string;
  details?: string;
  error?: string;
  fullResponse?: any;
}

export interface JobState {
  formData: TicketFormData;
  results: TicketResult[];
  isProcessing: boolean;
  isPaused: boolean;
  isComplete: boolean;
  processingStartTime: Date | null;
  processingTime: number; // Time in seconds
  totalTicketsToProcess: number;
  countdown: number;
  currentDelay: number;
  filterText: string;
}

export interface InvoiceJobState {
  formData: InvoiceFormData;
  results: InvoiceResult[];
  isProcessing: boolean;
  isPaused: boolean;
  isComplete: boolean;
  processingStartTime: Date | null;
  processingTime: number; // Time in seconds
  totalToProcess: number;
  countdown: number;
  currentDelay: number;
  filterText: string;
}

export interface Jobs {
  [profileName: string]: JobState;
}

export interface InvoiceJobs {
    [profileName: string]: InvoiceJobState;
}

export interface Profile {
  profileName: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  desk?: {
    orgId: string;
    defaultDepartmentId: string;
    fromEmailAddress?: string;
    mailReplyAddressId?: string;
  };
  inventory?: {
    orgId: string;
  };
}


const createInitialJobState = (): JobState => ({
  formData: {
    emails: '',
    subject: '',
    description: '',
    delay: 1,
    sendDirectReply: false,
    verifyEmail: false,
    displayName: '',
  },
  results: [],
  isProcessing: false,
  isPaused: false,
  isComplete: false,
  processingStartTime: null,
  processingTime: 0,
  totalTicketsToProcess: 0,
  countdown: 0,
  currentDelay: 1,
  filterText: '',
});

const createInitialInvoiceJobState = (): InvoiceJobState => ({
    formData: {
        emails: '',
        subject: '',
        body: '',
        delay: 1,
        displayName: '',
        sendCustomEmail: false,
        sendDefaultEmail: false,
    },
    results: [],
    isProcessing: false,
    isPaused: false,
    isComplete: false,
    processingStartTime: null,
    processingTime: 0,
    totalToProcess: 0,
    countdown: 0,
    currentDelay: 1,
    filterText: '',
});


const MainApp = () => {
    const { toast } = useToast();
    const [jobs, setJobs] = useState<Jobs>({});
    const [invoiceJobs, setInvoiceJobs] = useState<InvoiceJobs>({});
    const socketRef = useRef<Socket | null>(null);
    const queryClient = useQueryClient();

    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

    useJobTimer(jobs, setJobs, 'ticket');
    useJobTimer(invoiceJobs, setInvoiceJobs, 'invoice');

    useEffect(() => {
        const socket = io(SERVER_URL);
        socketRef.current = socket;

        socket.on('connect', () => toast({ title: "Connected to server!" }));
        
        // ... (socket listeners remain the same) ...
        socket.on('ticketResult', (result: TicketResult & { profileName: string }) => {
          setJobs(prevJobs => {
            const profileJob = prevJobs[result.profileName];
            if (!profileJob) return prevJobs;
            const isLastTicket = profileJob.results.length + 1 >= profileJob.totalTicketsToProcess;
            return {
              ...prevJobs,
              [result.profileName]: {
                ...profileJob,
                results: [...profileJob.results, result],
                countdown: isLastTicket ? 0 : profileJob.currentDelay,
              }
            };
          });
        });
        socket.on('invoiceResult', (result: InvoiceResult & { profileName: string }) => {
            setInvoiceJobs(prevJobs => {
                const profileJob = prevJobs[result.profileName];
                if (!profileJob) return prevJobs;
                const newResults = [...profileJob.results];
                const existingIndex = newResults.findIndex(r => r.rowNumber === result.rowNumber);
                if (existingIndex > -1) {
                    newResults[existingIndex] = { ...newResults[existingIndex], ...result };
                } else {
                    newResults.push(result);
                }
                newResults.sort((a, b) => a.rowNumber - b.rowNumber);
                const isLast = newResults.length >= profileJob.totalToProcess;
                return {
                    ...prevJobs,
                    [result.profileName]: {
                        ...profileJob,
                        results: newResults,
                        countdown: isLast ? 0 : profileJob.currentDelay,
                    }
                };
            });
        });
        const handleJobCompletion = (data: {profileName: string, jobType: 'ticket' | 'invoice'}, title: string, description: string, variant?: "destructive") => {
            const { profileName, jobType } = data;
            const updater = (prev: any) => {
                if (!prev[profileName]) return prev;
                return { ...prev, [profileName]: { ...prev[profileName], isProcessing: false, isPaused: false, isComplete: true, countdown: 0 }};
            };
            if (jobType === 'ticket') setJobs(updater);
            else setInvoiceJobs(updater);
            toast({ title, description, variant });
        };
        socket.on('bulkComplete', (data) => handleJobCompletion(data, `Processing Complete for ${data.profileName}!`, "All items for this profile have been processed."));
        socket.on('bulkEnded', (data) => handleJobCompletion(data, `Job Ended for ${data.profileName}`, "The process was stopped by the user.", "destructive"));
        socket.on('bulkError', (data) => handleJobCompletion(data, `Server Error for ${data.profileName}`, data.message, "destructive"));

        return () => {
          socket.disconnect();
        };
    }, [toast]);

    const handleOpenAddProfile = () => {
        setEditingProfile(null);
        setIsProfileModalOpen(true);
    };

    const handleOpenEditProfile = (profile: Profile) => {
        setEditingProfile(profile);
        setIsProfileModalOpen(true);
    };
    
    // CORRECTED: Use useMutation for saving profiles
    const saveProfileMutation = useMutation({
        mutationFn: ({ profileData, originalProfileName }: { profileData: Profile, originalProfileName?: string }) => {
            const isEditing = !!originalProfileName;
            const url = isEditing ? `${SERVER_URL}/api/profiles/${encodeURIComponent(originalProfileName)}` : `${SERVER_URL}/api/profiles`;
            const method = isEditing ? 'PUT' : 'POST';
            return fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileData),
            }).then(res => res.json());
        },
        onSuccess: (data, variables) => {
            if (data.success) {
                const isEditing = !!variables.originalProfileName;
                toast({ title: `Profile ${isEditing ? 'updated' : 'added'} successfully!` });
                
                // Manually update the cache
                queryClient.setQueryData(['profiles'], (oldData: Profile[] | undefined) => {
                    const newProfile = variables.profileData;
                    if (isEditing) {
                        return oldData?.map(p => p.profileName === variables.originalProfileName ? newProfile : p) ?? [];
                    } else {
                        return [...(oldData ?? []), newProfile];
                    }
                });

                setIsProfileModalOpen(false);
            } else {
                toast({ title: 'Error', description: data.error, variant: 'destructive' });
            }
        },
        onError: () => {
            toast({ title: 'Error', description: 'Failed to save profile.', variant: 'destructive' });
        }
    });

    // CORRECTED: Use useMutation for deleting profiles
    const deleteProfileMutation = useMutation({
        mutationFn: (profileNameToDelete: string) => {
            return fetch(`${SERVER_URL}/api/profiles/${encodeURIComponent(profileNameToDelete)}`, {
                method: 'DELETE',
            });
        },
        onSuccess: (response, profileNameToDelete) => {
            if (response.ok) {
                toast({ title: `Profile "${profileNameToDelete}" deleted successfully!` });

                // Manually update the cache
                queryClient.setQueryData(['profiles'], (oldData: Profile[] | undefined) => {
                    return oldData?.filter(p => p.profileName !== profileNameToDelete) ?? [];
                });

            } else {
                 response.json().then(data => {
                    toast({ title: 'Error', description: data.error, variant: 'destructive' });
                });
            }
        },
        onError: () => {
            toast({ title: 'Error', description: 'Failed to delete profile.', variant: 'destructive' });
        }
    });

    return (
        <>
            <BrowserRouter>
                <Routes>
                    <Route
                        path="/"
                        element={
                            <Index
                                jobs={jobs}
                                setJobs={setJobs}
                                socket={socketRef.current}
                                createInitialJobState={createInitialJobState}
                                onAddProfile={handleOpenAddProfile}
                                onEditProfile={handleOpenEditProfile}
                                onDeleteProfile={(name) => deleteProfileMutation.mutate(name)}
                            />
                        }
                    />
                    <Route
                        path="/single-ticket"
                        element={
                            <SingleTicket 
                                onAddProfile={handleOpenAddProfile}
                                onEditProfile={handleOpenEditProfile}
                                onDeleteProfile={(name) => deleteProfileMutation.mutate(name)}
                            />
                        }
                    />
                    <Route
                        path="/bulk-invoices"
                        element={
                           <BulkInvoices
                                jobs={invoiceJobs}
                                setJobs={setInvoiceJobs}
                                socket={socketRef.current}
                                createInitialJobState={createInitialInvoiceJobState}
                                onAddProfile={handleOpenAddProfile}
                                onEditProfile={handleOpenEditProfile}
                                onDeleteProfile={(name) => deleteProfileMutation.mutate(name)}
                           />
                        }
                    />
                    <Route
                        path="/single-invoice"
                        element={
                            <SingleInvoice
                                onAddProfile={handleOpenAddProfile}
                                onEditProfile={handleOpenEditProfile}
                                onDeleteProfile={(name) => deleteProfileMutation.mutate(name)}
                            />
                        }
                    />
                     <Route
                        path="/email-statics"
                        element={
                            <EmailStatics
                                onAddProfile={handleOpenAddProfile}
                                onEditProfile={handleOpenEditProfile}
                                onDeleteProfile={(name) => deleteProfileMutation.mutate(name)}
                            />
                        }
                    />
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </BrowserRouter>
            <ProfileModal
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
                onSave={(profileData, originalProfileName) => saveProfileMutation.mutate({ profileData, originalProfileName })}
                profile={editingProfile}
                socket={socketRef.current}
            />
        </>
    );
};

const App = () => (
    <QueryClientProvider client={queryClient}>
        <TooltipProvider>
            <Toaster />
            <Sonner />
            <MainApp />
        </TooltipProvider>
    </QueryClientProvider>
);

export default App;
