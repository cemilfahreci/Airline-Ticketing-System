import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'

// Environment configuration (Vite uses import.meta.env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zkuzdsolyrwlxyfkgwzp.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdXpkc29seXJ3bHh5Zmtnd3pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMjA3MTIsImV4cCI6MjA4MzU5NjcxMn0.h1ODolFB71PNCCFcwnJ3w4Zklo7izT04FFQxfQrPAfk'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// User-friendly error message mapping
const getErrorMessage = (error) => {
    const msg = error?.message || error || 'Bir hata oluştu';

    // Rate limiting
    if (msg.includes('Too Many Requests') || msg.includes('rate limit')) {
        return '⏳ Çok fazla deneme yaptınız. Lütfen 1-2 dakika bekleyip tekrar deneyin.';
    }

    // Email errors
    if (msg.includes('Invalid email') || msg.includes('invalid email')) {
        return '📧 Geçersiz email adresi. Lütfen doğru formatta girin (örn: isim@domain.com)';
    }
    if (msg.includes('User already registered') || msg.includes('already exists')) {
        return '📧 Bu email adresi zaten kayıtlı. Giriş yapmayı deneyin veya şifremi unuttum kullanın.';
    }
    if (msg.includes('Email not confirmed')) {
        return '📧 Email adresiniz henüz doğrulanmamış. Inbox\'ınızı kontrol edin.';
    }

    // Password errors
    if (msg.includes('Password should be at least') || msg.includes('password')) {
        return '🔒 Şifre en az 6 karakter olmalıdır.';
    }
    if (msg.includes('Invalid login credentials')) {
        return '🔐 Email veya şifre hatalı. Lütfen bilgilerinizi kontrol edin.';
    }

    // Pattern/format errors
    if (msg.includes('did not match the expected pattern') || msg.includes('pattern')) {
        return '⚠️ Girdiğiniz bilgiler geçersiz format içeriyor. Lütfen özel karakterler kullanmayın.';
    }

    // Network errors
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
        return '🌐 Bağlantı hatası. İnternet bağlantınızı kontrol edin.';
    }
    if (msg.includes('is not valid JSON')) {
        return '⏳ Sunucu meşgul. Lütfen birkaç saniye bekleyip tekrar deneyin.';
    }

    // Signup disabled
    if (msg.includes('Signups not allowed')) {
        return '🚫 Kayıt şu anda kapalı. Lütfen daha sonra tekrar deneyin.';
    }

    // Generic fallback
    return `❌ ${msg}`;
};


// Helper to parse local time from DB without UTC conversion
// Forces "Wall Clock" time - if DB says 20:30, we show 20:30 regardless of timezone
const parseLocalTime = (timeStr) => {
    if (!timeStr) return null;
    if (timeStr instanceof Date) return timeStr;

    // Strip out timezone info to get raw "YYYY-MM-DDTHH:mm:ss"
    let cleanTime = timeStr;
    if (typeof timeStr === 'string' && timeStr.includes('T')) {
        cleanTime = timeStr.substring(0, 19);
        return new Date(cleanTime);
    }

    return new Date(timeStr);
};

function App() {
    const [milesUser, setMilesUser] = useState(null)
    const [authLoading, setAuthLoading] = useState(true) // Track initial auth check

    useEffect(() => {
        // Supabase manages IAM - we just check the session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                fetchMilesProfile(session.user.id)
            }
            setAuthLoading(false) // Auth check complete
        }).catch(() => {
            setAuthLoading(false) // Auth check complete even on error
        })
    }, [])

    const fetchMilesProfile = async (userId) => {
        try {
            const res = await fetch(`${API_BASE}/api/v1/miles/members/by-user/${userId}`)
            if (res.ok) {
                const data = await res.json()
                setMilesUser(data.member)
            }
        } catch (err) {
            console.error('Failed to fetch miles profile:', err)
        }
    }

    const handleMilesLogout = async () => {
        await supabase.auth.signOut()
        setMilesUser(null)
    }

    return (
        <BrowserRouter>
            <div className="app">
                <Header milesUser={milesUser} />
                <Routes>
                    <Route path="/" element={<HomePage milesUser={milesUser} setMilesUser={setMilesUser} />} />
                    <Route path="/miles" element={<MilesPage milesUser={milesUser} setMilesUser={setMilesUser} onLogout={handleMilesLogout} />} />
                    <Route path="/auth/callback" element={<AuthCallback setMilesUser={setMilesUser} />} />
                </Routes>
            </div>
        </BrowserRouter>
    )
}

// ============================================
// AUTH CALLBACK PAGE (Legacy - Email verification removed)
// ============================================
function AuthCallback({ setMilesUser }) {
    const navigate = useNavigate()

    useEffect(() => {
        // Email verification removed - just redirect to miles page
        // Try to fetch user session and member data
        const fetchUserData = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                if (session?.user) {
                    const res = await fetch(`${API_BASE}/api/v1/miles/members/by-user/${session.user.id}`)
                    if (res.ok) {
                        const data = await res.json()
                        setMilesUser(data.member)
                    }
                }
            } catch (err) {
                console.error('Error fetching user data:', err)
            }
            // Redirect to miles page
            navigate('/miles')
        }
        fetchUserData()
    }, [navigate, setMilesUser])

    // Email verification removed - just show loading and redirect
    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '20px'
        }}>
            <div style={{
                background: 'white',
                borderRadius: '20px',
                padding: '40px',
                textAlign: 'center',
                maxWidth: '400px',
                width: '100%',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
                <div style={{ fontSize: '4rem', marginBottom: '20px' }}>⏳</div>
                <h2 style={{ color: '#333', marginBottom: '10px' }}>Yönlendiriliyor...</h2>
                <p style={{ color: '#666' }}>Miles&Smiles sayfasına yönlendiriliyorsunuz...</p>
            </div>
        </div>
    )
}

function Header({ milesUser }) {
    return (
        <header className="header">
            <Link to="/" className="logo">✈️ FlightSystem</Link>
            <nav className="nav-links">
                <Link to="/">Flights</Link>
                <Link to="/miles">{milesUser ? `👤 ${milesUser.member_number}` : 'Miles&Smiles'}</Link>
                <a href="#">Help</a>
            </nav>
        </header>
    )
}

