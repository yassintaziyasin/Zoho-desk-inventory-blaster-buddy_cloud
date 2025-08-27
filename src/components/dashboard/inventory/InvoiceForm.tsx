import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Send, Mail, MessageSquare, Users, Clock, FileText, Edit, RefreshCw, Pause, Play, Square, CheckCircle2, XCircle, ImagePlus, Eye } from 'lucide-react';
import { InvoiceFormData, InvoiceJobState } from '@/App';
import { formatTime } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


interface InvoiceFormProps {
  onSubmit: () => void;
  isProcessing: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
  onEndJob: () => void;
  formData: InvoiceFormData;
  onFormDataChange: (data: InvoiceFormData) => void;
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  onUpdateName: () => void;
  isLoadingName: boolean;
  onRefreshName: () => void;
  jobState: InvoiceJobState | null;
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


export const InvoiceForm: React.FC<InvoiceFormProps> = ({ 
  onSubmit, 
  isProcessing,
  isPaused,
  onPauseResume,
  onEndJob,
  formData,
  onFormDataChange,
  displayName,
  onDisplayNameChange,
  onUpdateName,
  isLoadingName,
  onRefreshName,
  jobState
}) => {

  const emailCount = formData.emails
    .split('\n')
    .filter(email => email.trim() !== '').length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const handleInputChange = (field: keyof Omit<InvoiceFormData, 'sendCustomEmail' | 'sendDefaultEmail'>, value: string | number) => {
    onFormDataChange({ ...formData, [field]: value });
  };

  const handleCheckboxChange = (field: 'sendCustomEmail' | 'sendDefaultEmail', checked: boolean) => {
    onFormDataChange({ ...formData, [field]: checked });
  }
  
  const successCount = jobState?.results.filter(r => r.success).length || 0;
  const errorCount = jobState?.results.filter(r => r.success === false).length || 0;
  const handleApplyImage = (html: string) => {
    onFormDataChange({ ...formData, body: formData.body + '\n' + html });
  };
  return (
    <Card className="shadow-medium hover:shadow-large transition-all duration-300">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Create Bulk Invoices</CardTitle>
        </div>
        <CardDescription>
          Send the same invoice email to multiple recipients.
        </CardDescription>
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
                  <Badge variant="secondary" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    {emailCount} recipients
                  </Badge>
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
                  Enter one email address per line. A new contact will be created for each email if it doesn't already exist.
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
                        value={displayName}
                        onChange={(e) => onDisplayNameChange(e.target.value)}
                        placeholder={isLoadingName ? "Loading..." : "Not configured for this profile"}
                        disabled={isLoadingName}
                    />
                    <Button 
                        type="button"
                        size="sm" 
                        onClick={onUpdateName} 
                        disabled={isLoadingName || displayName === 'N/A'}
                    >
                        Update
                    </Button>
                    <Button 
                        type="button"
                        size="icon" 
                        variant="ghost" 
                        onClick={onRefreshName} 
                        disabled={isLoadingName}
                    >
                        <RefreshCw className={`h-4 w-4 ${isLoadingName ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject" className="flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4" />
                  <span>Email Subject</span>
                </Label>
                <Input
                  id="subject"
                  placeholder="Enter the subject for the invoice email..."
                  value={formData.subject}
                  onChange={(e) => handleInputChange('subject', e.target.value)}
                  className="h-12 bg-muted/30 border-border focus:bg-card transition-colors"
                  required
                  disabled={isProcessing}
                />
              </div>
              <div className="space-y-2">
              <div className="flex items-center justify-between">
                  <Label htmlFor="body" className="flex items-center space-x-2">
                    <MessageSquare className="h-4 w-4" />
                    <span>Email Body</span>
                  </Label>
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
                        </DialogHeader>
                        <div
                          className="p-4 bg-muted/30 rounded-lg border border-border max-h-96 overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: formData.body }}
                        />
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                <Textarea
                  id="body"
                  placeholder="Enter the body for the invoice email (HTML supported)..."
                  value={formData.body}
                  onChange={(e) => handleInputChange('body', e.target.value)}
                  className="min-h-[120px] bg-muted/30 border-border focus:bg-card transition-colors"
                  required
                  disabled={isProcessing}
                />
              </div>
               <div className="space-y-2">
                <Label htmlFor="delay" className="flex items-center space-x-2">
                  <Clock className="h-4 w-4" />
                  <span>Delay Between Invoices</span>
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
                  <Mail className="h-4 w-4" />
                  <span>Email Options</span>
                </Label>
                <div className="space-y-3 rounded-lg bg-muted/30 p-4 border border-border">
                  <div className="flex items-start space-x-3">
                      <Checkbox
                          id="sendCustomEmail"
                          checked={formData.sendCustomEmail}
                          onCheckedChange={(checked) => handleCheckboxChange('sendCustomEmail', !!checked)}
                          disabled={isProcessing || formData.sendDefaultEmail}
                      />
                      <div className="grid gap-1.5 leading-none">
                          <Label htmlFor="sendCustomEmail" className="font-medium hover:cursor-pointer">Send Custom Email</Label>
                          <p className="text-xs text-muted-foreground">Use the subject and body from this form to send the email.</p>
                      </div>
                  </div>
                   <div className="flex items-start space-x-3">
                      <Checkbox
                          id="sendDefaultEmail"
                          checked={formData.sendDefaultEmail}
                          onCheckedChange={(checked) => handleCheckboxChange('sendDefaultEmail', !!checked)}
                          disabled={isProcessing || formData.sendCustomEmail}
                      />
                      <div className="grid gap-1.5 leading-none">
                          <Label htmlFor="sendDefaultEmail" className="font-medium hover:cursor-pointer">Send Default Zoho Email</Label>
                          <p className="text-xs text-muted-foreground">Use Zoho's default email template for the invoice.</p>
                      </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
              {!isProcessing ? (
                <Button
                    type="submit"
                    variant="premium"
                    size="lg"
                    disabled={!formData.emails.trim() || !formData.subject.trim() || !formData.body.trim()}
                    className="w-full"
                >
                    <Send className="h-4 w-4 mr-2" />
                    Create & Send {emailCount} Invoices
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
                            <><Play className="h-4 w-4 mr-2" />Resume Job</>
                        ) : (
                            <><Pause className="h-4 w-4 mr-2" />Pause Job</>
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