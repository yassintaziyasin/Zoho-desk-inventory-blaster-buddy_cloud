import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Profile } from '@/App';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

interface ProfileSelectorProps {
  selectedProfileName: string;
  onProfileChange: (profileName: string) => void;
  disabled?: boolean;
}

const ProfileSelector: React.FC<ProfileSelectorProps> = ({ selectedProfileName, onProfileChange, disabled }) => {
    const { data: profiles, isLoading, error } = useQuery<Profile[]>({
        queryKey: ['profiles'],
        queryFn: async () => {
            const response = await fetch(`${SERVER_URL}/api/profiles`);
            if (!response.ok) throw new Error('Failed to fetch profiles');
            return response.json();
        }
    });

    if (isLoading) {
        return <Skeleton className="h-10 w-full" />;
    }

    if (error) {
        return <div className="text-red-500 text-sm">Error loading profiles.</div>;
    }

    return (
        <Select onValueChange={onProfileChange} value={selectedProfileName} disabled={disabled || !profiles || profiles.length === 0}>
            <SelectTrigger>
                <SelectValue placeholder="Select a profile..." />
            </SelectTrigger>
            <SelectContent>
                {profiles && profiles.length > 0 ? (
                    profiles.map(profile => (
                        <SelectItem key={profile.profileName} value={profile.profileName}>
                            {profile.profileName}
                        </SelectItem>
                    ))
                ) : (
                    <div className="p-2 text-sm text-muted-foreground">No profiles found.</div>
                )}
            </SelectContent>
        </Select>
    );
};

export default ProfileSelector;
