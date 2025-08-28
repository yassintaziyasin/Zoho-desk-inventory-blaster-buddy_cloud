import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { ProfileSelector } from '@/components/dashboard/ProfileSelector';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Send, Mail, MessageSquare, FileText, Loader2, ImagePlus, Eye } from 'lucide-react';
import { Profile } from '@/App';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

type ApiStatus = {
  status: 'loading' | 'success' | 'error';
  message: string;
  fullResponse?: any;
};

interface SingleInvoiceProps {
  onAddProfile: () => void;
  onEditProfile: (profile: Profile) => void;
  onDeleteProfile: (profileName: string) => void;
}

const SERVER_URL = "http://localhost:3000";
let socket: Socket;

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
                    <DialogDescription>
                        Paste an image URL and adjust the styling. The generated HTML will be inserted into the description.
                    </DialogDescription>
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


const SingleInvoice: React.FC<SingleInvoiceProps> = ({ onAddProfile, onEditProfile, onDeleteProfile }) => {
  const { toast } = useToast();
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({ status: 'loading', message: 'Connecting to server...' });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sendCustomEmail, setSendCustomEmail] = useState(true);
  const [sendDefaultEmail, setSendDefaultEmail] = useState(false);
  
  // Response state
  const [result, setResult] = useState<any>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const response = await fetch(`${SERVER_URL}/api/profiles`);
      if (!response.ok) throw new Error('Could not connect to the server.');
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  const inventoryProfiles = profiles.filter(p => p.inventory?.orgId);
  const selectedProfile = inventoryProfiles.find(p => p.profileName === activeProfileName) || null;

  useEffect(() => {
    if (inventoryProfiles.length > 0 && !activeProfileName) {
      setActiveProfileName(inventoryProfiles[0].profileName);
    }
  }, [inventoryProfiles, activeProfileName]);

  useEffect(() => {
    socket = io(SERVER_URL);

    socket.on('connect', () => toast({ title: "Connected to server!" }));
    socket.on('apiStatusResult', (result) => setApiStatus({
      status: result.success ? 'success' : 'error',
      message: result.message,
      fullResponse: result.fullResponse || null
    }));
    
    socket.on('singleInvoiceResult', (data) => {
        setIsProcessing(false);
        setResult(data);
        setIsResultModalOpen(true);
        toast({
            title: data.success ? "Invoice Sent Successfully" : "Invoice Creation Failed",
            description: data.message || data.error,
            variant: data.success ? "default" : "destructive",
        });
    });

    return () => {
      socket.disconnect();
    };
  }, [toast]);
  
  useEffect(() => {
    if (activeProfileName && socket?.connected) {
      setApiStatus({ status: 'loading', message: 'Checking API connection...' });
      socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'inventory' });
    }
  }, [activeProfileName, socket?.connected]);
  
  const handleProfileChange = (profileName: string) => {
    setActiveProfileName(profileName);
    toast({ title: "Profile Changed", description: `Switched to ${profileName}` });
  };
  
  const handleManualVerify = () => {
    if (!activeProfileName) return;
    setApiStatus({ status: 'loading', message: 'Checking API connection...', fullResponse: null });
    if (socket && socket.connected) {
      socket.emit('checkApiStatus', { selectedProfileName: activeProfileName, service: 'inventory' });
    }
    toast({ title: "Re-checking Connection..." });
  };

