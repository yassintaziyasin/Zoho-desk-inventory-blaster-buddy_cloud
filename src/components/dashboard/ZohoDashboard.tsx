// In src/components/dashboard/ZohoDashboard.tsx

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Socket } from 'socket.io-client';
import { DashboardLayout } from './DashboardLayout';
import { ProfileSelector } from './ProfileSelector';
import { TicketForm } from './desk/TicketForm';
import { ResultsDisplay, TicketResult } from './desk/ResultsDisplay';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Ticket, User, Building, MailWarning, Loader2, RefreshCw, Download, Trash2 } from 'lucide-react';
import { Profile, Jobs, JobState } from '@/App';

interface TicketFormData {
  emails: string;
  subject: string;
  description: string;
  delay: number;
  sendDirectReply: boolean;
  verifyEmail: boolean;
  displayName: string;
}

type ApiStatus = {
  status: 'loading' | 'success' | 'error';
  message: string;
  fullResponse?: any;
};

interface EmailFailure {
  ticketNumber: string;
  subject: string;
  reason: string;
  errorMessage: string;
  departmentName: string;
  channel: string;
  email?: string;
  assignee: {
      name: string;
  } | null;
}

interface ZohoDashboardProps {
  jobs: Jobs;
  setJobs: React.Dispatch<React.SetStateAction<Jobs>>;
  socket: Socket | null;
  createInitialJobState: () => JobState;
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
}

const SERVER_URL = import.meta.env.PROD ? '' : "http://localhost:3000";