// ============================================
// MILES PAGE (Separate Page)
// ============================================
function MilesPage({ milesUser, setMilesUser, onLogout }) {
    const [mode, setMode] = useState('login')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', phone: '' })
    const [bookings, setBookings] = useState([])
    const [bookingsLoading, setBookingsLoading] = useState(false)
    const [forgotPasswordSent, setForgotPasswordSent] = useState(false)
    const [isPasswordReset, setIsPasswordReset] = useState(false)
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [passwordResetSuccess, setPasswordResetSuccess] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')
    const [authLoading, setAuthLoading] = useState(true) // Track auth state loading
    const [selectedBooking, setSelectedBooking] = useState(null) // Details popup
    const navigate = useNavigate()

    // Track if initial session check is done (to prevent duplicate confirmation triggers)
    const initialCheckDone = useRef(false)

    // Check for email confirmation on page load via Supabase auth state
    useEffect(() => {
        checkAuthState()

        // Check for password reset token in URL hash
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const type = hashParams.get('type')
        if (type === 'recovery') {
            console.log('🔐 Password reset detected')
            setIsPasswordReset(true)
        }

        // Listen for auth state changes - only log, don't trigger state updates
        // This prevents infinite loops and unnecessary re-renders
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            // Only log for debugging, don't trigger any state changes here
            // State management is handled by checkAuthState() and explicit user actions
            if (event === 'INITIAL_SESSION') {
                initialCheckDone.current = true
            }
        })

        return () => subscription.unsubscribe()
    }, []) // Empty dependency - only run once on mount

    // Check current Supabase auth state (Supabase manages IAM)
    const checkAuthState = async () => {
        setAuthLoading(true) // Start loading
        try {
            // Supabase manages IAM - we just check the session
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user) {
                // User has session, check if they have Miles membership
                const res = await fetch(`${API_BASE}/api/v1/miles/members/by-user/${session.user.id}`)
                if (res.ok) {
                    const memberData = await res.json()
                    if (memberData.member) {
                        setMilesUser(memberData.member)
                    }
                }
            }
        } catch (err) {
            console.log('Checking auth state...', err)
        } finally {
            setAuthLoading(false) // Stop loading after check completes
        }
    }

    // Fetch user bookings when logged in
    useEffect(() => {
        if (milesUser?.id) {
            fetchUserBookings()
        }
    }, [milesUser?.id])

    const fetchUserBookings = async () => {
        if (!milesUser?.id) return
        setBookingsLoading(true)
        try {
            const res = await fetch(`${API_BASE}/api/v1/bookings/member/${milesUser.id}`)
            if (res.ok) {
                const data = await res.json()
                setBookings(data.bookings || [])
            }
        } catch (err) {
            console.error('Failed to fetch bookings:', err)
        } finally {
            setBookingsLoading(false)
        }
    }

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: form.email.trim().toLowerCase(),
                password: form.password
            })
            if (error) throw error

            const res = await fetch(`${API_BASE}/api/v1/miles/members/by-user/${data.user.id}`)
            if (res.ok) {
                const memberData = await res.json()
                setMilesUser(memberData.member)
            } else {
                // User exists in Supabase but no miles membership - create one
                console.log('No miles membership found, creating one...')
                const userMeta = data.user.user_metadata || {}

                const createRes = await fetch(`${API_BASE}/api/v1/miles/members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: data.user.email,
                        first_name: userMeta.first_name || form.email.split('@')[0],
                        last_name: userMeta.last_name || '',
                        phone: userMeta.phone || null,
                        user_id: data.user.id
                    })
                })

                if (createRes.ok) {
                    const newMember = await createRes.json()
                    setMilesUser(newMember.member)

                    // Send welcome email
                    fetch(`${API_BASE}/api/v1/miles/members/${newMember.member.id}/welcome-email`, {
                        method: 'POST'
                    }).catch(err => console.error('Welcome email failed:', err))
                } else {
                    const errData = await createRes.json().catch(() => ({}))
                    throw new Error(errData.error || 'Miles üyeliği oluşturulamadı')
                }
            }
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    const handleForgotPassword = async (e) => {
        e.preventDefault()
        if (!form.email) {
            setError('Please enter your email address')
            return
        }
        setLoading(true)
        setError('')
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
                redirectTo: `${window.location.origin}/miles`
            })
            if (error) throw error
            setForgotPasswordSent(true)
            setForm({ ...form, password: '' })
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    // Handle password update from reset link
    const handlePasswordUpdate = async (e) => {
        e.preventDefault()

        if (!newPassword || newPassword.length < 6) {
            setError('Password must be at least 6 characters')
            return
        }

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match')
            return
        }

        setLoading(true)
        setError('')

        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            })

            if (error) throw error

            setPasswordResetSuccess(true)
            setNewPassword('')
            setConfirmPassword('')
            window.history.replaceState(null, '', window.location.pathname)

            setTimeout(() => {
                setIsPasswordReset(false)
                setPasswordResetSuccess(false)
            }, 3000)

        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    const handleRegister = async (e) => {
        e.preventDefault()
        if (!form.first_name || !form.last_name || !form.email || !form.password) {
            setError('Lütfen tüm zorunlu alanları doldurun')
            return
        }
        if (form.password.length < 6) {
            setError('🔒 Şifre en az 6 karakter olmalıdır')
            return
        }
        setLoading(true)
        setError('')

        try {
            let userId = null

            // Try to sign up with Supabase
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: form.email.trim().toLowerCase(),
                password: form.password,
                options: {
                    data: {
                        first_name: form.first_name.trim(),
                        last_name: form.last_name.trim(),
                        full_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
                        phone: form.phone?.trim() || null
                    },
                    emailRedirectTo: undefined
                }
            })

            // Handle "User already registered" - try to login instead
            if (authError) {
                if (authError.message.includes('User already registered') || authError.message.includes('already exists')) {
                    // User exists in Supabase, try to login and check if they have miles membership
                    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
                        email: form.email.trim().toLowerCase(),
                        password: form.password
                    })

                    if (loginError) {
                        throw new Error('📧 Bu email zaten kayıtlı. Giriş yapmayı deneyin veya şifrenizi sıfırlayın.')
                    }

                    userId = loginData.user?.id

                    // Check if user has miles membership
                    const checkRes = await fetch(`${API_BASE}/api/v1/miles/members/by-user/${userId}`)
                    if (checkRes.ok) {
                        const memberData = await checkRes.json()
                        if (memberData.member) {
                            // Already has membership, just log them in
                            setMilesUser(memberData.member)
                            return
                        }
                    }
                    // User exists but no membership, continue to create membership
                } else {
                    throw authError
                }
            } else {
                if (!authData.user) {
                    throw new Error('Kullanıcı oluşturulamadı')
                }
                userId = authData.user.id
            }

            // Create Miles member record
            const res = await fetch(`${API_BASE}/api/v1/miles/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: form.email.trim().toLowerCase(),
                    first_name: form.first_name.trim(),
                    last_name: form.last_name.trim(),
                    phone: form.phone?.trim() || null,
                    user_id: userId
                })
            })

            const data = await res.json()

            // Handle member already exists
            if (!res.ok) {
                if (data.error?.includes('already exists') || data.error?.includes('already registered')) {
                    // Try to fetch existing member
                    const existingRes = await fetch(`${API_BASE}/api/v1/miles/members/by-user/${userId}`)
                    if (existingRes.ok) {
                        const existingData = await existingRes.json()
                        if (existingData.member) {
                            setMilesUser(existingData.member)
                            return
                        }
                    }
                }
                throw new Error(data.error || 'Kayıt başarısız oldu')
            }

            // Success - set miles user
            setMilesUser(data.member)

            // Send welcome email (non-blocking)
            fetch(`${API_BASE}/api/v1/miles/members/${data.member.id}/welcome-email`, {
                method: 'POST'
            }).catch(err => console.error('Failed to send welcome email:', err))

        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }

    // Email verification removed - no longer needed

    // Delete account permanently
    const handleDeleteAccount = async () => {
        if (deleteConfirmText !== 'DELETE') {
            setError('Please type DELETE to confirm')
            return
        }

        setDeleteLoading(true)
        setError('')

        try {
            // Get fresh session from Supabase (Supabase manages IAM)
            const { data: { session }, error: sessionError } = await supabase.auth.getSession()

            if (sessionError) {
                throw new Error(`Session error: ${sessionError.message}`)
            }

            if (!session || !session.access_token) {
                throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.')
            }

            console.log('Deleting account with token:', session.access_token.substring(0, 20) + '...')

            const res = await fetch(`${API_BASE}/api/v1/miles/members/${milesUser.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                }
            })

            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: 'Unknown error' }))
                console.error('Delete account error:', res.status, data)

                if (res.status === 401) {
                    throw new Error('Yetkilendirme hatası. Lütfen çıkış yapıp tekrar giriş yapın.')
                }

                // Show detailed error message if available
                const errorMsg = data.details
                    ? `${data.error || 'Hesap silinemedi'}: ${data.details}`
                    : (data.error || data.message || 'Hesap silinemedi')

                throw new Error(errorMsg)
            }

            // Sign out and redirect
            await supabase.auth.signOut()
            setMilesUser(null)
            setShowDeleteConfirm(false)
            navigate('/')
            alert('Your account has been permanently deleted.')

        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setDeleteLoading(false)
        }
    }

    // ==========================================
    // RENDER HELPERS
    // ==========================================
    const formatCardNum = (num) => num ? num.toString().match(/.{1,4}/g).join(' ') : '**** **** ****';

    // 1. Loading State
    if (authLoading) {
        return (
            <div className="miles-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ background: 'white', padding: '40px', borderRadius: '12px', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '15px' }}>⏳</div>
                    <p style={{ color: '#666', fontWeight: '500' }}>Loading your dashboard...</p>
                </div>
            </div>
        )
    }

    // 2. Auth Page (Login / Register / Forgot Password)
    if (!milesUser && !isPasswordReset) {
        return (
            <div className="miles-page">
                <div className="miles-container">
                    <h1>✈️ Miles&Smiles</h1>
                    <p className="miles-subtitle">Turkish Airlines Loyalty Program - Earn Miles, Enjoy Rewards</p>

                    <div className="auth-card">
                        <div className="auth-tabs">
                            <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setForgotPasswordSent(false); setError('') }}>Login</button>
                            <button className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setForgotPasswordSent(false); setError('') }}>Register</button>
                            <button className={`tab ${mode === 'forgot' ? 'active' : ''}`} onClick={() => { setMode('forgot'); setForgotPasswordSent(false); setError('') }}>Forgot Password</button>
                        </div>

                        {error && <div className="alert alert-error">{error}</div>}

                        {forgotPasswordSent && (
                            <div className="alert alert-success">
                                <div style={{ fontSize: '1.5rem', marginBottom: '8px', textAlign: 'center' }}>📧</div>
                                <strong style={{ display: 'block', textAlign: 'center' }}>Password reset email sent!</strong>
                                <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', textAlign: 'center' }}>Check your inbox for instructions.</p>
                            </div>
                        )}

                        <form onSubmit={mode === 'login' ? handleLogin : mode === 'forgot' ? handleForgotPassword : handleRegister}>
                            {mode === 'register' && (
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>First Name *</label>
                                        <input type="text" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Last Name *</label>
                                        <input type="text" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} required />
                                    </div>
                                </div>
                            )}
                            <div className="form-group">
                                <label>Email *</label>
                                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
                            </div>
                            {mode === 'register' && (
                                <div className="form-group">
                                    <label>Phone</label>
                                    <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+90 555..." />
                                </div>
                            )}
                            {mode !== 'forgot' && (
                                <div className="form-group">
                                    <label>Password *</label>
                                    <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
                                </div>
                            )}
                            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                                {loading ? 'Processing...' : mode === 'login' ? 'Login' : mode === 'forgot' ? 'Send Reset Email' : 'Join Miles&Smiles'}
                            </button>

                            {mode === 'login' && (
                                <div style={{ textAlign: 'center', marginTop: '12px' }}>
                                    <button type="button" onClick={() => setMode('forgot')} style={{ background: 'none', border: 'none', color: '#667eea', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.9rem' }}>
                                        Forgot your password?
                                    </button>
                                </div>
                            )}
                        </form>

                        <div className="benefits">
                            <h3>✨ Member Benefits</h3>
                            <ul>
                                <li>✈️ Earn miles on every Turkish Airlines flight</li>
                                <li>💳 Redeem miles for award tickets and upgrades</li>
                                <li>⚡ Priority check-in and boarding</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // 3. Password Reset Page (Special Case)
    if (isPasswordReset) {
        return (
            <div className="miles-page">
                <div className="miles-container">
                    <h1>🔐 Password Reset</h1>
                    <div className="auth-card">
                        {passwordResetSuccess ? (
                            <div className="alert alert-success" style={{ textAlign: 'center' }}>
                                <h2>✅ Success</h2>
                                <p>Password updated successfully!</p>
                                <button onClick={() => { setIsPasswordReset(false); setMode('login'); }} className="btn btn-primary btn-full" style={{ marginTop: '15px' }}>Login Now</button>
                            </div>
                        ) : (
                            <form onSubmit={handlePasswordUpdate}>
                                {error && <div className="alert alert-error">{error}</div>}
                                <div className="form-group">
                                    <label>New Password</label>
                                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
                                </div>
                                <div className="form-group">
                                    <label>Confirm Password</label>
                                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
                                </div>
                                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>{loading ? 'Updating...' : 'Set New Password'}</button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    // 4. DASHBOARD (Logged In)
    return (
        <div className="miles-dashboard-wrapper">
            {/* Hero Section */}
            <div className="miles-hero-bg">
                <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>Hello, {milesUser.first_name} 👋</h1>
                <p style={{ opacity: 0.8, fontSize: '1.1rem' }}>Review your miles, upcoming flights, and rewards status.</p>
            </div>

            <div className="miles-dashboard-container">
                {/* LEFT COLUMN: SIDEBAR */}
                <aside className="dashboard-sidebar">
                    {/* Membership Card Visual */}
                    <div className="membership-card-visual">
                        <div className="card-logo">
                            <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>✈️ Miles&Smiles</span>
                            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>{milesUser.tier || 'CLASSIC'}</span>
                        </div>
                        <div className="card-chip"></div>
                        <div className="card-number">{formatCardNum(milesUser.member_number)}</div>
                        <div className="card-details">
                            <div>
                                <div className="card-label">MEMBER</div>
                                <div className="card-value">{milesUser.first_name} {milesUser.last_name}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div className="card-label">AVAILABLE</div>
                                <div className="card-value">{(milesUser.total_points || 0).toLocaleString()}</div>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Menu */}
                    <div className="sidebar-card">
                        <ul className="sidebar-menu">
                            <li><button onClick={() => { }} style={{ background: '#f3f4f6', color: '#1e3a5f' }}>📊 Dashboard Overview</button></li>
                            <li><button onClick={() => navigate('/')}>✈️ Book a New Flight</button></li>
                            <li style={{ borderTop: '1px solid #eee', margin: '10px 0' }}></li>
                            <li><button className="danger" onClick={onLogout}>🚪 Sign Out</button></li>
                            <li><button className="danger" onClick={() => setShowDeleteConfirm(true)}>🗑️ Delete Account</button></li>
                        </ul>
                    </div>
                </aside>

                {/* RIGHT COLUMN: MAIN CONTENT */}
                <main className="dashboard-main">
                    {/* Stats Grid */}
                    <div className="stats-grid-modern">
                        <div className="stat-card-modern">
                            <div className="stat-icon gold">🏆</div>
                            <div className="stat-info">
                                <span className="value">{(milesUser.total_points || 0).toLocaleString()}</span>
                                <span className="label">Total Miles</span>
                            </div>
                        </div>
                        <div className="stat-card-modern">
                            <div className="stat-icon blue">✈️</div>
                            <div className="stat-info">
                                <span className="value">{bookings.length}</span>
                                <span className="label">Flights booked</span>
                            </div>
                        </div>
                        <div className="stat-card-modern">
                            <div className="stat-icon green">✨</div>
                            <div className="stat-info">
                                <span className="value">{milesUser.tier || 'CLASSIC'}</span>
                                <span className="label">Current Status</span>
                            </div>
                        </div>
                    </div>

                    {/* Recent Activity / Bookings */}
                    <div className="content-card">
                        <div className="content-header">
                            <h3>Recent Flights</h3>
                            <button onClick={fetchUserBookings} className="btn btn-outline" style={{ padding: '6px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                🔄 Refresh
                            </button>
                        </div>

                        {bookingsLoading ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading records...</div>
                        ) : bookings.length === 0 ? (
                            <div className="empty-state" style={{ padding: '2rem' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🎫</div>
                                <h3>No flights yet</h3>
                                <p>Your journey begins with a single flight.</p>
                                <button className="btn btn-primary" style={{ marginTop: '15px' }} onClick={() => navigate('/')}>Book Now</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {bookings.map((booking, idx) => {
                                    // Booking display logic reused
                                    const flightDate = parseLocalTime(booking.flight?.departure_time);
                                    const now = new Date();
                                    const isFlown = flightDate && flightDate <= now;
                                    const isUpcoming = flightDate && flightDate > now;

                                    // Calculate display values
                                    let totalDuration = 0;
                                    if (booking.segments && booking.segments.length > 0) {
                                        totalDuration = booking.segments.reduce((sum, seg) => sum + (seg.duration_minutes || 0), 0);
                                    } else {
                                        totalDuration = booking.total_duration_minutes || booking.flight?.duration_minutes || 0;
                                    }
                                    const earnedMiles = booking.credited_miles || (totalDuration * (booking.passenger_count || 1));
                                    const originCode = booking.route_origin?.code || booking.flight?.origin?.code || '?';
                                    const destCode = booking.route_destination?.code || booking.flight?.destination?.code || '?';

                                    return (
                                        <div key={idx} className="booking-item" onClick={() => setSelectedBooking(booking)} style={{ cursor: 'pointer' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                                                <div style={{ background: '#eef2ff', padding: '10px', borderRadius: '10px', fontSize: '1.2rem' }}>✈️</div>
                                                <div>
                                                    <div style={{ fontWeight: '700', color: '#1f2937' }}>{originCode} → {destCode}</div>
                                                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                                                        {flightDate ? flightDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'Date N/A'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ textAlign: 'center', padding: '0 15px' }}>
                                                <span className={`booking-status ${isFlown ? 'status-completed' : 'status-confirmed'}`}>
                                                    {isFlown ? 'COMPLETED' : 'UPCOMING'}
                                                </span>
                                            </div>

                                            <div style={{ textAlign: 'right', minWidth: '120px' }}>
                                                <div style={{ fontWeight: 'bold', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                    +{earnedMiles} <span style={{ fontSize: '0.7rem', fontWeight: 'normal' }}>miles</span>
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{booking.passenger_count} passenger(s)</div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Delete Modal */}
            {showDeleteConfirm && (
                <div className="modal-overlay">
                    <div className="modal" style={{ textAlign: 'center', padding: '30px' }}>
                        <div style={{ fontSize: '4rem', marginBottom: '15px' }}>⚠️</div>
                        <h2 style={{ color: '#dc2626', marginBottom: '10px' }}>Delete Account?</h2>
                        <p style={{ color: '#6b7280', marginBottom: '20px' }}>
                            This will permanently delete your Miles&Smiles membership and <strong>{(milesUser.total_points || 0).toLocaleString()}</strong> miles.
                        </p>

                        <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', padding: '10px', borderRadius: '8px', marginBottom: '20px' }}>
                            To confirm, type <strong>DELETE</strong> below:
                        </div>

                        <input
                            type="text"
                            value={deleteConfirmText}
                            onChange={e => setDeleteConfirmText(e.target.value)}
                            placeholder="DELETE"
                            style={{ width: '100%', padding: '12px', textAlign: 'center', fontSize: '1.1rem', letterSpacing: '1px', border: '2px solid #e5e7eb', borderRadius: '8px', marginBottom: '20px' }}
                        />

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}>Cancel</button>
                            <button
                                className="btn btn-danger"
                                style={{ flex: 1, opacity: deleteConfirmText === 'DELETE' ? 1 : 0.5, cursor: deleteConfirmText === 'DELETE' ? 'pointer' : 'not-allowed' }}
                                disabled={deleteConfirmText !== 'DELETE'}
                                onClick={handleDeleteAccount}
                            >
                                {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Flight Details Modal */}
            {selectedBooking && (
                <div className="modal-overlay" onClick={() => setSelectedBooking(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%' }}>
                        <div className="modal-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Flight Details</h3>
                            <button onClick={() => setSelectedBooking(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666' }}>&times;</button>
                        </div>

                        <div className="modal-body">
                            {/* Summary Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px', background: '#f8fafc', padding: '15px', borderRadius: '10px' }}>
                                <div style={{ fontSize: '2rem' }}>✈️</div>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#1e3a5f' }}>
                                        {selectedBooking.route_origin?.code || selectedBooking.flight?.origin?.code} &rarr; {selectedBooking.route_destination?.code || selectedBooking.flight?.destination?.code}
                                    </div>
                                    <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
                                        {parseLocalTime(selectedBooking.flight?.departure_time)?.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                    </div>
                                </div>
                                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                    <div className={`booking-status ${parseLocalTime(selectedBooking.flight?.departure_time) <= new Date() ? 'status-completed' : 'status-confirmed'}`}>
                                        {parseLocalTime(selectedBooking.flight?.departure_time) <= new Date() ? 'COMPLETED' : 'CONFIRMED'}
                                    </div>
                                </div>
                            </div>

                            {/* Details Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', marginBottom: '25px' }}>
                                <div style={{ padding: '10px', background: '#fff', border: '1px solid #eee', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Booking Reference (PNR)</div>
                                    <div style={{ fontWeight: '600', fontFamily: 'monospace', fontSize: '1.1rem' }}>{selectedBooking.pnr || 'TK' + Math.floor(100000 + Math.random() * 900000)}</div>
                                </div>
                                <div style={{ padding: '10px', background: '#fff', border: '1px solid #eee', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Passengers</div>
                                    <div style={{ fontWeight: '600' }}>{selectedBooking.passenger_count || 1} Adult(s)</div>
                                </div>
                                <div style={{ padding: '10px', background: '#fff', border: '1px solid #eee', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Total Paid</div>
                                    <div style={{ fontWeight: '600', color: '#111' }}>${(selectedBooking.total_price || 0).toLocaleString()}</div>
                                </div>
                                <div style={{ padding: '10px', background: '#fff', border: '1px solid #eee', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Miles Earned</div>
                                    <div style={{ fontWeight: '600', color: '#059669' }}>+{selectedBooking.credited_miles || (selectedBooking.total_duration_minutes || selectedBooking.flight?.duration_minutes) * (selectedBooking.passenger_count || 1)} Miles</div>
                                </div>
                            </div>

                            {/* Passengers Detail */}
                            <h4 style={{ fontSize: '1rem', borderBottom: '1px solid #eee', paddingBottom: '8px', marginBottom: '15px' }}>Passengers</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', marginBottom: '25px' }}>
                                {((selectedBooking.passengers && selectedBooking.passengers.length > 0)
                                    ? selectedBooking.passengers
                                    : (selectedBooking.miles_member_id === milesUser.id ? [{ first_name: milesUser.first_name, last_name: milesUser.last_name, passenger_type: 'Primary Member' }] : [])
                                ).map((p, i) => (
                                    <div key={i} style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ background: '#bfdbfe', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>👤</div>
                                        <div>
                                            <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{p.first_name} {p.last_name}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{p.passenger_type || 'Adult'}</div>
                                        </div>
                                    </div>
                                ))}
                                {(!selectedBooking.passengers?.length && selectedBooking.miles_member_id !== milesUser.id) && (
                                    <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.9rem' }}>Passenger details not available</div>
                                )}
                            </div>

                            {/* Itinerary */}
                            <h4 style={{ fontSize: '1rem', borderBottom: '1px solid #eee', paddingBottom: '8px', marginBottom: '15px' }}>Itinerary</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {(selectedBooking.segments && selectedBooking.segments.length > 0 ? selectedBooking.segments : [selectedBooking.flight]).map((seg, i) => {
                                    if (!seg) return null;
                                    const dep = parseLocalTime(seg.departure_time);
                                    const arr = parseLocalTime(seg.arrival_time);
                                    return (
                                        <div key={i} style={{ display: 'flex', gap: '15px', position: 'relative' }}>
                                            {/* Connector Line */}
                                            {i < (selectedBooking.segments?.length || 1) - 1 && (
                                                <div style={{ position: 'absolute', left: '19px', top: '40px', bottom: '-20px', width: '2px', background: '#e2e8f0' }}></div>
                                            )}

                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                                    {i + 1}
                                                </div>
                                            </div>
                                            <div style={{ flex: 1, paddingBottom: '10px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px' }}>
                                                    <div style={{ fontWeight: 'bold' }}>{seg.origin?.city} ({seg.origin?.code})</div>
                                                    <div style={{ fontWeight: 'bold' }}>{seg.destination?.city} ({seg.destination?.code})</div>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.9rem' }}>
                                                    <div>{dep?.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <span style={{ fontSize: '0.8rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                                                            {Math.floor(seg.duration_minutes / 60)}h {seg.duration_minutes % 60}m
                                                        </span>
                                                        <span>&rarr;</span>
                                                    </div>
                                                    <div>{arr?.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                                                </div>
                                                <div style={{ marginTop: '5px', fontSize: '0.85rem', color: '#94a3b8' }}>
                                                    Flight: <span style={{ fontFamily: 'monospace', color: '#475569' }}>{seg.airline || 'TK'} {seg.flight_number}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ============================================
// HOME PAGE (Flight Search)
// ============================================
function HomePage({ milesUser, setMilesUser }) {
    const [airports, setAirports] = useState([])
    const [flights, setFlights] = useState([])
    const [returnFlights, setReturnFlights] = useState([]) // Return flights for round-trip
    const [searched, setSearched] = useState(false)
    const [loading, setLoading] = useState(false)
    const [selectedFlight, setSelectedFlight] = useState(null)
    const [selectedReturnFlight, setSelectedReturnFlight] = useState(null) // Selected return flight
    const [tripType, setTripType] = useState('one-way')
    const [searchMode, setSearchMode] = useState('single') // 'single' or 'range'
    const [bookingStep, setBookingStep] = useState('outbound') // 'outbound' or 'return' for round-trip selection
    const [searchParams, setSearchParams] = useState({
        from: '', to: '', date: '', startDate: '', endDate: '', returnDate: '', passengers: 1, flexible: false, direct_only: false // false = show both direct and connecting
    })

    // Sorting and filtering state
    const [sortBy, setSortBy] = useState('price_asc') // price_asc, price_desc, departure, duration
    const [maxPrice, setMaxPrice] = useState('')
    const [showDirectOnly, setShowDirectOnly] = useState(false)

    // Apply sorting and filtering to flights
    const getFilteredAndSortedFlights = (flightList) => {
        let result = [...flightList]

        // Filter by max price
        if (maxPrice && !isNaN(parseFloat(maxPrice))) {
            result = result.filter(f => parseFloat(f.predicted_price || f.base_price) <= parseFloat(maxPrice))
        }

        // Filter by direct only
        if (showDirectOnly) {
            result = result.filter(f => f.is_direct !== false && !f.segments)
        }

        // Sort
        switch (sortBy) {
            case 'price_asc':
                result.sort((a, b) => parseFloat(a.predicted_price || a.base_price) - parseFloat(b.predicted_price || b.base_price))
                break
            case 'price_desc':
                result.sort((a, b) => parseFloat(b.predicted_price || b.base_price) - parseFloat(a.predicted_price || a.base_price))
                break
            case 'departure':
                result.sort((a, b) => new Date(a.departure_time) - new Date(b.departure_time))
                break
            case 'duration':
                result.sort((a, b) => (a.duration_minutes || 0) - (b.duration_minutes || 0))
                break
            default:
                break
        }

        return result
    }

    const filteredFlights = getFilteredAndSortedFlights(flights)
    const filteredReturnFlights = getFilteredAndSortedFlights(returnFlights)

    useEffect(() => { fetchAirports() }, [])

    const fetchAirports = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/v1/flights/airports`)
            const data = await res.json()
            setAirports(data.airports || [])
        } catch (err) {
            console.error('Failed to fetch airports:', err)
        }
    }

    const handleSearch = async (e) => {
        e.preventDefault()
        setLoading(true)
        setSearched(true)
        setSelectedFlight(null)
        setSelectedReturnFlight(null)
        setBookingStep('outbound')
        setReturnFlights([])

        try {
            // Validate required fields
            if (!searchParams.from || !searchParams.to) {
                alert('Please select both origin and destination')
                setLoading(false)
                return
            }

            const params = new URLSearchParams({
                from: searchParams.from,
                to: searchParams.to,
                passengers: searchParams.passengers.toString(),
                flexible: searchParams.flexible.toString(),
                direct_only: searchParams.direct_only.toString()
            })

            // Add date parameters based on search mode
            if (searchMode === 'range') {
                if (!searchParams.startDate || !searchParams.endDate) {
                    alert('Please select both start and end dates for date range search')
                    setLoading(false)
                    return
                }
                params.append('start_date', searchParams.startDate)
                params.append('end_date', searchParams.endDate)
            } else {
                if (!searchParams.date) {
                    alert('Please select a departure date')
                    setLoading(false)
                    return
                }
                params.append('date', searchParams.date)
            }

            params.set('flexible', searchParams.flexible ? 'true' : 'false')
            params.set('direct_only', searchParams.direct_only ? 'true' : 'false')

            console.log('🔍 Searching outbound flights:', params.toString());
            const res = await fetch(`${API_BASE}/api/v1/flights/search?${params}`)

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
                console.error('❌ API Error:', res.status, errorData);
                alert(`Search failed: ${errorData.error || 'Unknown error'}`);
                setFlights([]);
                return;
            }

            const data = await res.json()
            console.log('✅ Outbound flights:', data.flights?.length || 0);
            setFlights(data.flights || [])

            // For round-trip, also search return flights
            if (tripType === 'round-trip' && searchParams.returnDate) {
                const returnParams = new URLSearchParams({
                    from: searchParams.to, // Swap: destination becomes origin
                    to: searchParams.from, // Swap: origin becomes destination
                    date: searchParams.returnDate,
                    passengers: searchParams.passengers.toString(),
                    flexible: searchParams.flexible ? 'true' : 'false',
                    direct_only: searchParams.direct_only ? 'true' : 'false'
                })

                console.log('🔍 Searching return flights:', returnParams.toString());
                const returnRes = await fetch(`${API_BASE}/api/v1/flights/search?${returnParams}`)

                if (returnRes.ok) {
                    const returnData = await returnRes.json()
                    console.log('✅ Return flights:', returnData.flights?.length || 0);
                    setReturnFlights(returnData.flights || [])
                }
            }
        } catch (err) {
            console.error('❌ Search failed:', err)
            alert(`Search failed: ${err.message}`)
            setFlights([])
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <section className="hero">
                <h1>✈️ Book Your Flight</h1>
                <p>Search and book flights to destinations worldwide</p>
            </section>

            <section className="search-section">
                <div className="search-card">
                    <div className="trip-type">
                        <label>
                            <input
                                type="radio"
                                name="trip"
                                value="one-way"
                                checked={tripType === 'one-way'}
                                onChange={(e) => setTripType(e.target.value)}
                            />
                            One way
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="trip"
                                value="round-trip"
                                checked={tripType === 'round-trip'}
                                onChange={(e) => setTripType(e.target.value)}
                            />
                            Round trip
                        </label>
                    </div>
                    <form onSubmit={handleSearch}>
                        {/* Row 1: From - Swap - To */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ flex: '1', minWidth: '180px' }}>
                                <label>FROM</label>
                                <select value={searchParams.from} onChange={(e) => setSearchParams({ ...searchParams, from: e.target.value })} required>
                                    <option value="">Select departure</option>
                                    {airports.map(a => <option key={a.id} value={a.code}>{a.city} ({a.code})</option>)}
                                </select>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchParams({ ...searchParams, from: searchParams.to, to: searchParams.from });
                                }}
                                style={{
                                    background: '#f8f9fa', border: '2px solid #dee2e6', borderRadius: '50%',
                                    width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', fontSize: '1.2rem', color: '#495057', flexShrink: 0, marginBottom: '2px'
                                }}
                                title="Swap"
                            >⇄</button>
                            <div className="form-group" style={{ flex: '1', minWidth: '180px' }}>
                                <label>TO</label>
                                <select value={searchParams.to} onChange={(e) => setSearchParams({ ...searchParams, to: e.target.value })} required>
                                    <option value="">Select destination</option>
                                    {airports.map(a => <option key={a.id} value={a.code}>{a.city} ({a.code})</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Row 2: Date Selection - Passengers - Search Button */}
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ flex: '2', minWidth: '200px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    DEPARTURE
                                    <select
                                        value={searchMode}
                                        onChange={(e) => {
                                            setSearchMode(e.target.value)
                                            if (e.target.value === 'single') {
                                                setSearchParams({ ...searchParams, startDate: '', endDate: '' })
                                            } else {
                                                setSearchParams({ ...searchParams, date: '' })
                                            }
                                        }}
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: '1px solid #ddd', borderRadius: '4px', marginLeft: 'auto' }}
                                    >
                                        <option value="single">Single</option>
                                        <option value="range">Range</option>
                                    </select>
                                </label>
                                {searchMode === 'range' ? (
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <input type="date" value={searchParams.startDate} onChange={(e) => setSearchParams({ ...searchParams, startDate: e.target.value })} style={{ flex: 1 }} required />
                                        <span style={{ color: '#666', fontSize: '0.875rem' }}>→</span>
                                        <input type="date" value={searchParams.endDate} onChange={(e) => setSearchParams({ ...searchParams, endDate: e.target.value })} min={searchParams.startDate} style={{ flex: 1 }} required />
                                    </div>
                                ) : (
                                    <input type="date" value={searchParams.date} onChange={(e) => setSearchParams({ ...searchParams, date: e.target.value })} required />
                                )}
                            </div>

                            {tripType === 'round-trip' && (
                                <div className="form-group" style={{ flex: '1', minWidth: '150px' }}>
                                    <label>RETURN</label>
                                    <input type="date" value={searchParams.returnDate} onChange={(e) => setSearchParams({ ...searchParams, returnDate: e.target.value })} required min={searchParams.date || searchParams.endDate} />
                                </div>
                            )}

                            <div className="form-group" style={{ flex: '0.8', minWidth: '130px' }}>
                                <label>PASSENGERS</label>
                                <select value={searchParams.passengers} onChange={(e) => setSearchParams({ ...searchParams, passengers: parseInt(e.target.value) })}>
                                    {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} Passenger{n > 1 ? 's' : ''}</option>)}
                                </select>
                            </div>

                            <button type="submit" className="btn btn-primary" disabled={loading} style={{ height: '48px', whiteSpace: 'nowrap' }}>
                                {loading ? '...' : 'Search →'}
                            </button>
                        </div>
                        <div className="search-options">
                            <label className="checkbox-label" title="Search for flights 3 days before and 3 days after your selected date for more options">
                                <input type="checkbox" checked={searchParams.flexible} onChange={(e) => setSearchParams({ ...searchParams, flexible: e.target.checked })} />
                                Flexible dates
                                <span style={{ fontSize: '0.75rem', color: '#666', marginLeft: '0.5rem' }}>
                                    (±3 days)
                                </span>
                            </label>
                            <label className="checkbox-label">
                                <input type="checkbox" checked={searchParams.direct_only} onChange={(e) => setSearchParams({ ...searchParams, direct_only: e.target.checked })} />
                                Direct flights only
                            </label>
                        </div>
                    </form>
                </div>
            </section>

            {searched && (
                <section className="results-section">
                    {tripType === 'round-trip' ? (
                        <>
                            {/* Round-trip selection UI */}
                            <div style={{
                                display: 'flex',
                                gap: '10px',
                                marginBottom: '20px',
                                padding: '15px',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                borderRadius: '12px',
                                flexWrap: 'wrap'
                            }}>
                                <div
                                    onClick={() => setBookingStep('outbound')}
                                    style={{
                                        flex: 1,
                                        minWidth: '200px',
                                        padding: '15px',
                                        background: bookingStep === 'outbound' ? 'white' : 'rgba(255,255,255,0.2)',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s'
                                    }}
                                >
                                    <div style={{ fontSize: '0.75rem', color: bookingStep === 'outbound' ? '#667eea' : 'rgba(255,255,255,0.8)', marginBottom: '5px' }}>
                                        ✈️ OUTBOUND FLIGHT
                                    </div>
                                    <div style={{ fontWeight: 'bold', color: bookingStep === 'outbound' ? '#333' : 'white' }}>
                                        {searchParams.from} → {searchParams.to}
                                    </div>
                                    <div style={{ fontSize: '0.875rem', color: bookingStep === 'outbound' ? '#666' : 'rgba(255,255,255,0.8)' }}>
                                        {searchParams.date || searchParams.startDate}
                                    </div>
                                    {selectedFlight && (
                                        <div style={{
                                            marginTop: '10px',
                                            padding: '8px',
                                            background: '#e8f5e9',
                                            borderRadius: '6px',
                                            fontSize: '0.875rem',
                                            color: '#2e7d32'
                                        }}>
                                            ✓ {selectedFlight.flight_number} - ${selectedFlight.calculated_price?.toFixed(2) || selectedFlight.base_price}
                                        </div>
                                    )}
                                </div>
                                <div
                                    onClick={() => selectedFlight && setBookingStep('return')}
                                    style={{
                                        flex: 1,
                                        minWidth: '200px',
                                        padding: '15px',
                                        background: bookingStep === 'return' ? 'white' : 'rgba(255,255,255,0.2)',
                                        borderRadius: '8px',
                                        cursor: selectedFlight ? 'pointer' : 'not-allowed',
                                        opacity: selectedFlight ? 1 : 0.6,
                                        transition: 'all 0.3s'
                                    }}
                                >
                                    <div style={{ fontSize: '0.75rem', color: bookingStep === 'return' ? '#667eea' : 'rgba(255,255,255,0.8)', marginBottom: '5px' }}>
                                        ✈️ RETURN FLIGHT
                                    </div>
                                    <div style={{ fontWeight: 'bold', color: bookingStep === 'return' ? '#333' : 'white' }}>
                                        {searchParams.to} → {searchParams.from}
                                    </div>
                                    <div style={{ fontSize: '0.875rem', color: bookingStep === 'return' ? '#666' : 'rgba(255,255,255,0.8)' }}>
                                        {searchParams.returnDate}
                                    </div>
                                    {selectedReturnFlight && (
                                        <div style={{
                                            marginTop: '10px',
                                            padding: '8px',
                                            background: '#e8f5e9',
                                            borderRadius: '6px',
                                            fontSize: '0.875rem',
                                            color: '#2e7d32'
                                        }}>
                                            ✓ {selectedReturnFlight.flight_number} - ${selectedReturnFlight.calculated_price?.toFixed(2) || selectedReturnFlight.base_price}
                                        </div>
                                    )}
                                    {!selectedFlight && (
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginTop: '5px' }}>
                                            First select outbound flight
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Show outbound or return flights based on step */}
                            {bookingStep === 'outbound' ? (
                                <>
                                    <div className="results-header">
                                        <span className="results-count">
                                            🛫 {filteredFlights.length} outbound flight{filteredFlights.length !== 1 ? 's' : ''} found
                                        </span>
                                    </div>
                                    {loading ? <div className="loading">Searching...</div> : filteredFlights.length === 0 ? (
                                        <div className="empty-state"><div className="icon">🔍</div><h3>No outbound flights found</h3></div>
                                    ) : filteredFlights.map(f => (
                                        <FlightCard
                                            key={f.id}
                                            flight={f}
                                            passengers={searchParams.passengers}
                                            onSelect={() => {
                                                setSelectedFlight(f)
                                                setBookingStep('return') // Auto-advance to return selection
                                            }}
                                            isSelected={selectedFlight?.id === f.id}
                                        />
                                    ))}
                                </>
                            ) : (
                                <>
                                    <div className="results-header">
                                        <span className="results-count">
                                            🛬 {filteredReturnFlights.length} return flight{filteredReturnFlights.length !== 1 ? 's' : ''} found
                                        </span>
                                    </div>
                                    {filteredReturnFlights.length === 0 ? (
                                        <div className="empty-state"><div className="icon">🔍</div><h3>No return flights found</h3></div>
                                    ) : filteredReturnFlights.map(f => (
                                        <FlightCard
                                            key={f.id}
                                            flight={f}
                                            passengers={searchParams.passengers}
                                            onSelect={() => setSelectedReturnFlight(f)}
                                            isSelected={selectedReturnFlight?.id === f.id}
                                        />
                                    ))}
                                </>
                            )}

                            {/* Complete booking button when both selected */}
                            {selectedFlight && selectedReturnFlight && (
                                <div style={{
                                    position: 'sticky',
                                    bottom: '20px',
                                    padding: '20px',
                                    background: 'white',
                                    borderRadius: '12px',
                                    boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
                                    marginTop: '20px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '15px'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.875rem', color: '#666' }}>Round Trip Total</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#e53935' }}>
                                            ${((selectedFlight.calculated_price || selectedFlight.base_price) +
                                                (selectedReturnFlight.calculated_price || selectedReturnFlight.base_price)).toFixed(2)}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#888' }}>
                                            for {searchParams.passengers} passenger{searchParams.passengers > 1 ? 's' : ''}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            // Open booking modal with both flights
                                            setSelectedFlight({
                                                ...selectedFlight,
                                                returnFlight: selectedReturnFlight,
                                                isRoundTrip: true,
                                                total_price: (selectedFlight.calculated_price || selectedFlight.base_price) +
                                                    (selectedReturnFlight.calculated_price || selectedReturnFlight.base_price)
                                            })
                                        }}
                                        className="btn btn-primary"
                                        style={{ padding: '15px 40px', fontSize: '1.1rem' }}
                                    >
                                        Book Round Trip ✈️
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        // One-way display (existing logic)
                        <>
                            <div className="results-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '15px' }}>
                                <span className="results-count">{filteredFlights.length} flight{filteredFlights.length !== 1 ? 's' : ''} found {filteredFlights.length < flights.length && <span style={{ color: '#888', fontSize: '0.85rem' }}>({flights.length - filteredFlights.length} filtered)</span>}</span>

                                {/* Sort and Filter Controls */}
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.875rem', cursor: 'pointer' }}
                                    >
                                        <option value="price_asc">💰 Price: Low to High</option>
                                        <option value="price_desc">💰 Price: High to Low</option>
                                        <option value="departure">🕐 Departure Time</option>
                                        <option value="duration">⏱️ Duration</option>
                                    </select>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <span style={{ fontSize: '0.875rem', color: '#666' }}>Max $</span>
                                        <input
                                            type="number"
                                            value={maxPrice}
                                            onChange={(e) => setMaxPrice(e.target.value)}
                                            placeholder="Any"
                                            style={{ width: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '0.875rem' }}
                                        />
                                    </div>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.875rem', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={showDirectOnly}
                                            onChange={(e) => setShowDirectOnly(e.target.checked)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        ✈️ Direct only
                                    </label>
                                </div>
                            </div>
                            {loading ? <div className="loading">Searching...</div> : filteredFlights.length === 0 ? (
                                <div className="empty-state">
                                    <div className="icon">🔍</div>
                                    <h3>{flights.length > 0 ? 'No flights match your filters' : 'No flights found'}</h3>
                                    {flights.length > 0 && <button className="btn" style={{ marginTop: '10px' }} onClick={() => { setMaxPrice(''); setShowDirectOnly(false); }}>Clear Filters</button>}
                                </div>
                            ) : filteredFlights.map(f => <FlightCard key={f.id} flight={f} passengers={searchParams.passengers} onSelect={() => setSelectedFlight(f)} />)}
                        </>
                    )}
                </section>
            )}

            {selectedFlight && (tripType === 'one-way' || selectedFlight.isRoundTrip) && (
                <BookingModal
                    flight={selectedFlight}
                    passengers={searchParams.passengers}
                    onClose={() => {
                        setSelectedFlight(null)
                        if (tripType === 'round-trip') {
                            setSelectedReturnFlight(null)
                            setBookingStep('outbound')
                        }
                    }}
                    milesUser={milesUser}
                    setMilesUser={setMilesUser}
                />
            )}
        </>
    )
}



