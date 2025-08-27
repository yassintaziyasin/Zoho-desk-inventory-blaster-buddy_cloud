import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Building, AlertCircle, CheckCircle, Loader, RefreshCw, Activity, Edit } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { Profile, Jobs as TicketJobs, InvoiceJobs } from '@/App';

type ApiStatus = {
    status: 'loading' | 'success' | 'error';
    message: string;
    fullResponse?: any;
};

interface ProfileSelectorProps {
  profiles: Profile[];
  selectedProfile: Profile | null;
  jobs: TicketJobs | InvoiceJobs;
  onProfileChange: (profileName: string) => void;
  apiStatus: ApiStatus;
  onShowStatus: () => void;
  onManualVerify: () => void;
  socket: Socket | null;
  onEditProfile: (profile: Profile) => void;
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  profiles,
  selectedProfile,
  jobs,
  onProfileChange,
  apiStatus,
  onShowStatus,
  onManualVerify,
  socket,
  onEditProfile,
}) => {

  const getBadgeProps = () => {
    switch (apiStatus.status) {
      case 'success':
        return { text: 'Connected', variant: 'success' as const, icon: <CheckCircle className="h-4 w-4 mr-2" /> };
      case 'error':
        return { text: 'Connection Failed', variant: 'destructive' as const, icon: <AlertCircle className="h-4 w-4 mr-2" /> };
      default:
        return { text: 'Checking...', variant: 'secondary' as const, icon: <Loader className="h-4 w-4 mr-2 animate-spin" /> };
    }
  };
  
  const badgeProps = getBadgeProps();
  
  const getTotalToProcess = (job: any) => {
    return job.totalTicketsToProcess || job.totalToProcess || 0;
  }

  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-2">
          <User className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Profile Selection</CardTitle>
        </div>
        <CardDescription>
          Choose a Zoho profile to work with
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Select 
              value={selectedProfile?.profileName || ''} 
              onValueChange={onProfileChange}
              disabled={profiles.length === 0}
            >
              <SelectTrigger className="h-12 bg-muted/50 border-border hover:bg-muted transition-colors flex-1">
                <SelectValue placeholder="Select a profile..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-border shadow-large">
                {profiles.map((profile) => {
                  const job = jobs[profile.profileName];
                  const isJobActive = job && job.isProcessing;
                  return (
                    <SelectItem 
                      key={profile.profileName} 
                      value={profile.profileName}
                      className="cursor-pointer hover:bg-accent focus:bg-accent"
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center space-x-3">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{profile.profileName}</span>
                        </div>
                        {isJobActive && (
                          <Badge variant="outline" className="font-mono text-xs">
                            <Activity className="h-3 w-3 mr-1.5 animate-pulse text-primary"/>
                            {job.results.length}/{getTotalToProcess(job)} {job.isPaused ? 'paused' : 'processing'}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => selectedProfile && onEditProfile(selectedProfile)} disabled={!selectedProfile}>
                <Edit className="h-4 w-4" />
            </Button>
          </div>

          {selectedProfile && (
            <div className="p-4 bg-gradient-muted rounded-lg border border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Active Profile Status</span>
                
                <div className="flex items-center space-x-2">
                  <Button variant={badgeProps.variant} size="sm" onClick={onShowStatus}>
                      {badgeProps.icon}
                      {badgeProps.text}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-8 w-8" 
                    onClick={onManualVerify}
                    disabled={apiStatus.status === 'loading'}
                  >
                      <RefreshCw className="h-4 w-4"/>
                  </Button>
                </div>
              </div>
               <div className="space-y-1 text-sm pt-2">
                  {apiStatus.status === 'success' && apiStatus.fullResponse?.agentInfo && (
                      <>
                          <div className="flex justify-between">
                              <span className="text-muted-foreground">Agent Name:</span>
                              <span className="font-medium text-foreground">{apiStatus.fullResponse.agentInfo.firstName} {apiStatus.fullResponse.agentInfo.lastName}</span>
                          </div>
                          <div className="flex justify-between">
                              <span className="text-muted-foreground">Organization:</span>
                              <span className="font-medium text-foreground">{apiStatus.fullResponse.orgName}</span>
                          </div>
                      </>
                  )}
                  {selectedProfile.desk?.orgId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Desk Org ID:</span>
                      <span className="font-mono text-foreground">{selectedProfile.desk.orgId}</span>
                    </div>
                  )}
                   {selectedProfile.inventory?.orgId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Inventory Org ID:</span>
                      <span className="font-mono text-foreground">{selectedProfile.inventory.orgId}</span>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};