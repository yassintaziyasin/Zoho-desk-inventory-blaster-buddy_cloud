import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Profile } from '@/App';
import { Socket } from 'socket.io-client';
import { KeyRound } from 'lucide-react';

// This defines the server URL, which was missing from this file.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (profileData: Profile, originalProfileName?: string) => void;
    profile: Profile | null;
    socket: Socket | null;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, onSave, profile, socket }) => {
    const { toast } = useToast();
    const [formData, setFormData] = useState<Profile>({
        profileName: '',
        clientId: '',
        clientSecret: '',
        refreshToken: '',
        desk: { orgId: '', defaultDepartmentId: '', fromEmailAddress: '', mailReplyAddressId: '' },
        inventory: { orgId: '' }
    });

    useEffect(() => {
        if (profile) {
            setFormData({ ...profile });
        } else {
            setFormData({
                profileName: '',
                clientId: '',
                clientSecret: '',
                refreshToken: '',
                desk: { orgId: '', defaultDepartmentId: '', fromEmailAddress: '', mailReplyAddressId: '' },
                inventory: { orgId: '' }
            });
        }
    }, [profile, isOpen]);

    useEffect(() => {
        if (!socket) return;

        const handleToken = (data: { refreshToken: string }) => {
            setFormData(prev => ({ ...prev, refreshToken: data.refreshToken }));
            toast({ title: "Success!", description: "Refresh Token received." });
        };
        const handleError = (data: { error: string }) => {
            toast({ title: "Token Generation Failed", description: data.error, variant: "destructive" });
        };

        socket.on('zoho-refresh-token', handleToken);
        socket.on('zoho-refresh-token-error', handleError);

        return () => {
            socket.off('zoho-refresh-token', handleToken);
            socket.off('zoho-refresh-token-error', handleError);
        };
    }, [socket, toast]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name.startsWith('desk.')) {
            const deskField = name.split('.')[1];
            setFormData(prev => ({ ...prev, desk: { ...prev.desk, [deskField]: value } }));
        } else if (name.startsWith('inventory.')) {
            const invField = name.split('.')[1];
            setFormData(prev => ({ ...prev, inventory: { ...prev.inventory, [invField]: value } }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleGenerateToken = async () => {
        if (!formData.clientId || !formData.clientSecret) {
            toast({ title: "Missing Credentials", description: "Please enter both Client ID and Client Secret.", variant: "destructive" });
            return;
        }
        if (!socket || !socket.connected || !socket.id) {
            toast({ title: "Connection Error", description: "Not connected to the server. Please wait a moment or refresh.", variant: "destructive" });
            return;
        }

        // Added for debugging
        console.log("Generating token with Socket ID:", socket.id);

        try {
            const response = await fetch(`${SERVER_URL}/api/zoho/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: formData.clientId,
                    clientSecret: formData.clientSecret,
                    socketId: socket.id,
                }),
            });
            const data = await response.json();
            if (data.authUrl) {
                window.open(data.authUrl, '_blank', 'width=600,height=700');
            } else {
                throw new Error(data.error || "Failed to get authorization URL from server.");
            }
        } catch (error) {
            const errorMessage = (error instanceof Error) ? error.message : "Could not initiate token generation.";
            toast({ title: "Error", description: errorMessage, variant: "destructive" });
        }
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData, profile?.profileName);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{profile ? 'Edit Profile' : 'Add New Profile'}</DialogTitle>
                    <DialogDescription>
                        Enter the details for the Zoho profile. You can generate a refresh token after entering your credentials.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto px-2">
                    <div className="space-y-2">
                        <Label htmlFor="profileName">Profile Name</Label>
                        <Input id="profileName" name="profileName" value={formData.profileName} onChange={handleChange} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="clientId">Client ID</Label>
                        <Input id="clientId" name="clientId" value={formData.clientId} onChange={handleChange} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="clientSecret">Client Secret</Label>
                        <Input id="clientSecret" name="clientSecret" type="password" value={formData.clientSecret} onChange={handleChange} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="refreshToken">Refresh Token</Label>
                        <div className="flex items-center space-x-2">
                            <Input id="refreshToken" name="refreshToken" type="password" value={formData.refreshToken} onChange={handleChange} required />
                            <Button type="button" variant="outline" onClick={handleGenerateToken}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                Generate
                            </Button>
                        </div>
                    </div>
                    
                    <h4 className="text-lg font-semibold border-t pt-4 mt-4">Zoho Desk Details</h4>
                    <div className="space-y-2">
                        <Label htmlFor="deskOrgId">Desk Organization ID</Label>
                        <Input id="deskOrgId" name="desk.orgId" value={formData.desk?.orgId || ''} onChange={handleChange} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="defaultDepartmentId">Default Department ID</Label>
                        <Input id="defaultDepartmentId" name="desk.defaultDepartmentId" value={formData.desk?.defaultDepartmentId || ''} onChange={handleChange} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="fromEmailAddress">"From" Email Address (Optional)</Label>
                        <Input id="fromEmailAddress" name="desk.fromEmailAddress" value={formData.desk?.fromEmailAddress || ''} onChange={handleChange} placeholder="e.g., support@yourcompany.com" />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="mailReplyAddressId">Mail Reply Address ID (Optional)</Label>
                        <Input id="mailReplyAddressId" name="desk.mailReplyAddressId" value={formData.desk?.mailReplyAddressId || ''} onChange={handleChange} placeholder="Used for updating sender name" />
                    </div>

                    <h4 className="text-lg font-semibold border-t pt-4 mt-4">Zoho Inventory Details</h4>
                     <div className="space-y-2">
                        <Label htmlFor="inventoryOrgId">Inventory Organization ID</Label>
                        <Input id="inventoryOrgId" name="inventory.orgId" value={formData.inventory?.orgId || ''} onChange={handleChange} />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button type="submit">Save Profile</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
