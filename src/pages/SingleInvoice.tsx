import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send } from 'lucide-react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import ProfileSelector from '@/components/dashboard/ProfileSelector';
import { Profile } from '@/App';
import { toast as sonner } from "sonner";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

interface SingleInvoiceProps {
    onAddProfile: () => void;
    onEditProfile: (profile: Profile) => void;
}

const SingleInvoice: React.FC<SingleInvoiceProps> = ({ onAddProfile, onEditProfile }) => {
    const [selectedProfileName, setSelectedProfileName] = useState('');
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [sendCustomEmail, setSendCustomEmail] = useState(true);
    const [sendDefaultEmail, setSendDefaultEmail] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProfileName) {
            toast({ title: 'Error', description: 'Please select a profile.', variant: 'destructive' });
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch(`${SERVER_URL}/api/invoices/single`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, subject, body, selectedProfileName, sendCustomEmail, sendDefaultEmail }),
            });
            const result = await response.json();
            if (result.success) {
                sonner.success("Invoice Sent!", {
                    description: result.message,
                    action: {
                        label: "Details",
                        onClick: () => console.log("Full Response:", result.fullResponse),
                    },
                });
            } else {
                sonner.error("Failed to Send Invoice", {
                    description: result.error,
                    action: {
                        label: "Details",
                        onClick: () => console.error("Full Error Response:", result.fullResponse),
                    },
                });
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to send invoice.', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <DashboardLayout
            title="Single Invoice"
            description="Create and send a single Zoho Inventory invoice."
            onAddProfile={onAddProfile}
            onEditProfile={onEditProfile}
        >
            <div className="p-4 sm:p-6 lg:p-8">
                <Card className="max-w-2xl mx-auto">
                    <form onSubmit={handleSubmit}>
                        <CardHeader>
                            <CardTitle>Create Single Invoice</CardTitle>
                            <CardDescription>Fill in the details below to generate an invoice for a contact.</CardDescription>
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
                                <Label htmlFor="subject">Email Subject</Label>
                                <Input id="subject" placeholder="Your Invoice from Our Company" value={subject} onChange={e => setSubject(e.target.value)} required disabled={isLoading} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="body">Email Body</Label>
                                <Textarea id="body" placeholder="Hi there, here is your invoice..." value={body} onChange={e => setBody(e.target.value)} required className="min-h-[120px]" disabled={isLoading} />
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="sendCustomEmail" checked={sendCustomEmail} onCheckedChange={(checked) => setSendCustomEmail(!!checked)} disabled={isLoading || sendDefaultEmail} />
                                    <Label htmlFor="sendCustomEmail">Send Custom Email via API</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="sendDefaultEmail" checked={sendDefaultEmail} onCheckedChange={(checked) => {
                                        setSendDefaultEmail(!!checked);
                                        if (checked) setSendCustomEmail(false);
                                    }} disabled={isLoading} />
                                    <Label htmlFor="sendDefaultEmail">Send via Zoho's Default Email Template</Label>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={isLoading} className="w-full">
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                {isLoading ? 'Sending...' : 'Create & Send Invoice'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </DashboardLayout>
    );
};

export default SingleInvoice;
