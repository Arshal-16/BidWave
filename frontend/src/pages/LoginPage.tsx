import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Waves, Lock, Mail, AlertCircle, Sparkles } from 'lucide-react';
import { Role } from '../types';

export const LoginPage: React.FC = () => {
  const { login, loginAsDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (role: Role) => {
    setIsLoading(true);
    setError(null);
    try {
      await loginAsDemo(role);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to sign in with demo account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4 space-y-8">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 mx-auto shadow-lg shadow-amber-500/25">
          <Waves className="w-7 h-7 stroke-[2.5]" />
        </div>
        <h1 className="text-3xl font-extrabold text-slate-100">Welcome Back</h1>
        <p className="text-xs text-slate-400">
          Sign in to place sub-second live bids or manage listings
        </p>
      </div>

      {/* 1-Click Demo Accounts */}
      <div className="glass-panel rounded-2xl p-4 border border-slate-700/60 space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Quick 1-Click Demo Sign In:</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleDemoLogin('SELLER')}
            className="p-2 rounded-xl bg-slate-900 hover:bg-amber-500/20 hover:border-amber-500/50 border border-slate-800 text-xs font-medium text-slate-200 transition-all text-center"
          >
            <span className="block font-bold text-amber-400">Seller</span>
            <span className="text-[10px] text-slate-500">seller@...</span>
          </button>

          <button
            type="button"
            onClick={() => handleDemoLogin('BIDDER')}
            className="p-2 rounded-xl bg-slate-900 hover:bg-amber-500/20 hover:border-amber-500/50 border border-slate-800 text-xs font-medium text-slate-200 transition-all text-center"
          >
            <span className="block font-bold text-amber-400">Bidder 1</span>
            <span className="text-[10px] text-slate-500">bidder1@...</span>
          </button>

          <button
            type="button"
            onClick={() => handleDemoLogin('ADMIN')}
            className="p-2 rounded-xl bg-slate-900 hover:bg-amber-500/20 hover:border-amber-500/50 border border-slate-800 text-xs font-medium text-slate-200 transition-all text-center"
          >
            <span className="block font-bold text-amber-400">Admin</span>
            <span className="text-[10px] text-slate-500">admin@...</span>
          </button>
        </div>
      </div>

      {/* Main Login Form */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-2xl space-y-6">
        {error && (
          <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            required
            placeholder="you@example.com"
            leftIcon={<Mail className="w-4 h-4" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Input
            label="Password"
            type="password"
            required
            placeholder="••••••••"
            leftIcon={<Lock className="w-4 h-4" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button type="submit" size="lg" className="w-full mt-2" isLoading={isLoading}>
            Sign In
          </Button>
        </form>

        <div className="text-center pt-2">
          <p className="text-xs text-slate-400">
            Don't have an account yet?{' '}
            <Link to="/register" className="text-amber-400 font-semibold hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
