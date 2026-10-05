import React, { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { AuctionListPage } from './pages/AuctionListPage';
import { AuctionRoomPage } from './pages/AuctionRoomPage';
import { SellerDashboardPage } from './pages/SellerDashboardPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { CreateAuctionModal } from './pages/CreateAuctionModal';
import { useQueryClient } from '@tanstack/react-query';

export const App: React.FC = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleAuctionCreated = (auctionId: string) => {
    queryClient.invalidateQueries({ queryKey: ['auctions'] });
    queryClient.invalidateQueries({ queryKey: ['seller-auctions'] });
    navigate(`/auctions/${auctionId}`);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-950 text-slate-100">
      <div>
        <Navbar onOpenCreateModal={() => setIsCreateModalOpen(true)} />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <Routes>
            <Route
              path="/"
              element={<AuctionListPage onOpenCreateModal={() => setIsCreateModalOpen(true)} />}
            />
            <Route path="/auctions/:auctionId" element={<AuctionRoomPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={['SELLER', 'ADMIN']}>
                  <SellerDashboardPage onOpenCreateModal={() => setIsCreateModalOpen(true)} />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Routes>
        </main>
      </div>

      <Footer />

      <CreateAuctionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleAuctionCreated}
      />
    </div>
  );
};