const handleCreateInvoice = async () => {
    if (!activeProfileName || !email || !subject || !body) {
      toast({ title: "Missing Information", description: "Please fill out all fields.", variant: "destructive" });
      return;
    }
    
    setIsProcessing(true);
    setResult(null);
    toast({ title: "Creating Invoice...", description: "This may take a few moments." });
    
    try {
      const response = await fetch(`${SERVER_URL}/api/invoices/single`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          subject,
          body,
          selectedProfileName: activeProfileName,
          sendCustomEmail,
          sendDefaultEmail,
        }),
      });

      const data = await response.json();

      // This is the logic that was previously in the socket listener
      setResult(data);
      setIsResultModalOpen(true);
      toast({
          title: data.success ? "Invoice Sent Successfully" : "Invoice Creation Failed",
          description: data.message || data.error,
          variant: data.success ? "default" : "destructive",
      });

    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : "An unknown network error occurred.";
      setResult({ success: false, error: errorMessage });
      setIsResultModalOpen(true);
      toast({ title: "Network Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };


//------------
const handleApplyImage = (html: string) => {
  setBody(prev => prev + '\n' + html);
};
  return (
    <>
      <DashboardLayout onAddProfile={onAddProfile}>
        <div className="space-y-8">
          <ProfileSelector
            profiles={inventoryProfiles}
            selectedProfile={selectedProfile}
            jobs={{}}
            onProfileChange={handleProfileChange}
            apiStatus={apiStatus}
            onShowStatus={() => setIsStatusModalOpen(true)}
            onManualVerify={handleManualVerify}
            socket={socket}
            onEditProfile={onEditProfile}
            onDeleteProfile={onDeleteProfile}
          />

          <Card className="shadow-medium hover:shadow-large transition-all duration-300">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-primary" />
                <span>Create a Single Invoice</span>
              </CardTitle>
              <CardDescription>Fill in the details below to create one invoice in Zoho Inventory.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center space-x-2"><Mail className="h-4 w-4" /><span>Recipient Email</span></Label>
                    <Input id="email" type="email" placeholder="recipient@example.com" value={email} onChange={e => setEmail(e.target.value)} disabled={isProcessing} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject" className="flex items-center space-x-2"><MessageSquare className="h-4 w-4" /><span>Email Subject</span></Label>
                    <Input id="subject" placeholder="Enter email subject..." value={subject} onChange={e => setSubject(e.target.value)} disabled={isProcessing} />
                  </div>
                </div>
                <div className="space-y-4 flex flex-col">
                  <div className="space-y-2 flex-grow flex flex-col">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="body" className="flex items-center space-x-2"><MessageSquare className="h-4 w-4" /><span>Email Body</span></Label>
                    <div className="flex items-center space-x-2">
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
                              <DialogTitle>Body Preview</DialogTitle>
                              <DialogDescription>
                                This is a preview of how the HTML body will be rendered.
                              </DialogDescription>
                            </DialogHeader>
                            <div
                              className="p-4 bg-muted/30 rounded-lg border border-border max-h-96 overflow-y-auto"
                              dangerouslySetInnerHTML={{ __html: body }}
                            />
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                    <Textarea id="body" placeholder="Enter email body (HTML supported)..." className="flex-grow" value={body} onChange={e => setBody(e.target.value)} disabled={isProcessing} />
                  </div>
                </div>
              </div>
               <div className="space-y-2 pt-2">
                <Label className="flex items-center space-x-2">
                  <Mail className="h-4 w-4" />
                  <span>Email Options</span>
                </Label>
                <div className="space-y-3 rounded-lg bg-muted/30 p-4 border border-border">
                  <div className="flex items-start space-x-3">
                      <Checkbox
                          id="sendCustomEmail"
                          checked={sendCustomEmail}
                          onCheckedChange={(checked) => { setSendCustomEmail(!!checked); if(checked) setSendDefaultEmail(false); }}
                          disabled={isProcessing}
                      />
                      <div className="grid gap-1.5 leading-none">
                          <Label htmlFor="sendCustomEmail" className="font-medium hover:cursor-pointer">Send Custom Email</Label>
                          <p className="text-xs text-muted-foreground">Use the subject and body from this form to send the email.</p>
                      </div>
                  </div>
                   <div className="flex items-start space-x-3">
                      <Checkbox
                          id="sendDefaultEmail"
                          checked={sendDefaultEmail}
                          onCheckedChange={(checked) => { setSendDefaultEmail(!!checked); if(checked) setSendCustomEmail(false); }}
                          disabled={isProcessing}
                      />
                      <div className="grid gap-1.5 leading-none">
                          <Label htmlFor="sendDefaultEmail" className="font-medium hover:cursor-pointer">Send Default Zoho Email</Label>
                          <p className="text-xs text-muted-foreground">Use Zoho's default email template for the invoice.</p>
                      </div>
                  </div>
                </div>
              </div>
              <Button onClick={handleCreateInvoice} size="lg" className="w-full" disabled={isProcessing}>
                {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : <><Send className="mr-2 h-4 w-4" /> Create and Send Invoice</>}
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
      
      <Dialog open={isResultModalOpen} onOpenChange={setIsResultModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invoice Creation Result</DialogTitle>
            <DialogDescription>{result?.message || result?.error}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-[60vh] overflow-y-auto">
            <pre className="bg-muted p-4 rounded-lg text-xs font-mono text-foreground border">
              {JSON.stringify(result?.fullResponse, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SingleInvoice;
