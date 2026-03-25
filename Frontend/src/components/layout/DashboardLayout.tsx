import React, { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from './Sidebar';
import { Navbar } from './Navbar';
import { MobileSidebar } from './MobileSidebar';
import { cn } from '@/lib/utils';

export default function DashboardLayout() {
  const { isAuthenticated } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          isOpen={!isSidebarCollapsed}
          onClose={() => setIsSidebarCollapsed(true)}
        />
      </div>

      {/* Mobile Sidebar */}
      <MobileSidebar
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      {/* Navbar */}
      <Navbar
        onMenuClick={() => setIsMobileSidebarOpen(true)}
        isSidebarCollapsed={isSidebarCollapsed}
      />

      {/* Main Content */}
      <main
        className={cn(
          'pt-16 min-h-screen transition-all duration-300',
          'lg:ml-64',
          isSidebarCollapsed && 'lg:ml-[72px]'
        )}
      >
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
