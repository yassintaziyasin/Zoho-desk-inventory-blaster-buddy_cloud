// In src/App.tsx

import React, { useState, useEffect, useRef } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
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

// Use Vite's environment variables to set the server URL
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";


// --- Interfaces (Unchanged) ---
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
        const socket = io(SERVER_URL, {
            // This helps with some deployment environments
            transports: ['websocket', 'polling']
        });
        socketRef.current = socket;

        // ... rest of useEffect is unchanged
        
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
    
const handleSaveProfile = async (profileData: Profile, originalProfileName?: string) => {
    const isEditing = !!originalProfileName;
    // Remove trailing slash from SERVER_URL to prevent double slashes
    const cleanServerUrl = SERVER_URL.replace(/\/$/, "");
    const url = isEditing ? `${cleanServerUrl}/api/profiles/${encodeURIComponent(originalProfileName)}` : `${cleanServerUrl}/api/profiles`;

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData),
        });
        const result = await response.json();
        if (result.success) {
            toast({ title: `Profile ${isEditing ? 'updated' : 'added'} successfully!` });
            queryClient.invalidateQueries({ queryKey: ['profiles'] });
            setIsProfileModalOpen(false);
        } else {
            toast({ title: 'Error', description: result.error, variant: 'destructive' });
        }
    } catch (error) {
        toast({ title: 'Error', description: 'Failed to save profile.', variant: 'destructive' });
    }
};
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
                            />
                        }
                    />
                    <Route
                        path="/single-ticket"
                        element={
                            <SingleTicket 
                                onAddProfile={handleOpenAddProfile}
                                onEditProfile={handleOpenEditProfile}
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
                           />
                        }
                    />
                    <Route
                        path="/single-invoice"
                        element={
                            <SingleInvoice
                                onAddProfile={handleOpenAddProfile}
                                onEditProfile={handleOpenEditProfile}
                            />
                        }
                    />
                     <Route
                        path="/email-statics"
                        element={
                            <EmailStatics
                                onAddProfile={handleOpenAddProfile}
                                onEditProfile={handleOpenEditProfile}
                            />
                        }
                    />
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </BrowserRouter>
            <ProfileModal
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
                onSave={handleSaveProfile}
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