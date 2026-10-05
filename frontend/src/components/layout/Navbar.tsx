import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSocket } from '../../realtime/SocketProvider';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  Waves,
  Gavel,
  LayoutDashboard,
  LogOut,
  User as UserIcon,
  Shield,
  Zap,
  Menu,
  X,
} from 'lucide-react';

export const Navbar: React.FC<{ onOpenCreateModal?: () => void }> = ({ onOpenCreateModal }) => {
  const { user, logout, loginAsDemo } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/25 group-hover:scale-105 transition-transform">
              <Waves className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-slate-100 via-amber-200 to-amber-500 bg-clip-text text-transparent">
                BidWave
              </span>
              <span className="hidden sm:block text-[10px] uppercase font-mono tracking-widest text-slate-400 font-bold -mt-1">
                Live Auctions
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              to="/"
              className="text-sm font-medium text-slate-300 hover:text-amber-400 transition-colors"
            >
              Explore Live
            </Link>

            {user && (user.role === 'SELLER' || user.role === 'ADMIN') && (
              <Link
                to="/dashboard"
                className="text-sm font-medium text-slate-300 hover:text-amber-400 transition-colors flex items-center gap-1.5"
              >
                <LayoutDashboard className="w-4 h-4 text-amber-500" />
                Seller Portal
              </Link>
            )}

            {user && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400 font-mono">
                <span
                  className={`w-2 h-2 rounded-full ${
                    connected ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-amber-400 animate-pulse'
                  }`}
                />
                <span>{connected ? 'WS Connected' : 'Connecting...'}</span>
              </div>
            )}
          </nav>

          {/* User Controls & Actions */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                {onOpenCreateModal && (user.role === 'SELLER' || user.role === 'ADMIN') && (
                  <Button size="sm" onClick={onOpenCreateModal} className="text-xs">
                    <Gavel className="w-3.5 h-3.5 mr-1" />
                    Create Auction
                  </Button>
                )}

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
                  <UserIcon className="w-4 h-4 text-amber-500" />
                  <div className="text-left">
                    <span className="text-xs font-semibold text-slate-200 block max-w-[120px] truncate">
                      {user.email}
                    </span>
                    <span className="text-[10px] text-amber-400 font-mono block uppercase">
                      {user.role}
                    </span>
                  </div>
                </div>

                <Button variant="ghost" size="sm" onClick={handleLogout} title="Log Out">
                  <LogOut className="w-4 h-4 text-slate-400 hover:text-red-400" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {/* 1-Click Demo Logins for Pair Programming Testing */}
                <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
                  <span className="text-[10px] text-slate-400 px-1 font-mono uppercase">Demo:</span>
                  <button
                    onClick={() => loginAsDemo('SELLER')}
                    className="px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-amber-400 transition-colors text-[11px] font-semibold"
                  >
                    Seller
                  </button>
                  <button
                    onClick={() => loginAsDemo('BIDDER')}
                    className="px-2 py-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-amber-400 transition-colors text-[11px] font-semibold"
                  >
                    Bidder 1
                  </button>
                </div>

                <Link to="/login">
                  <Button variant="outline" size="sm">
                    Log In
                  </Button>
                </Link>
                <Link to="/register">
                  <Button size="sm">Sign Up</Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-slate-900 text-slate-300 border border-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-800 bg-slate-950 p-4 space-y-3">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-sm font-medium text-slate-300 hover:text-amber-400 py-1"
          >
            Explore Live Auctions
          </Link>
          {user && (user.role === 'SELLER' || user.role === 'ADMIN') && (
            <Link
              to="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-300 hover:text-amber-400 py-1"
            >
              Seller Portal
            </Link>
          )}

          <div className="pt-3 border-t border-slate-800 flex flex-col gap-2">
            {user ? (
              <>
                <div className="text-xs text-slate-400 font-mono">
                  Signed in as <strong className="text-amber-400">{user.email}</strong> ({user.role})
                </div>
                <Button variant="danger" size="sm" onClick={handleLogout}>
                  Log Out
                </Button>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full">
                    Log In
                  </Button>
                </Link>
                <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full">Sign Up</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