function FlightCard({ flight, passengers, onSelect, isSelected }) {
    const dep = parseLocalTime(flight.departure_time);
    const arr = parseLocalTime(flight.arrival_time);
    const isConnecting = flight.segments && flight.segments.length > 0
    const isHubConnection = flight.is_hub_connection
    const connectionAirport = flight.connection_airport_code || flight.connection_airport?.code


    return (
        <div className="flight-card" style={{
            position: 'relative',
            border: isSelected ? '3px solid #4CAF50' : undefined,
            boxShadow: isSelected ? '0 0 20px rgba(76, 175, 80, 0.3)' : undefined
        }}>
            {isConnecting && isHubConnection && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: '#4CAF50',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold'
                }}>
                    ✈️ Hub Connection
                </div>
            )}
            {isConnecting ? (
                // Connecting flight display
                <>
                    <div style={{ marginBottom: '10px', padding: '8px', background: '#f8f9fa', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '4px' }}>
                            {isHubConnection ? '🛫 Via Major Hub' : '🔄 Connecting Flight'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>
                            Connection at {connectionAirport || 'connecting airport'}
                        </div>
                    </div>
                    {flight.segments.map((segment, idx) => {
                        const segDep = parseLocalTime(segment.departure_time)
                        const segArr = parseLocalTime(segment.arrival_time)
                        return (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: idx < flight.segments.length - 1 ? '15px' : 0 }}>
                                <div className="flight-time">
                                    <div className="date" style={{ fontSize: '0.75rem', color: '#666', marginBottom: '2px', fontWeight: 'bold' }}>
                                        {segDep.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                                    </div>
                                    <div className="time">{segDep.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                                    <div className="airport">{segment.origin?.code}</div>
                                    <div className="city">{segment.origin?.city}</div>
                                </div>
                                <div className="flight-duration" style={{ flex: 1 }}>
                                    <div>{segment.duration_minutes} min</div>
                                    <div className="route-line"></div>
                                    <div style={{ fontSize: '0.75rem' }}>{segment.flight_number}</div>
                                </div>
                                <div className="flight-time">
                                    <div className="time">{segArr.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                                    <div className="airport">{segment.destination?.code}</div>
                                    <div className="city">{segment.destination?.city}</div>
                                </div>
                                {idx < flight.segments.length - 1 && segment.layover_minutes && (
                                    <div style={{
                                        margin: '0 10px',
                                        padding: '8px 12px',
                                        background: isHubConnection ? '#e8f5e9' : '#fff3e0',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        border: `1px solid ${isHubConnection ? '#4CAF50' : '#ff9800'}`,
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                                            {segment.destination?.code}
                                        </div>
                                        <div style={{ color: '#666' }}>
                                            Layover: {Math.floor(segment.layover_minutes / 60)}h {segment.layover_minutes % 60}m
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                    <div className="flight-price" style={{ marginTop: '10px', borderTop: '1px solid #e0e0e0', paddingTop: '10px' }}>
                        <div className="price">${(parseFloat(flight.predicted_price) * passengers).toFixed(2)}</div>
                        <div className="per-person">${flight.predicted_price} per person</div>
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '5px' }}>
                            {flight.segments.length} segment{flight.segments.length > 1 ? 's' : ''} • Total: {Math.floor(flight.duration_minutes / 60)}h {flight.duration_minutes % 60}m
                        </div>
                        <button className="btn btn-primary" onClick={onSelect}>Select</button>
                    </div>
                </>
            ) : (
                // Direct flight display
                <>
                    <div className="flight-time">
                        <div className="date" style={{ fontSize: '0.75rem', color: '#666', marginBottom: '2px', fontWeight: 'bold' }}>
                            {dep.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                        </div>
                        <div className="time">{dep.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                        <div className="airport">{flight.origin?.code}</div>
                        <div className="city">{flight.origin?.city}</div>
                    </div>
                    <div className="flight-duration">
                        <div>{flight.duration_minutes} min</div>
                        <div className="route-line"></div>
                        <div>Direct</div>
                    </div>
                    <div className="flight-time">
                        <div className="time">{arr.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                        <div className="airport">{flight.destination?.code}</div>
                        <div className="city">{flight.destination?.city}</div>
                    </div>
                    <div className="flight-price">
                        <div className="price">${(flight.predicted_price * passengers).toFixed(2)}</div>
                        <div className="per-person">${flight.predicted_price} per person</div>
                        <button className="btn btn-primary" onClick={onSelect}>Select</button>
                    </div>
                </>
            )}
        </div>
    )
}

function BookingModal({ flight, passengers, onClose, milesUser, setMilesUser }) {
    const [step, setStep] = useState('form')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [bookingResult, setBookingResult] = useState(null)
    const [useMiles, setUseMiles] = useState(false)
    const [wantMilesMembership, setWantMilesMembership] = useState(false)
    const [milesRegistering, setMilesRegistering] = useState(false)
    const [milesForm, setMilesForm] = useState({ email: '', password: '', firstName: '', lastName: '' })
    const [passengerForms, setPassengerForms] = useState(Array(passengers).fill(null).map(() => ({ gender: 'Mr', first_name: milesUser?.first_name || '', last_name: milesUser?.last_name || '', date_of_birth: '' })))
    const [contactEmail, setContactEmail] = useState(milesUser?.email || '')

    // Handle round-trip flights
    const isRoundTrip = flight.isRoundTrip && flight.returnFlight
    const outboundPrice = flight.calculated_price || flight.predicted_price || flight.base_price || 0
    const returnPrice = isRoundTrip ? (flight.returnFlight.calculated_price || flight.returnFlight.predicted_price || flight.returnFlight.base_price || 0) : 0
    const totalPrice = (outboundPrice + returnPrice) * passengers
    const pointsNeeded = Math.ceil(totalPrice * 100)
    const canUseMiles = milesUser && milesUser.total_points >= pointsNeeded

    // Calculate duration for miles earning
    // For connecting flights, always use segments array to calculate total duration
    // flight.duration_minutes might not include all segments correctly
    let outboundDuration = 0;
    if (flight.segments && Array.isArray(flight.segments) && flight.segments.length > 0) {
        // Connecting flight - sum all segment durations
        outboundDuration = flight.segments.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    } else {
        // Direct flight - use duration_minutes
        outboundDuration = flight.duration_minutes || 0;
    }

    let returnDuration = 0;
    if (isRoundTrip && flight.returnFlight) {
        if (flight.returnFlight.segments && Array.isArray(flight.returnFlight.segments) && flight.returnFlight.segments.length > 0) {
            // Connecting return flight - sum all segment durations
            returnDuration = flight.returnFlight.segments.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
        } else {
            // Direct return flight - use duration_minutes
            returnDuration = flight.returnFlight.duration_minutes || 0;
        }
    }

    const flightDuration = outboundDuration + returnDuration
    const milesToEarn = flightDuration * passengers

    const handlePassengerChange = (i, field, value) => { const u = [...passengerForms]; u[i][field] = value; setPassengerForms(u) }

    // Email verification removed - no pending states needed

    // Quick Miles&Smiles registration during booking
    const handleMilesRegister = async () => {
        const email = milesForm.email || contactEmail;
        const firstName = milesForm.firstName || passengerForms[0]?.first_name || '';
        const lastName = milesForm.lastName || passengerForms[0]?.last_name || '';

        if (!email || !milesForm.password) {
            setError('Email and password required for Miles&Smiles registration')
            return
        }
        if (milesForm.password.length < 6) {
            setError('Password must be at least 6 characters')
            return
        }

        setMilesRegistering(true)
        setError('')
        try {
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            if (!emailRegex.test(email)) {
                throw new Error('Geçersiz email formatı')
            }

            // Validate required fields
            if (!firstName || !lastName) {
                throw new Error('Ad ve soyad gereklidir')
            }

            // Supabase signup with user_metadata (name stored in Supabase IAM)
            // Email verification disabled - user is immediately active
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: email.trim().toLowerCase(),
                password: milesForm.password,
                options: {
                    data: {
                        first_name: firstName.trim(),
                        last_name: lastName.trim(),
                        full_name: `${firstName.trim()} ${lastName.trim()}`
                    },
                    emailRedirectTo: undefined // No email verification needed
                }
            })

            if (authError) {
                console.error('Supabase signup error:', authError)
                // Better error messages for common issues
                if (authError.message?.includes('already registered') ||
                    authError.message?.includes('already exists') ||
                    authError.message?.includes('User already registered') ||
                    authError.status === 422) {
                    throw new Error('Bu email zaten kayıtlı. Lütfen giriş yapın veya farklı bir email kullanın.')
                }
                if (authError.message?.includes('Password')) {
                    throw new Error('Şifre çok kısa veya geçersiz (minimum 6 karakter)')
                }
                if (authError.message?.includes('email')) {
                    throw new Error('Geçersiz email formatı')
                }
                throw new Error(authError.message || 'Kayıt başarısız. Lütfen tekrar deneyin.')
            }

            if (!authData.user) {
                throw new Error('Kullanıcı oluşturulamadı. Lütfen tekrar deneyin.')
            }

            // Create Miles member record
            const res = await fetch(`${API_BASE}/api/v1/miles/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.trim().toLowerCase(),
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    user_id: authData.user?.id
                })
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: 'Unknown error' }))
                console.error('Miles member creation error:', res.status, errData)

                // Better error messages
                if (errData.error?.includes('already') || errData.error?.includes('exists') || res.status === 409) {
                    throw new Error('Bu email zaten Miles&Smiles üyesi. Lütfen giriş yapın.')
                }
                if (res.status === 400) {
                    throw new Error('Geçersiz bilgiler. Lütfen tüm alanları doldurun.')
                }
                throw new Error(errData.error || 'Miles&Smiles üyeliği oluşturulamadı. Lütfen tekrar deneyin.')
            }

            const memberData = await res.json()

            // Immediately set miles user (no email verification needed)
            setMilesUser(memberData.member)
            setContactEmail(email)

            // Send welcome email
            fetch(`${API_BASE}/api/v1/miles/members/${memberData.member.id}/welcome-email`, {
                method: 'POST'
            }).catch(err => console.error('Failed to send welcome email:', err))

            // Update passenger form
            if (firstName && !passengerForms[0]?.first_name) {
                handlePassengerChange(0, 'first_name', firstName);
            }
            if (lastName && !passengerForms[0]?.last_name) {
                handlePassengerChange(0, 'last_name', lastName);
            }
        } catch (err) {
            console.error('Registration error:', err)
            // Show user-friendly error message
            let errorMessage = err.message || 'Kayıt başarısız. Lütfen tekrar deneyin.'

            // Check for common Supabase errors
            if (err.message?.includes('already') || err.message?.includes('exists') || err.message?.includes('422')) {
                errorMessage = 'Bu email zaten kayıtlı. Lütfen giriş yapın veya farklı bir email kullanın.'
            } else if (err.message?.includes('Password') || err.message?.includes('password')) {
                errorMessage = 'Şifre çok kısa veya geçersiz (minimum 6 karakter)'
            } else if (err.message?.includes('email') || err.message?.includes('Email')) {
                errorMessage = 'Geçersiz email formatı. Lütfen doğru bir email adresi girin.'
            } else if (err.message?.includes('network') || err.message?.includes('fetch')) {
                errorMessage = 'Bağlantı hatası. İnternet bağlantınızı kontrol edin.'
            }

            setError(errorMessage)
        } finally {
            setMilesRegistering(false)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true); setError('')
        try {
            const bookings = [];

            // Helper to create booking data
            const createBookingData = (flightData) => {
                const data = {
                    passengers: passengerForms,
                    contact_email: contactEmail,
                    use_miles: useMiles && bookings.length === 0, // Only use miles for first booking
                    miles_member_id: milesUser?.id || null
                };

                if (flightData.segments && flightData.segments.length > 0) {
                    data.flight_segments = flightData.segments.map(seg => seg.flight_id).filter(id => id);
                } else {
                    data.flight_id = flightData.id;
                }
                return data;
            };

            // Book outbound flight
            const outboundData = createBookingData(flight);
            console.log('📤 Booking outbound:', {
                hasFlightId: !!outboundData.flight_id,
                hasSegments: !!outboundData.flight_segments
            });

            const outboundRes = await fetch(`${API_BASE}/api/v1/tickets/buy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(outboundData)
            });

            if (!outboundRes.ok) {
                const errorData = await outboundRes.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || 'Outbound booking failed');
            }

            const outboundResult = await outboundRes.json();
            bookings.push(outboundResult.booking);
            console.log('✅ Outbound booked:', outboundResult.booking?.booking_reference);

            // Book return flight if round-trip
            if (isRoundTrip && flight.returnFlight) {
                const returnData = createBookingData(flight.returnFlight);
                console.log('📤 Booking return:', {
                    hasFlightId: !!returnData.flight_id,
                    hasSegments: !!returnData.flight_segments
                });

                const returnRes = await fetch(`${API_BASE}/api/v1/tickets/buy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(returnData)
                });

                if (!returnRes.ok) {
                    const errorData = await returnRes.json().catch(() => ({ error: 'Unknown error' }));
                    throw new Error(errorData.error || 'Return booking failed');
                }

                const returnResult = await returnRes.json();
                bookings.push(returnResult.booking);
                console.log('✅ Return booked:', returnResult.booking?.booking_reference);
            }

            // Set result with both bookings for round-trip
            setBookingResult(isRoundTrip ? {
                booking_reference: `${bookings[0]?.booking_reference} / ${bookings[1]?.booking_reference}`,
                outbound: bookings[0],
                return: bookings[1],
                isRoundTrip: true
            } : bookings[0]);

            setStep('success')
        } catch (err) {
            console.error('❌ Booking error:', err);
            setError(err.message || 'Failed to create booking. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{step === 'success' ? '✅ Booking Confirmed' : '✈️ Complete Booking'}</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>
                <div className="modal-body">
                    {step === 'success' ? (
                        <div className="booking-success">
                            <div className="icon">🎉</div>
                            <h3>Thank you!</h3>
                            <div className="booking-reference">{bookingResult?.booking_reference}</div>
                            <p>Confirmation sent to {contactEmail}</p>
                            {milesUser && milesToEarn > 0 && !useMiles && (
                                <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '15px', borderRadius: '10px', margin: '15px 0', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Miles&Smiles Points Earned</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>+{milesToEarn} Miles</div>
                                    <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '5px' }}>✅ Points credited immediately!</div>
                                </div>
                            )}
                            <button className="btn btn-primary" onClick={onClose}>Done</button>
                        </div>
                    ) : (
                        <>
                            {/* Miles&Smiles Section */}
                            {/* Miles&Smiles member info - only show if already a member */}
                            {milesUser && (
                                <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                        <div>
                                            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Miles&Smiles Member</div>
                                            <div style={{ fontWeight: 'bold' }}>🎯 {milesUser.member_number}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Balance</div>
                                            <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{milesUser.total_points?.toLocaleString()} pts</div>
                                        </div>
                                    </div>
                                    {canUseMiles && (
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.2)', padding: '10px', borderRadius: '8px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={useMiles} onChange={e => setUseMiles(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                                            <span>Pay with {pointsNeeded.toLocaleString()} miles (save ${totalPrice.toFixed(2)})</span>
                                        </label>
                                    )}
                                    {!useMiles && (
                                        <div style={{ marginTop: '10px', fontSize: '0.85rem', opacity: 0.9 }}>
                                            ✨ You'll earn <strong>+{milesToEarn} miles</strong> from this booking
                                        </div>
                                    )}
                                </div>
                            )}
                            {error && <div className="alert alert-error">{error}</div>}
                            <form onSubmit={handleSubmit}>
                                {passengerForms.map((p, i) => (
                                    <div key={i} className="passenger-form">
                                        <h3>👤 Passenger {i + 1}</h3>
                                        <div className="gender-options">
                                            <label><input type="radio" name={`g${i}`} value="Mr" checked={p.gender === 'Mr'} onChange={e => handlePassengerChange(i, 'gender', e.target.value)} /> Mr.</label>
                                            <label><input type="radio" name={`g${i}`} value="Ms" checked={p.gender === 'Ms'} onChange={e => handlePassengerChange(i, 'gender', e.target.value)} /> Ms.</label>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group"><label>First Name</label><input type="text" value={p.first_name} onChange={e => handlePassengerChange(i, 'first_name', e.target.value)} required /></div>
                                            <div className="form-group"><label>Last Name</label><input type="text" value={p.last_name} onChange={e => handlePassengerChange(i, 'last_name', e.target.value)} required /></div>
                                        </div>
                                    </div>
                                ))}
                                <div className="form-group"><label>Contact Email</label><input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} required /></div>

                                {/* Miles&Smiles Registration - Simple button approach */}
                                {!milesUser && (
                                    <div style={{ marginTop: '15px' }}>
                                        {!wantMilesMembership ? (
                                            <button
                                                type="button"
                                                onClick={() => setWantMilesMembership(true)}
                                                style={{
                                                    width: '100%',
                                                    padding: '14px',
                                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    fontSize: '1rem',
                                                    fontWeight: 'bold',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '8px'
                                                }}
                                            >
                                                🎯 Join Miles&Smiles & Earn {milesToEarn} Miles
                                            </button>
                                        ) : (
                                            <div style={{ border: '2px solid #667eea', padding: '15px', borderRadius: '10px', background: 'linear-gradient(135deg, #f8f9ff 0%, #e8ebff 100%)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                    <span style={{ fontWeight: 'bold', color: '#667eea' }}>🎯 Miles&Smiles Registration</span>
                                                    <button type="button" onClick={() => setWantMilesMembership(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#999' }}>×</button>
                                                </div>
                                                <div style={{ display: 'grid', gap: '10px' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="First Name"
                                                        value={milesForm.firstName || passengerForms[0]?.first_name || ''}
                                                        onChange={e => setMilesForm({ ...milesForm, firstName: e.target.value })}
                                                        style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem' }}
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Last Name"
                                                        value={milesForm.lastName || passengerForms[0]?.last_name || ''}
                                                        onChange={e => setMilesForm({ ...milesForm, lastName: e.target.value })}
                                                        style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem' }}
                                                    />
                                                    <input
                                                        type="email"
                                                        placeholder="Email Address"
                                                        value={milesForm.email || contactEmail || ''}
                                                        onChange={e => setMilesForm({ ...milesForm, email: e.target.value })}
                                                        style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem' }}
                                                    />
                                                    <input
                                                        type="password"
                                                        placeholder="Create Password (min 6 chars)"
                                                        value={milesForm.password}
                                                        onChange={e => setMilesForm({ ...milesForm, password: e.target.value })}
                                                        style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '1rem' }}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={handleMilesRegister}
                                                        disabled={milesRegistering || !milesForm.email || milesForm.password.length < 6}
                                                        style={{
                                                            background: (milesForm.email && milesForm.password.length >= 6) ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#ccc',
                                                            color: 'white',
                                                            padding: '14px',
                                                            borderRadius: '6px',
                                                            border: 'none',
                                                            cursor: (milesForm.email && milesForm.password.length >= 6) ? 'pointer' : 'not-allowed',
                                                            fontWeight: 'bold',
                                                            fontSize: '1rem'
                                                        }}
                                                    >
                                                        {milesRegistering ? '⏳ Registering...' : '✓ Register & Earn Miles'}
                                                    </button>
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '10px', textAlign: 'center' }}>
                                                    ✨ You'll earn <strong>{milesToEarn} miles</strong> from this flight!
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="booking-summary">
                                    {isRoundTrip && (
                                        <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '10px', borderRadius: '8px', marginBottom: '15px', textAlign: 'center', fontWeight: 'bold' }}>
                                            ✈️ Round Trip Booking
                                        </div>
                                    )}

                                    {/* Outbound flight */}
                                    <div className="summary-row">
                                        <span>{isRoundTrip ? '🛫 Outbound' : 'Route'}</span>
                                        <span>
                                            {flight.segments && flight.segments.length > 0
                                                ? flight.segments.map((s, i) => `${s.origin?.code} → ${s.destination?.code}`).join(' → ')
                                                : `${flight.origin?.code} → ${flight.destination?.code}`
                                            }
                                        </span>
                                    </div>
                                    {isRoundTrip && (
                                        <div className="summary-row" style={{ fontSize: '0.875rem', color: '#666' }}>
                                            <span></span>
                                            <span>{flight.flight_number} - ${outboundPrice.toFixed(2)}</span>
                                        </div>
                                    )}

                                    {/* Return flight (round-trip only) */}
                                    {isRoundTrip && (
                                        <>
                                            <div className="summary-row">
                                                <span>🛬 Return</span>
                                                <span>
                                                    {flight.returnFlight.segments && flight.returnFlight.segments.length > 0
                                                        ? flight.returnFlight.segments.map((s, i) => `${s.origin?.code} → ${s.destination?.code}`).join(' → ')
                                                        : `${flight.returnFlight.origin?.code} → ${flight.returnFlight.destination?.code}`
                                                    }
                                                </span>
                                            </div>
                                            <div className="summary-row" style={{ fontSize: '0.875rem', color: '#666' }}>
                                                <span></span>
                                                <span>{flight.returnFlight.flight_number} - ${returnPrice.toFixed(2)}</span>
                                            </div>
                                        </>
                                    )}

                                    {flight.segments && flight.segments.length > 1 && !isRoundTrip && (
                                        <div className="summary-row" style={{ fontSize: '0.875rem', color: '#666' }}>
                                            <span>Type</span>
                                            <span>Connecting ({flight.segments.length} segments)</span>
                                        </div>
                                    )}
                                    <div className="summary-row"><span>Passengers</span><span>{passengers}</span></div>
                                    {milesUser && !useMiles && (
                                        <div className="summary-row" style={{ color: '#667eea' }}>
                                            <span>Miles to Earn</span>
                                            <span>+{milesToEarn} pts</span>
                                        </div>
                                    )}
                                    <div className="summary-row total"><span>Total</span><span>{useMiles ? `${pointsNeeded.toLocaleString()} miles` : `$${totalPrice.toFixed(2)}`}</span></div>
                                </div>
                                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                                    {loading ? 'Processing...' : useMiles ? 'Confirm & Pay with Miles' : 'Confirm & Pay'}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default App
