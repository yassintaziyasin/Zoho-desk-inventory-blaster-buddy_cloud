import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import ProfileSelector from '@/components/dashboard/ProfileSelector';
import { Profile } from '@/App';
import { toast as sonner } from "sonner";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

interface SingleTicketProps {
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
}

const SingleTicket: React.FC<SingleTicketProps> = ({ onAddProfile, onEditProfile }) => {
    const [selectedProfileName, setSelectedProfileName] = useState('');
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [sendDirectReply, setSendDirectReply] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationStatus, setVerificationStatus] = useState<'idle' | 'success' | 'failed' | 'unknown'>('idle');
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProfileName) {
            toast({ title: 'Error', description: 'Please select a profile.', variant: 'destructive' });
            return;
        }
        setIsLoading(true);
        setVerificationStatus('idle');
        try {
            const response = await fetch(`${SERVER_URL}/api/tickets/single`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, subject, description, selectedProfileName, sendDirectReply }),
            });
            const result = await response.json();
            if (result.success) {
                sonner.success("Ticket Created!", {
                    description: result.message,
                    action: {
                        label: "Details",
                        onClick: () => console.log("Full Response:", result.fullResponse),
                    },
                });
                handleVerify(result.fullResponse.ticketCreate);
            } else {
                sonner.error("Failed to Create Ticket", {
                    description: result.error,
                    action: {
                        label: "Details",
                        onClick: () => console.error("Full Error Response:", result.fullResponse),
                    },
                });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to send ticket.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerify = async (ticket: any) => {
        if (!ticket || !selectedProfileName) return;
        setIsVerifying(true);
        try {
            const response = await fetch(`${SERVER_URL}/api/tickets/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticket, profileName: selectedProfileName }),
            });
            const result = await response.json();
            if (result.success) {
                setVerificationStatus('success');
            } else {
                setVerificationStatus(result.details.includes('Failed') ? 'failed' : 'unknown');
            }
        } catch (error) {
            setVerificationStatus('unknown');
        } finally {
            setIsVerifying(false);
        }
    };

    const VerificationIcon = () => {
        switch (verificationStatus) {
            case 'success': return <CheckCircle className="h-5 w-5 text-green-500" />;
            case 'failed': return <XCircle className="h-5 w-5 text-red-500" />;
            case 'unknown': return <HelpCircle className="h-5 w-5 text-yellow-500" />;
            default: return null;
        }
    };

    return (
        <DashboardLayout
            title="Single Ticket"
            description="Create a single Zoho Desk ticket for a specific recipient."
            onAddProfile={onAddProfile}
            onEditProfile={onEditProfile}
        >
            <div className="p-4 sm:p-6 lg:p-8">
                <Card className="max-w-2xl mx-auto">
                    <form onSubmit={handleSubmit}>
                        <CardHeader>
                            <CardTitle>Create Single Ticket</CardTitle>
                            <CardDescription>Fill in the details below to generate a ticket.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="profile">Zoho Profile</Label>
                                <ProfileSelector selectedProfileName={selectedProfileName} onProfileChange={setSelectedProfileName} disabled={isLoading} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Recipient Email</Label>
                                <Input id="email" type="email" placeholder="customer@example.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={isLoading} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="subject">Subject</Label>
                                <Input id="subject" placeholder="Regarding your recent inquiry" value={subject} onChange={e => setSubject(e.target.value)} required disabled={isLoading} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea id="description" placeholder="Detailed description of the issue or message..." value={description} onChange={e => setDescription(e.target.value)} required className="min-h-[120px]" disabled={isLoading} />
                            </div>
                            <div className="flex items-center space-x-2">
                                <Checkbox id="sendDirectReply" checked={sendDirectReply} onCheckedChange={(checked) => setSendDirectReply(!!checked)} disabled={isLoading} />
                                <Label htmlFor="sendDirectReply">Send as Direct Reply (Bypasses Email Templates)</Label>
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                {isVerifying && <Loader2 className="h-5 w-5 animate-spin" />}
                                {!isVerifying && <VerificationIcon />}
                                <span className="text-sm text-muted-foreground">
                                    {isVerifying ? 'Verifying email...' : verificationStatus !== 'idle' ? `Email ${verificationStatus}` : ''}
                                </span>
                            </div>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                {isLoading ? 'Sending...' : 'Create Ticket'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </DashboardLayout>
    );
};

export default SingleTicket;
