import { type FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Activity, CloudSun, ShieldCheck, Sprout, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch } from './lib/api';
import { getPendingCount, syncPendingOperations } from './offline/db';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'FARMER';
  status: string;
};

type DashboardData = {
  metrics: { totalCrops: number; totalLivestock: number; activeTasks: number; totalExpenses: number; totalIncome: number; estimatedProfit: number };
  recentActivities: Array<{ id: string; title: string; description?: string; activityDate?: string }>; 
  farms: Array<{ id: string; name: string; location: string }>;
  formattedProfit?: string;
};

type WeatherData = {
  location: string;
  temperature: number;
  humidity: number;
  rainfall: number;
  description: string;
  stale: boolean;
  source: string;
  updatedAt: string;
};

type AdminStats = {
  stats: {
    totalFarmers: number;
    activeFarmers: number;
    inactiveFarmers: number;
    totalFarms: number;
    totalCrops: number;
    totalLivestock: number;
    totalActivities: number;
    totalExpenses: number;
    totalIncome: number;
    totalProfit: number;
    pendingTasks: number;
  };
};

const formatKES = (value: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 2 }).format(value);

const statusColors = ['#2d7d46', '#67a56c', '#ef4444', '#f59e0b'];

async function handleLogout(setUser: (user: User | null) => void, redirectTo: string) {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    console.warn('Logout request failed:', error);
  }

  setUser(null);
  window.location.assign(redirectTo);
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const hasSessionCookie = typeof document !== 'undefined' && document.cookie.split('; ').some((cookie) => cookie.startsWith('sfms.sid='));

    if (!hasSessionCookie) {
      setUser(null);
      setLoadingUser(false);
      return;
    }

    apiFetch<{ user?: User }>('/api/auth/me')
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoadingUser(false));
  }, []);

  if (loadingUser) {
    return <div className="flex min-h-screen items-center justify-center text-lg text-slate-600">Loading Smart Farmer…</div>;
  }

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to={user.role === 'ADMIN' ? '/admin' : '/dashboard'} replace /> : <LandingPage />} />
      <Route path="/login" element={user ? <Navigate to={user.role === 'ADMIN' ? '/admin' : '/dashboard'} replace /> : <LoginPage setUser={setUser} />} />
      <Route path="/admin-login" element={user ? <Navigate to={user.role === 'ADMIN' ? '/admin' : '/dashboard'} replace /> : <AdminLoginPage setUser={setUser} />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <RegisterPage setUser={setUser} />} />
      <Route path="/dashboard" element={user && user.role === 'FARMER' ? <FarmerDashboard user={user} setUser={setUser} /> : <Navigate to="/login" replace />} />
      <Route path="/admin" element={user && user.role === 'ADMIN' ? <AdminDashboard user={user} setUser={setUser} /> : <Navigate to="/admin-login" replace />} />
    </Routes>
  );
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-white px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-700 text-white shadow-md">
              <Sprout className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold text-green-900">Smart Farmer</p>
              <p className="text-xs text-slate-500">Management System</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link to="/login" className="btn-secondary">Farmer Login</Link>
            <Link to="/admin-login" className="btn-primary">Admin Login</Link>
          </div>
        </header>

        <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">Kenya farming operations</span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 md:text-6xl">
              Digitize your farm, track every harvest, and manage growth with confidence.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Monitor crops, livestock, tasks, expenses, income, weather, and profit from a single responsive dashboard built for real farm planning.
            </p>
            <div className="mt-8 flex gap-4">
              <Link to="/register" className="btn-primary">Create Farmer Account</Link>
              <Link to="/login" className="btn-secondary">View Demo Dashboard</Link>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                ['200+', 'Farmers'],
                ['12', 'Farm plots'],
                ['76%', 'Task completion'],
                ['KES 1.4M', 'Income tracked'],
              ].map(([value, label]) => (
                <div key={label} className="card border-green-100 bg-white/80">
                  <p className="text-2xl font-bold text-green-900">{value}</p>
                  <p className="text-sm text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="card space-y-4 bg-white/90 p-6">
            <h2 className="text-2xl font-bold text-slate-900">Core tools</h2>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex items-center gap-3"><Sprout className="h-4 w-4 text-green-700" /> Crop planning and harvesting records</li>
              <li className="flex items-center gap-3"><Activity className="h-4 w-4 text-green-700" /> Activity and task tracking</li>
              <li className="flex items-center gap-3"><Wallet className="h-4 w-4 text-green-700" /> Expense and income management</li>
              <li className="flex items-center gap-3"><CloudSun className="h-4 w-4 text-green-700" /> Weather and agronomic information</li>
            </ul>
            <div className="rounded-2xl bg-green-50 p-4">
              <p className="text-sm text-slate-500">Current status</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-2xl font-bold text-green-900">Online</span>
                <span className="rounded-full bg-green-200 px-2 py-1 text-xs font-medium text-green-900">Sync ready</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function LoginPage({ setUser }: { setUser: (user: User | null) => void }) {
  const navigate = useNavigate();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    };

    try {
      const response = await apiFetch<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUser(response.user);
      navigate('/dashboard');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Login failed');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-700 text-white">
            <Sprout className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Farmer login</h2>
            <p className="text-sm text-slate-500">Access your farm dashboard</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input name="email" type="email" required className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none ring-0 focus:border-green-600" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input name="password" type="password" minLength={8} required className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none ring-0 focus:border-green-600" />
          </div>
          <button className="btn-primary w-full" type="submit">Login to dashboard</button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <Link to="/register">Create account</Link>
          <Link to="/admin-login">Admin login</Link>
        </div>
      </div>
    </div>
  );
}

function AdminLoginPage({ setUser }: { setUser: (user: User | null) => void }) {
  const navigate = useNavigate();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    };

    try {
      const response = await apiFetch<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUser(response.user);
      navigate('/admin');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Admin login failed');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Administrator login</h2>
            <p className="text-sm text-slate-500">Secure management access</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Admin email</label>
            <input name="email" type="email" required className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-slate-700" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input name="password" type="password" minLength={8} required className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-slate-700" />
          </div>
          <button className="btn-primary w-full" type="submit">Access admin console</button>
        </form>
      </div>
    </div>
  );
}