export const ZohoDashboard: React.FC<ZohoDashboardProps> = ({ jobs, setJobs, createInitialJobState, onAddProfile, onEditProfile, socket: socketProp }) => {
  const { toast } = useToast();
  const [socket, setSocket] = useState<Socket | null>(socketProp);
  
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Connecting to server...', fullResponse: null });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isTestVerifying, setIsTestVerifying] = useState(false);
  
  const [emailFailures, setEmailFailures] = useState<EmailFailure[]>([]);
  const [isFailuresModalOpen, setIsFailuresModalOpen] = useState(false);

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const response = await fetch(`${SERVER_URL}/api/profiles`);
      if (!response.ok) {
        throw new Error('Could not connect to the server.');
      }
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setSocket(socketProp);
  }, [socketProp]);

  useEffect(() => {
    if (profiles.length > 0 && !activeProfileName) {
      setActiveProfileName(profiles[0].profileName);
    }
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
  }, [profiles, activeProfileName, jobs, setJobs, createInitialJobState]);
  
  useEffect(() => {
    if (!socket) return;

    socket.on('apiStatusResult', (result) => setApiStatus({
      status: result.success ? 'success' : 'error',
      message: result.message,
      fullResponse: result.fullResponse || null
    }));

    socket.on('testTicketResult', (result) => {
      setTestResult(result);
      setIsTestModalOpen(true);
    });

    socket.on('testTicketVerificationResult', (result) => {
      setIsTestVerifying(false);
      setTestResult(prev => ({ ...prev, fullResponse: { ...prev.fullResponse, verifyEmail: result.fullResponse.verifyEmail } }));
      toast({ title: result.success ? "Test Verification Complete" : "Test Verification Failed", description: "The test popup has been updated." });
    });
    
    socket.on('emailFailuresResult', (result) => {
      if (result.success && Array.isArray(result.data)) {
        const formattedFailures = result.data.map((failure: any) => ({
          ...failure,
          assignee: failure.assignee 
            ? { name: `${failure.assignee.firstName || ''} ${failure.assignee.lastName || ''}`.trim() }
            : null,
        }));
        setEmailFailures(formattedFailures);
        setIsFailuresModalOpen(true);
      } else if (!result.success) {
        toast({ title: "Error Fetching Failures", description: result.error, variant: "destructive" });
      }
    });
    
    socket.on('clearEmailFailuresResult', (result) => {
        if (result.success) {
            toast({ title: "Success", description: "Email failure alerts have been cleared." });
            setEmailFailures([]);
            setIsFailuresModalOpen(false);
        } else {
            toast({ title: "Error Clearing Failures", description: result.error, variant: "destructive" });
        }
    });

    socket.on('clearTicketLogsResult', (result) => {
      if (result.success) {
        toast({ title: "Success", description: "Ticket log has been cleared." });
      } else {
        toast({ title: "Error Clearing Logs", description: result.error, variant: "destructive" });
      }
    });

    return () => {
      socket.off('apiStatusResult');
      socket.off('testTicketResult');
      socket.off('testTicketVerificationResult');
      socket.off('emailFailuresResult');
      socket.off('clearEmailFailuresResult');
      socket.off('clearTicketLogsResult');
    };
  }, [socket, toast]);

  useEffect(() => {
    if (activeProfileName && socket?.connected) {
      setApiStatus({ status: 'loading', message: 'Checking API connection...' });
      socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'desk' });
    }
  }, [activeProfileName, socket]);

  const handleFormDataChange = (newFormData: TicketFormData) => {
    if (activeProfileName) {
      setJobs(prevJobs => ({
        ...prevJobs,
        [activeProfileName]: {
          ...prevJobs[activeProfileName],
          formData: newFormData,
        }
      }));
    }
  };

  const handleFormSubmit = async () => {
    if (!socket || !activeProfileName || !jobs[activeProfileName]) return;
    
    const currentJob = jobs[activeProfileName];
    const allEmails = currentJob.formData.emails.split('\n').map(email => email.trim()).filter(email => email !== '');
    
    if (allEmails.length === 0) {
      toast({ title: "No Emails to Process", description: "Please enter at least one email address.", variant: "destructive" });
      return;
    }
    
    setJobs(prev => ({
        ...prev,
        [activeProfileName]: {
            ...prev[activeProfileName],
            // *** THIS IS THE FIX ***
            // Reset results to an empty array before starting a new job.
            results: [], 
            isProcessing: true,
            isPaused: false,
            isComplete: false,
            processingStartTime: new Date(),
            totalTicketsToProcess: allEmails.length,
            currentDelay: currentJob.formData.delay,
        }
    }));
    
    toast({ title: `Processing Started for ${activeProfileName}`, description: `Creating ${allEmails.length} tickets...` });

    socket.emit('startBulkCreate', {
      ...currentJob.formData,
      emails: allEmails,
      selectedProfileName: activeProfileName
    });
  };

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
    socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'desk' });
    toast({ title: "Re-checking Connection..." });
  };

  const handleSendTest = (data: { email: string, subject: string, description: string, sendDirectReply: boolean, verifyEmail: boolean }) => {
    if (!socket || !activeProfileName || !jobs[activeProfileName]) return;
    setTestResult(null);
    setIsTestVerifying(data.verifyEmail);
    
    toast({ 
      title: "Sending Test Ticket...",
      description: data.verifyEmail ? "Verification result will appear in the popup in ~10 seconds." : ""
    });

    const currentFormData = jobs[activeProfileName].formData;
    socket.emit('sendTestTicket', { 
      ...data, 
      selectedProfileName: activeProfileName,
      displayName: currentFormData.displayName
    });
  };
  
  const handlePauseResume = () => {
    if (!socket || !activeProfileName) return;
    const isPaused = jobs[activeProfileName]?.isPaused;
    socket.emit(isPaused ? 'resumeJob' : 'pauseJob', { profileName: activeProfileName, jobType: 'ticket' });
    setJobs(prev => ({ ...prev, [activeProfileName]: { ...prev[activeProfileName], isPaused: !isPaused }}));
    toast({ title: `Job ${isPaused ? 'Resumed' : 'Paused'}` });
  };
  
  const handleEndJob = () => {
    if (!socket || !activeProfileName) return;
    socket.emit('endJob', { profileName: activeProfileName, jobType: 'ticket' });
  };
  
  const handleFetchEmailFailures = () => {
    if (!socket || !activeProfileName) return;
    toast({ title: "Fetching Email Failures..." });
    socket.emit('getEmailFailures', { selectedProfileName: activeProfileName });
  };
  
  const handleClearTicketLogs = () => {
    if (!socket) return;
    if (window.confirm("Are you sure you want to permanently delete all ticket logs? This action cannot be undone.")) {
      toast({ title: "Clearing Ticket Logs..." });
      socket.emit('clearTicketLogs');
    }
  };

  const selectedProfile = profiles.find(p => p.profileName === activeProfileName) || null;
  const currentJob = activeProfileName ? jobs[activeProfileName] : null;

  const runningJobProfileName = Object.keys(jobs).find(key => jobs[key].isProcessing);
  const jobForStats = runningJobProfileName ? jobs[runningJobProfileName] : currentJob;

  const stats = {
    totalTickets: jobForStats?.results.length ?? 0,
    successCount: jobForStats?.results.filter(r => r.success).length ?? 0,
    errorCount: jobForStats?.results.filter(r => !r.success).length ?? 0,
    processingTime: jobForStats?.processingTime ?? '0s',
    totalToProcess: jobForStats?.totalTicketsToProcess ?? 0,
    isProcessing: jobForStats?.isProcessing ?? false,
  };
  
  const handleExportFailures = () => {
    const content = emailFailures.map(f => f.email).join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "failed-emails.txt");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearFailures = () => {
    if (!socket || !activeProfileName) return;
    socket.emit('clearEmailFailures', { selectedProfileName: activeProfileName });
  };

  return (
    <>
      <DashboardLayout stats={stats} onAddProfile={onAddProfile}>
        <div className="space-y-8">
          <ProfileSelector
            profiles={profiles}
            selectedProfile={selectedProfile}
            jobs={jobs}
            onProfileChange={handleProfileChange}
            apiStatus={apiStatus}
            onShowStatus={() => setIsStatusModalOpen(true)}
            onManualVerify={handleManualVerify}
            socket={socket}
            onEditProfile={onEditProfile}
          />
          {currentJob && (
            <>
              <TicketForm
                jobState={currentJob}
                formData={currentJob.formData}
                onFormDataChange={handleFormDataChange}
                onSubmit={handleFormSubmit}
                isProcessing={currentJob.isProcessing}
                isPaused={currentJob.isPaused}
                onPauseResume={handlePauseResume}
                onEndJob={handleEndJob}
                onSendTest={handleSendTest}
                socket={socket} 
                selectedProfile={selectedProfile}
                onFetchFailures={handleFetchEmailFailures}
                onClearTicketLogs={handleClearTicketLogs}
              />
              <ResultsDisplay
                results={currentJob.results}
                isProcessing={currentJob.isProcessing}
                isComplete={currentJob.isComplete}
                totalTickets={currentJob.totalTicketsToProcess}
                countdown={currentJob.countdown}
                filterText={currentJob.filterText}
                onFilterTextChange={(text) => setJobs(prev => ({...prev, [activeProfileName!]: { ...prev[activeProfileName!], filterText: text }}))}
              />
            </>
          )}
        </div>
      </DashboardLayout>
      
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>API Connection Status</DialogTitle><DialogDescription>This is the live status of the connection to the Zoho Desk API for the selected profile.</DialogDescription></DialogHeader><div className={`p-4 rounded-md ${apiStatus.status === 'success' ? 'bg-green-100 dark:bg-green-900/50' : apiStatus.status === 'error' ? 'bg-red-100 dark:bg-red-900/50' : 'bg-muted'}`}><p className="font-bold text-lg">{apiStatus.status.charAt(0).toUpperCase() + apiStatus.status.slice(1)}</p><p className="text-sm text-muted-foreground mt-1">{apiStatus.message}</p></div>{apiStatus.fullResponse && (<div className="mt-4"><h4 className="text-sm font-semibold mb-2 text-foreground">Full Response from Server:</h4><pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border max-h-60 overflow-y-auto">{JSON.stringify(apiStatus.fullResponse, null, 2)}</pre></div>)}<Button onClick={() => setIsStatusModalOpen(false)} className="mt-4">Close</Button></DialogContent></Dialog>
      <Dialog open={isTestModalOpen} onOpenChange={setIsTestModalOpen}><DialogContent className="max-w-2xl bg-card border-border shadow-large"><DialogHeader><DialogTitle>Test Ticket Response</DialogTitle></DialogHeader><div className="max-h-[70vh] overflow-y-auto space-y-4 p-1">{testResult?.fullResponse?.ticketCreate ? (<><div><h4 className="text-sm font-semibold mb-2 text-foreground">Ticket Creation Response</h4><pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">{JSON.stringify(testResult.fullResponse.ticketCreate, null, 2)}</pre></div>{testResult.fullResponse.sendReply && (<div><h4 className="text-sm font-semibold mb-2 text-foreground">Send Reply Response</h4><pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">{JSON.stringify(testResult.fullResponse.sendReply, null, 2)}</pre></div>)}{isTestVerifying && (<div className="p-4 rounded-md bg-muted/50 text-center flex items-center justify-center"><Loader2 className="h-4 w-4 mr-2 animate-spin"/><span className="text-sm text-muted-foreground">Verifying email, please wait...</span></div>)}{testResult.fullResponse.verifyEmail && (<div><h4 className="text-sm font-semibold mb-2 text-foreground">Email Verification Response</h4><pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">{JSON.stringify(testResult.fullResponse.verifyEmail, null, 2)}</pre></div>)}</>) : (<pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono text-foreground border border-border">{JSON.stringify(testResult, null, 2)}</pre>)}</div><Button onClick={() => setIsTestModalOpen(false)}>Close</Button></DialogContent></Dialog>
      <Dialog open={isFailuresModalOpen} onOpenChange={setIsFailuresModalOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Email Delivery Failure Alerts ({emailFailures.length})</DialogTitle><DialogDescription>Showing recent email delivery failures for the selected department.</DialogDescription></DialogHeader><div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">{emailFailures.length > 0 ? (<div className="space-y-4">{emailFailures.map((failure, index) => (<div key={index} className="p-4 rounded-lg border bg-card"><div className="flex items-center justify-between mb-2"><div className="flex items-center space-x-2"><Ticket className="h-4 w-4 text-primary"/><span className="font-semibold text-foreground">Ticket #{failure.ticketNumber}:<span className="font-normal text-muted-foreground ml-2">{failure.email}</span></span></div><Badge variant="destructive">Failed</Badge></div><p className="text-sm text-muted-foreground italic mb-3">"{failure.subject}"</p><div className="text-xs space-y-2 mb-3"><div className="flex items-center"><Building className="h-3 w-3 mr-2 text-muted-foreground"/><span className="text-muted-foreground mr-1">Department:</span><span className="font-medium text-foreground">{failure.departmentName}</span></div><div className="flex items-center"><User className="h-3 w-3 mr-2 text-muted-foreground"/><span className="text-muted-foreground mr-1">Assignee:</span><span className="font-medium text-foreground">{failure.assignee?.name || 'Unassigned'}</span></div></div><div className="p-3 rounded-md bg-muted/50 text-xs space-y-1"><p><strong className="text-foreground">Reason:</strong> {failure.reason}</p><p><strong className="text-foreground">Error:</strong> {failure.errorMessage}</p></div></div>))}</div>) : (<div className="text-center py-12"><p className="font-semibold">No Failures Found</p><p className="text-sm text-muted-foreground mt-1">There are no recorded email delivery failures for this department.</p></div>)}</div><DialogFooter className="pt-4 border-t mt-4"><Button variant="outline" onClick={handleExportFailures} disabled={emailFailures.length === 0}><Download className="h-4 w-4 mr-2" />Export Emails</Button><Button variant="destructive" onClick={handleClearFailures} disabled={emailFailures.length === 0}><Trash2 className="h-4 w-4 mr-2" />Clear All Failures</Button><Button onClick={() => setIsFailuresModalOpen(false)}>Close</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
};
