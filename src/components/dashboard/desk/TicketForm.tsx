// In src/components/dashboard/desk/TicketForm.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Send, Eye, Mail, Clock, MessageSquare, Users, Pause, Play, Square, Bot, Upload, Edit, RefreshCw, Trash2, MailWarning, CheckCircle2, XCircle, ImagePlus } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Socket } from 'socket.io-client';
import { Profile, JobState } from '@/App';
import { formatTime } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TicketFormData {
  emails: string;
  subject: string;
  description: string;
  delay: number;
  sendDirectReply: boolean;
  verifyEmail: boolean;
  displayName: string;
}

interface TicketFormProps {
  onSubmit: () => void;
  isProcessing: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
  onEndJob: () => void;
  onSendTest: (data: { email: string, subject: string, description: string, sendDirectReply: boolean, verifyEmail: boolean }) => void;
  formData: TicketFormData;
  onFormDataChange: (data: TicketFormData) => void;
  socket: Socket | null;
  selectedProfile: Profile | null;
  onFetchFailures: () => void;
  onClearTicketLogs: () => void;
  jobState: JobState | null;
}

// New component for the Image Insertion Dialog
const ImageToolDialog = ({ onApply }: { onApply: (html: string) => void }) => {
    const [imageUrl, setImageUrl] = useState('');
    const [altText, setAltText] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [width, setWidth] = useState('80');
    const [maxWidth, setMaxWidth] = useState('500');
    const [alignment, setAlignment] = useState('center');
    const [isOpen, setIsOpen] = useState(false);

    const handleApply = () => {
        let style = `width: ${width}%; max-width: ${maxWidth}px; height: auto; border: 1px solid #dddddd; margin-top: 10px; margin-bottom: 10px;`;
        let imgTag = `<img src="${imageUrl}" alt="${altText}" style="${style}" />`;
        
        if (linkUrl) {
            imgTag = `<a href="${linkUrl}">${imgTag}</a>`;
        }

        const containerStyle = `text-align: ${alignment};`;
        const finalHtml = `<div style="${containerStyle}">${imgTag}</div>`;
        
        onApply(finalHtml);
        setIsOpen(false); // Close the dialog
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    <ImagePlus className="h-3 w-3 mr-1" />
                    Add Image
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Add and Style Image</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="imageUrl" className="text-right">Image URL</Label>
                        <Input id="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="col-span-3" placeholder="https://example.com/image.png" />
                    </div>
                    {imageUrl && (
                        <div className="col-span-4 flex justify-center p-4 bg-muted rounded-md">
                            <img src={imageUrl} alt="Preview" className="max-w-full max-h-48" />
                        </div>
                    )}
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="altText" className="text-right">Alt Text</Label>
                        <Input id="altText" value={altText} onChange={(e) => setAltText(e.target.value)} className="col-span-3" placeholder="Description of the image" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="linkUrl" className="text-right">Link URL</Label>
                        <Input id="linkUrl" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="col-span-3" placeholder="(Optional) Make image clickable" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="width" className="text-right">Width (%)</Label>
                        <Input id="width" type="number" value={width} onChange={(e) => setWidth(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="maxWidth" className="text-right">Max Width (px)</Label>
                        <Input id="maxWidth" type="number" value={maxWidth} onChange={(e) => setMaxWidth(e.target.value)} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="alignment" className="text-right">Alignment</Label>
                        <Select value={alignment} onValueChange={setAlignment}>
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select alignment" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="left">Left</SelectItem>
                                <SelectItem value="center">Center</SelectItem>
                                <SelectItem value="right">Right</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button onClick={handleApply} disabled={!imageUrl}>Apply and Insert</Button>
            </DialogContent>
        </Dialog>
    );
};


export const TicketForm: React.FC<TicketFormProps> = ({
  onSubmit,
  isProcessing,
  isPaused,
  onPauseResume,
  onEndJob,
  onSendTest,
  formData,
  onFormDataChange,
  socket,
  selectedProfile,
  onFetchFailures,
  onClearTicketLogs,
  jobState
}) => {
  const [testEmail, setTestEmail] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [isLoadingName, setIsLoadingName] = useState(false);

  const fetchDisplayName = () => {
      if (selectedProfile?.desk?.mailReplyAddressId && socket) {
          setIsLoadingName(true);
          socket.emit('getMailReplyAddressDetails', { selectedProfileName: selectedProfile.profileName });
      } else {
          onFormDataChange({ ...formData, displayName: 'N/A' });
      }
  };

  useEffect(() => {
    if (selectedProfile && socket) {
      fetchDisplayName();
    }
  }, [selectedProfile, socket]);

  useEffect(() => {
    if (!socket) return;

    const handleDetailsResult = (result: any) => {
        setIsLoadingName(false);
        if (result.success) {
            const name = result.notConfigured ? 'N/A' : result.data?.data?.displayName || '';
            onFormDataChange({ ...formData, displayName: name });
        } else {
            toast({ title: "Error Fetching Sender Name", description: result.error, variant: "destructive" });
        }
    };

    socket.on('mailReplyAddressDetailsResult', handleDetailsResult);

    return () => {
        socket.off('mailReplyAddressDetailsResult', handleDetailsResult);
    };
  }, [socket, toast, onFormDataChange, formData]);

  const handleUpdateName = () => {
      if (selectedProfile?.desk?.mailReplyAddressId && socket) {
          socket.emit('updateMailReplyAddressDetails', {
              selectedProfileName: selectedProfile.profileName,
              displayName: formData.displayName
          });
           toast({ title: "Success", description: "Sender name has been updated." });
      }
  };

  const emailCount = formData.emails
    .split('\n')
    .filter(email => email.trim() !== '').length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const handleInputChange = (field: keyof Omit<TicketFormData, 'sendDirectReply' | 'verifyEmail'>, value: string | number) => {
    onFormDataChange({ ...formData, [field]: value });
  };

  const handleCheckboxChange = (field: 'sendDirectReply' | 'verifyEmail', checked: boolean) => {
    onFormDataChange({ ...formData, [field]: checked });
  }

  const handleTestClick = () => {
    if (!testEmail) {
        alert("Please enter an email address for the test ticket.");
        return;
    }
    onSendTest({
        email: testEmail,
        subject: formData.subject,
        description: formData.description,
        sendDirectReply: formData.sendDirectReply,
        verifyEmail: formData.verifyEmail,
    });
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const emails = content.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi) || [];
        onFormDataChange({ ...formData, emails: emails.join('\n') });
      };
      reader.readAsText(file);
    }
  };

  const handleApplyImage = (html: string) => {
    onFormDataChange({ ...formData, description: formData.description + '\n' + html });
  };

  const successCount = jobState?.results.filter(r => r.success).length || 0;
  const errorCount = jobState?.results.filter(r => !r.success).length || 0;

  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <Send className="h-5 w-5 text-primary" />
              <span>Create Bulk Tickets</span>
            </CardTitle>
            <CardDescription className="mt-1">
              Create multiple tickets simultaneously for different recipients
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={onClearTicketLogs}>
                <Trash2 className="h-4 w-4 mr-2"/>
                Clear Ticket Logs
            </Button>
            <Button variant="outline" size="sm" onClick={onFetchFailures}>
                <MailWarning className="h-4 w-4 mr-2"/>
                View Email Failures
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="emails" className="flex items-center space-x-2">
                    <Mail className="h-4 w-4" />
                    <span>Recipient Emails</span>
                  </Label>
                  <div className='flex items-center space-x-2'>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept=".csv,.txt"
                      onChange={handleFileImport}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing}
                    >
                      <Upload className="h-3 w-3 mr-2" />
                      Import
                    </Button>
                    <Badge variant="secondary" className="text-xs">
                      <Users className="h-3 w-3 mr-1" />
                      {emailCount} recipients
                    </Badge>
                  </div>
                </div>
                <Textarea
                  id="emails"
                  placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                  value={formData.emails}
                  onChange={(e) => handleInputChange('emails', e.target.value)}
                  className="min-h-[200px] font-mono text-sm bg-muted/30 border-border focus:bg-card transition-colors"
                  required
                  disabled={isProcessing}
                />
                <p className="text-xs text-muted-foreground">
                  Enter one email address per line, or import from a .csv/.txt file.
                </p>

                {jobState && (jobState.isProcessing || jobState.results.length > 0) && (
                    <div className="pt-4 border-t border-dashed">
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <Label className="text-xs text-muted-foreground">Time Elapsed</Label>
                                <p className="text-lg font-bold font-mono">{formatTime(jobState.processingTime)}</p>
                            </div>
                            <div>
                                <Label className="text-xs text-muted-foreground">Success</Label>
                                <p className="text-lg font-bold font-mono text-success flex items-center justify-center space-x-1">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>{successCount}</span>
                                </p>
                            </div>
                            <div>
                                <Label className="text-xs text-muted-foreground">Failed</Label>
                                <p className="text-lg font-bold font-mono text-destructive flex items-center justify-center space-x-1">
                                    <XCircle className="h-4 w-4" />
                                    <span>{errorCount}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="pt-4 border-t border-dashed">
                    <Label htmlFor="test-email" className="text-xs text-muted-foreground">Send a single test ticket (with options enabled above)</Label>
                    <div className="flex items-center space-x-2 mt-2">
                        <Input
                            id="test-email"
                            type="email"
                            placeholder="Enter test email..."
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            className="h-10 bg-muted/30 border-border focus:bg-card"
                            disabled={isProcessing}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleTestClick}
                            disabled={isProcessing || !testEmail || !formData.subject || !formData.description}
                        >
                            Test
                        </Button>
                    </div>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName" className="flex items-center space-x-2">
                    <Edit className="h-4 w-4" />
                    <span>Sender Name (Display Name)</span>
                </Label>
                <div className="flex items-center space-x-2">
                    <Input
                        id="displayName"
                        value={formData.displayName}
                        onChange={(e) => handleInputChange('displayName', e.target.value)}
                        placeholder={isLoadingName ? "Loading..." : "Not configured for this profile"}
                        disabled={!selectedProfile?.desk?.mailReplyAddressId || isLoadingName}
                    />
                    <Button
                        type="button"
                        size="sm"
                        onClick={handleUpdateName}
                        disabled={!selectedProfile?.desk?.mailReplyAddressId || isLoadingName || formData.displayName === 'N/A'}
                    >
                        Update
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={fetchDisplayName}
                        disabled={!selectedProfile?.desk?.mailReplyAddressId || isLoadingName}
                    >
                        <RefreshCw className={`h-4 w-4 ${isLoadingName ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject" className="flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4" />
                  <span>Ticket Subject</span>
                </Label>
                <Input
                  id="subject"
                  placeholder="Enter ticket subject..."
                  value={formData.subject}
                  onChange={(e) => handleInputChange('subject', e.target.value)}
                  className="h-12 bg-muted/30 border-border focus:bg-card transition-colors"
                  required
                  disabled={isProcessing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="delay" className="flex items-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>Delay Between Tickets</span>
                </Label>
                <div className="flex items-center space-x-3">
                  <Input
                    id="delay"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.delay}
                    onChange={(e) => handleInputChange('delay', parseInt(e.target.value) || 0)}
                    className="w-24 h-12 bg-muted/30 border-border focus:bg-card transition-colors"
                    required
                    disabled={isProcessing}
                  />
                  <span className="text-sm text-muted-foreground">seconds</span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                  <Label className="flex items-center space-x-2">
                    <Bot className="h-4 w-4" />
                    <span>Optional Email Actions</span>
                  </Label>
                  <div className="space-y-3 rounded-lg bg-muted/30 p-4 border border-border">
                    <div className="flex items-start space-x-3">
                        <Checkbox
                            id="sendDirectReply"
                            checked={formData.sendDirectReply}
                            onCheckedChange={(checked) => handleCheckboxChange('sendDirectReply', !!checked)}
                            disabled={isProcessing || formData.verifyEmail}
                        />
                        <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="sendDirectReply" className="font-medium hover:cursor-pointer">Send Direct Public Reply</Label>
                            <p className="text-xs text-muted-foreground">Sends the description as an email reply. Disables Zoho's internal automations for this ticket.</p>
                        </div>
                    </div>
                     <div className="flex items-start space-x-3">
                        <Checkbox
                            id="verifyEmail"
                            checked={formData.verifyEmail}
                            onCheckedChange={(checked) => handleCheckboxChange('verifyEmail', !!checked)}
                            disabled={isProcessing || formData.sendDirectReply}
                        />
                        <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="verifyEmail" className="font-medium hover:cursor-pointer">Verify Automation Email</Label>
                            <p className="text-xs text-muted-foreground">Slower. Waits and checks if Zoho's automation email was sent.</p>
                        </div>
                    </div>
                  </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="description" className="flex items-center space-x-2">
                    <MessageSquare className="h-4 w-4" />
                    <span>Ticket Description</span>
                  </Label>
                  <div className="flex items-center space-x-2">
                    {/* *** NEW IMAGE TOOL BUTTON AND DIALOG *** */}
                    <ImageToolDialog onApply={handleApplyImage} />
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                          <Eye className="h-3 w-3 mr-1" />
                          Preview
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl bg-card border-border shadow-large">
                        <DialogHeader>
                          <DialogTitle>Description Preview</DialogTitle>
                        </DialogHeader>
                        <div
                          className="p-4 bg-muted/30 rounded-lg border border-border max-h-96 overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: formData.description }}
                        />
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                <Textarea
                  id="description"
                  placeholder="Enter ticket description (HTML supported)..."
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  className="min-h-[120px] bg-muted/30 border-border focus:bg-card transition-colors"
                  required
                  disabled={isProcessing}
                />
                <p className="text-xs text-muted-foreground">
                  HTML formatting is supported
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            {!isProcessing ? (
              <Button
                type="submit"
                variant="premium"
                size="lg"
                disabled={!formData.emails.trim() || !formData.subject.trim() || !formData.description.trim()}
                className="w-full"
              >
                <Send className="h-4 w-4 mr-2" />
                Create {emailCount} Tickets
              </Button>
            ) : (
              <div className="flex items-center justify-center space-x-4">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={onPauseResume}
                  className="flex-1"
                >
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Resume Job
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause Job
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  onClick={onEndJob}
                  className="flex-1"
                >
                  <Square className="h-4 w-4 mr-2" />
                  End Job
                </Button>
              </div>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