function RegisterPage({ setUser }: { setUser: (user: User | null) => void }) {
  const navigate = useNavigate();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      location: String(form.get('location') ?? ''),
      phone: String(form.get('phone') ?? ''),
    };

    try {
      const response = await apiFetch<{ user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUser(response.user);
      navigate('/dashboard');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Registration failed');
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center bg-slate-50 px-4 py-8">
      <div className="card w-full p-6">
        <h2 className="mb-6 text-2xl font-bold text-slate-900">Create your farmer account</h2>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <input name="name" placeholder="Full name" required className="rounded-xl border border-slate-200 p-3 md:col-span-2" />
          <input name="email" type="email" placeholder="Email" required className="rounded-xl border border-slate-200 p-3 md:col-span-2" />
          <input name="password" type="password" placeholder="Password" minLength={8} required className="rounded-xl border border-slate-200 p-3 md:col-span-2" />
          <input name="location" placeholder="Farm location" className="rounded-xl border border-slate-200 p-3" />
          <input name="phone" placeholder="Phone number" className="rounded-xl border border-slate-200 p-3" />
          <div className="md:col-span-2">
            <button className="btn-primary w-full" type="submit">Register and continue</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FarmerDashboard({ user, setUser }: { user: User; setUser: (user: User | null) => void }) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const refresh = async () => {
      try {
        const [farmStats, weatherData] = await Promise.all([
          apiFetch<DashboardData>('/api/farmer/dashboard'),
          apiFetch<WeatherData>('/api/weather'),
        ]);
        setDashboard(farmStats);
        setWeather(weatherData);
      } catch (error) {
        console.error('dashboard load error', error);
      }

      setPendingCount(await getPendingCount());
    };

    const syncQueue = async () => {
      if (!navigator.onLine) {
        setPendingCount(await getPendingCount());
        return;
      }

      try {
        await syncPendingOperations();
      } catch (error) {
        console.error('queue sync error', error);
      }

      setPendingCount(await getPendingCount());
    };

    refresh();
    void syncQueue();

    const handleStatus = () => {
      const nextOnline = navigator.onLine;
      setOnline(nextOnline);
      if (nextOnline) {
        void syncQueue();
      }
    };

    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, []);

  const chartData = [
    { name: 'Crops', value: dashboard?.metrics.totalCrops ?? 0 },
    { name: 'Livestock', value: dashboard?.metrics.totalLivestock ?? 0 },
    { name: 'Expenses', value: dashboard?.metrics.totalExpenses ?? 0 },
    { name: 'Income', value: dashboard?.metrics.totalIncome ?? 0 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-green-700">Farmer dashboard</p>
            <h1 className="text-3xl font-bold text-slate-900">Welcome back, {user.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${online ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {online ? 'Online' : 'Offline'}
            </span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">{pendingCount} queued syncs</span>
            <button className="btn-secondary" onClick={() => handleLogout(setUser, '/login')}>Logout</button>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            ['Total crops', dashboard?.metrics.totalCrops ?? 0],
            ['Total livestock', dashboard?.metrics.totalLivestock ?? 0],
            ['Active tasks', dashboard?.metrics.activeTasks ?? 0],
            ['Expenses', formatKES(dashboard?.metrics.totalExpenses ?? 0)],
            ['Estimated profit', formatKES(dashboard?.metrics.estimatedProfit ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="card">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="card p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Farm performance</h2>
              <span className="text-sm text-slate-500">KES</span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatKES(Number(value))} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#2d7d46" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Weather</h2>
              <CloudSun className="h-5 w-5 text-sky-500" />
            </div>
            {weather ? (
              <div className="space-y-3 text-sm text-slate-600">
                <p className="text-base font-semibold text-slate-900">{weather.location}</p>
                <p>{weather.description}</p>
                <p><strong>{weather.temperature}°C</strong> temperature</p>
                <p>Humidity: {weather.humidity}%</p>
                <p>Rainfall: {weather.rainfall} mm</p>
                <p className="text-xs text-slate-500">Updated: {new Date(weather.updatedAt).toLocaleString('en-KE')}</p>
                {weather.stale && <p className="rounded-lg bg-amber-50 p-2 text-amber-700">Potentially outdated data shown while offline.</p>}
              </div>
            ) : (
              <p className="text-slate-500">Weather data unavailable.</p>
            )}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="card p-4">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Recent activity</h2>
            <div className="space-y-3">
              {(dashboard?.recentActivities ?? []).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                  <div>
                    <p className="font-medium text-slate-800">{activity.title}</p>
                    <p className="text-sm text-slate-500">{activity.description ?? 'Farm activity logged'}</p>
                  </div>
                  <span className="text-xs text-slate-500">{activity.activityDate ? new Date(activity.activityDate).toLocaleDateString('en-KE') : 'N/A'}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Farm overview</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                    {chartData.map((_, index) => (
                      <Cell key={String(index)} fill={statusColors[index % statusColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatKES(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {dashboard?.farms?.map((farm) => (
                <li key={farm.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span>{farm.name}</span>
                  <span>{farm.location}</span>
                </li>
              )) ?? <li>No farms registered yet.</li>}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function AdminDashboard({ user, setUser }: { user: User; setUser: (user: User | null) => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; status: string; createdAt: string }>>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<AdminStats>('/api/admin/stats'),
      apiFetch<{ users: Array<{ id: string; name: string; email: string; status: string; createdAt: string }> }>('/api/admin/users?limit=5'),
    ]).then(([statsData, userData]) => {
      setStats(statsData);
      setUsers(userData.users);
    });
  }, []);

  const chartData = [
    { name: 'Farmers', value: stats?.stats.totalFarmers ?? 0 },
    { name: 'Farms', value: stats?.stats.totalFarms ?? 0 },
    { name: 'Crops', value: stats?.stats.totalCrops ?? 0 },
    { name: 'Livestock', value: stats?.stats.totalLivestock ?? 0 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-600">Administrator dashboard</p>
            <h1 className="text-3xl font-bold text-slate-900">Operations overview</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">{user.name}</span>
            <button className="btn-secondary" onClick={() => handleLogout(setUser, '/admin-login')}>Logout</button>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Total farmers', stats?.stats.totalFarmers ?? 0],
            ['Active accounts', stats?.stats.activeFarmers ?? 0],
            ['Income', formatKES(stats?.stats.totalIncome ?? 0)],
            ['Profit', formatKES(stats?.stats.totalProfit ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="card">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="card p-4">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Registered users</h2>
            <div className="space-y-3">
              {users.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                  <div>
                    <p className="font-medium text-slate-800">{member.name}</p>
                    <p className="text-sm text-slate-500">{member.email}</p>
                  </div>
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">{member.status}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-4 text-xl font-bold text-slate-900">System distribution</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0f172a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
