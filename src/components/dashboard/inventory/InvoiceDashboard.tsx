import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import { DashboardLayout } from '../DashboardLayout';
import { ProfileSelector } from '../ProfileSelector';
import { useToast } from '@/hooks/use-toast';
import { Profile, InvoiceJobs, InvoiceJobState, InvoiceFormData } from '@/App';
import { InvoiceForm } from './InvoiceForm';
import { InvoiceResultsDisplay } from './InvoiceResultsDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ApiStatus = {
  status: 'loading' | 'success' | 'error';
  message: string;
  fullResponse?: any;
};

interface InvoiceDashboardProps {
  jobs: InvoiceJobs;
  setJobs: React.Dispatch<React.SetStateAction<InvoiceJobs>>;
  socket: Socket | null;
  createInitialJobState: () => InvoiceJobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const SERVER_URL = "http://localhost:3000";

export const InvoiceDashboard: React.FC<InvoiceDashboardProps> = ({ 
    jobs, 
    setJobs, 
    socket, 
    createInitialJobState,
    onAddProfile, 
    onEditProfile,
    onDeleteProfile
}) => {
  const { toast } = useToast();
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Connecting to server...', fullResponse: null });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isLoadingName, setIsLoadingName] = useState(false);
  
  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const response = await fetch(`${SERVER_URL}/api/profiles`);
      if (!response.ok) throw new Error('Could not connect to the server.');
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (profiles.length > 0) {
        setJobs(prevJobs => {
            const newJobs = { ...prevJobs };
            let updated = false;
            profiles.forEach(p => {
                if (!newJobs[p.profileName]) {
                    newJobs[p.profileName] = createInitialJobState();
                    updated = true;
                }
            });
            return updated ? newJobs : prevJobs;
        });
    }
    if (profiles.length > 0 && !activeProfileName) {
      const inventoryProfile = profiles.find(p => p.inventory?.orgId);
      setActiveProfileName(inventoryProfile ? inventoryProfile.profileName : profiles[0]?.profileName || null);
    }
  }, [profiles, activeProfileName, setJobs, createInitialJobState]);
  
  useEffect(() => {
    if (!socket) return;

    const handleApiStatus = (result: any) => setApiStatus({
      status: result.success ? 'success' : 'error',
      message: result.message,
      fullResponse: result.fullResponse || null
    });

    const handleOrgDetails = (result: any) => {
      setIsLoadingName(false);
      if (result.success) {
        setDisplayName(result.data.contact_name || 'N/A');
      } else {
        toast({ title: "Error Fetching Sender Name", description: result.error, variant: "destructive" });
      }
    };
    
    const handleUpdateOrg = (result: any) => {
       if (result.success) {
        setDisplayName(result.data.contact_name);
        toast({ title: "Success", description: "Sender name has been updated." });
      } else {
        toast({ title: "Error Updating Name", description: result.error, variant: "destructive" });
      }
    };
    
    socket.on('apiStatusResult', handleApiStatus);
    socket.on('orgDetailsResult', handleOrgDetails);
    socket.on('updateOrgDetailsResult', handleUpdateOrg);

    return () => {
      socket.off('apiStatusResult', handleApiStatus);
      socket.off('orgDetailsResult', handleOrgDetails);
      socket.off('updateOrgDetailsResult', handleUpdateOrg);
    };
  }, [socket, toast]);

  const fetchDisplayName = () => {
    if (activeProfileName && socket) {
      setIsLoadingName(true);
      socket.emit('getOrgDetails', { selectedProfileName: activeProfileName });
    }
  };
  
  useEffect(() => {
    fetchDisplayName();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileName, socket]);

  useEffect(() => {
    if (activeProfileName && socket?.connected) {
      setApiStatus({ status: 'loading', message: 'Checking API connection...' });
      socket.emit('checkApiStatus', { 
        selectedProfileName: activeProfileName, 
        service: 'inventory' 
      });
    }
  }, [activeProfileName, socket]);

  const handleProfileChange = (profileName: string) => {
    const profile = profiles.find(p => p.profileName === profileName);
    if (profile) {
      setActiveProfileName(profileName);
      toast({ title: "Profile Changed", description: `Switched to ${profileName}` });
    }
  };
  
  const handleManualVerify = () => {
    if (!socket || !activeProfileName) return;
    setApiStatus({ status: 'loading', message: 'Checking API connection...', fullResponse: null });
    socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'inventory' });
    toast({ title: "Re-checking Connection..." });
  };
  
  const handleFormDataChange = (newFormData: InvoiceFormData) => {
    if (activeProfileName) {
        setJobs(prev => ({
            ...prev,
            [activeProfileName]: {
                ...prev[activeProfileName],
                formData: newFormData
            }
        }));
    }
  };

  const handleFormSubmit = () => {
    if (!socket || !activeProfileName || !jobs[activeProfileName]) {
        toast({ title: "Error", description: "Not connected to the server or no profile selected.", variant: "destructive" });
        return;
    }
    const currentFormData = jobs[activeProfileName].formData;
    const emails = currentFormData.emails.split('\n').map((e: string) => e.trim()).filter(Boolean);
    if (emails.length === 0) {
        toast({ title: "No emails provided", variant: "destructive" });
        return;
    }

    setJobs(prev => ({
        ...prev,
        [activeProfileName]: {
            ...prev[activeProfileName],
            results: [], 
            isProcessing: true,
            isPaused: false,
            isComplete: false,
            processingStartTime: new Date(),
            totalToProcess: emails.length,
            currentDelay: currentFormData.delay,
            filterText: '',
        }
    }));
    socket.emit('startBulkInvoice', {
        ...currentFormData,
        emails,
        selectedProfileName: activeProfileName
    });
  };
  
  const handleUpdateName = () => {
      if (activeProfileName && socket) {
          socket.emit('updateOrgDetails', { 
              selectedProfileName: activeProfileName, 
              displayName 
          });
      }
  };

  const handleFilterTextChange = (text: string) => {
    if (activeProfileName) {
      setJobs(prev => ({
        ...prev,
        [activeProfileName]: {
          ...prev[activeProfileName],
          filterText: text,
        }
      }));
    }
  };

  const handlePauseResume = () => {
    if (!socket || !activeProfileName) return;
    const isPaused = jobs[activeProfileName]?.isPaused;
    socket.emit(isPaused ? 'resumeJob' : 'pauseJob', { profileName: activeProfileName, jobType: 'invoice' });
    setJobs(prev => ({ ...prev, [activeProfileName]: { ...prev[activeProfileName], isPaused: !isPaused }}));
    toast({ title: `Job ${isPaused ? 'Resumed' : 'Paused'}` });
  };

  const handleEndJob = () => {
      if (!socket || !activeProfileName) return;
      socket.emit('endJob', { profileName: activeProfileName, jobType: 'invoice' });
  };

  const selectedProfile = profiles.find(p => p.profileName === activeProfileName) || null;
  const currentJob = activeProfileName ? jobs[activeProfileName] : null;

  return (
    <>
    <DashboardLayout onAddProfile={onAddProfile} stats={{
        totalTickets: currentJob?.results.length || 0,
        totalToProcess: currentJob?.totalToProcess || 0,
        isProcessing: currentJob?.isProcessing || false,
    }}>
      <div className="space-y-8">
        <ProfileSelector
          profiles={profiles.filter(p => p.inventory?.orgId)}
          selectedProfile={selectedProfile}
          jobs={jobs}
          onProfileChange={handleProfileChange}
          apiStatus={apiStatus}
          onShowStatus={() => setIsStatusModalOpen(true)}
          onManualVerify={handleManualVerify}
          socket={socket}
          onEditProfile={onEditProfile}
          onDeleteProfile={onDeleteProfile}
        />
        
        {currentJob && (
            <>
                <InvoiceForm 
                    jobState={currentJob}
                    formData={currentJob.formData}
                    onFormDataChange={handleFormDataChange}
                    onSubmit={handleFormSubmit} 
                    isProcessing={currentJob.isProcessing}
                    isPaused={currentJob.isPaused}
                    onPauseResume={handlePauseResume}
                    onEndJob={handleEndJob}
                    displayName={displayName}
                    onDisplayNameChange={setDisplayName}
                    onUpdateName={handleUpdateName}
                    isLoadingName={isLoadingName}
                    onRefreshName={fetchDisplayName}
                />

                <InvoiceResultsDisplay 
                    results={currentJob.results} 
                    isProcessing={currentJob.isProcessing} 
                    totalRows={currentJob.totalToProcess}
                    filterText={currentJob.filterText}
                    onFilterTextChange={handleFilterTextChange}
                />
            </>
        )}
      </div>
    </DashboardLayout>
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>API Connection Status</DialogTitle><DialogDescription>This is the live status of the connection to the Zoho Inventory API for the selected profile.</DialogDescription></DialogHeader><div className={`p-4 rounded-md ${apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' : 'bg-muted'}`}><p className="font-bold text-lg">{apiStatus.status.charAt(0).toUpperCase() + apiStatus.status.slice(1)}</p><p className="text-sm text-muted-foreground mt-1">{apiStatus.message}</p></div>{apiStatus.fullResponse && (<div className="mt-4"><h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server:</h4><pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-60 overflow-y-auto">{JSON.stringify(apiStatus.fullResponse, null, 2)}</pre></div>)}<Button onClick={() => setIsStatusModalOpen(false)} className="mt-4">Close</Button></DialogContent></Dialog>
    </>
  );
};
