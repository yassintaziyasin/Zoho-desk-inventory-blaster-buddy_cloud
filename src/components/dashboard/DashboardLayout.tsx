import React from 'react';
import { NavLink } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Ticket, UserPlus } from 'lucide-react';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

interface DashboardLayoutProps {
  children: React.ReactNode;
  stats?: {
    totalTickets: number;
    totalToProcess: number;
    isProcessing: boolean;
  };
  onAddProfile: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  stats = { totalTickets: 0, totalToProcess: 0, isProcessing: false },
  onAddProfile
}) => {
  const progressPercent = stats.totalToProcess > 0 ? (stats.totalTickets / stats.totalToProcess) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border shadow-soft sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-primary rounded-lg shadow-glow">
                <Ticket className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Zoho Blaster</h1>
                <p className="text-muted-foreground">Bulk Creation Tool</p>
              </div>
              <NavigationMenu>
                <NavigationMenuList className="space-x-2 ml-6">
                  <NavigationMenuItem>
                    <NavigationMenuTrigger>Zoho Desk</NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px] ">
                        <li>
                          <NavLink to="/" className={({ isActive }) => `nav-menu-link ${isActive ? "active" : ""}`}>
                            <div className="text-sm font-medium leading-none">Bulk Tickets</div>
                            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">Create multiple tickets simultaneously.</p>
                          </NavLink>
                        </li>
                        <li>
                          <NavLink to="/single-ticket" className={({ isActive }) => `nav-menu-link ${isActive ? "active" : ""}`}>
                            <div className="text-sm font-medium leading-none">Single Ticket</div>
                            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">Create a single support ticket.</p>
                          </NavLink>
                        </li>
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                  <NavigationMenuItem>
                    <NavigationMenuTrigger>Zoho Inventory</NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px] ">
                        <li>
                          <NavLink to="/bulk-invoices" className={({ isActive }) => `nav-menu-link ${isActive ? "active" : ""}`}>
                            <div className="text-sm font-medium leading-none">Bulk Invoices</div>
                            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">Create multiple invoices simultaneously.</p>
                          </NavLink>
                        </li>
                        <li>
                          <NavLink to="/single-invoice" className={({ isActive }) => `nav-menu-link ${isActive ? "active" : ""}`}>
                            <div className="text-sm font-medium leading-none">Single Invoice</div>
                            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">Create a single invoice.</p>
                          </NavLink>
                        </li>
                         <li>
                          <NavLink to="/email-statics" className={({ isActive }) => `nav-menu-link ${isActive ? "active" : ""}`}>
                            <div className="text-sm font-medium leading-none">Email Statics</div>
                            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">View invoice email statistics.</p>
                          </NavLink>
                        </li>
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                </NavigationMenuList>
              </NavigationMenu>
            </div>
            <Button variant="outline" size="sm" onClick={onAddProfile} className="ml-4">
              <UserPlus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </div>
        </div>

        {stats.isProcessing && stats.totalToProcess > 0 && (
          <Progress value={progressPercent} className="h-1 w-full rounded-none bg-muted/50" />
        )}
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
};