/**
 * login.js
 * Front-end authentication handler
 * Handles asynchronous login, credential verification, state persistence, and role redirection.
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('[LOGIN] Script initialized and ready.');

    const loginForm = document.getElementById('loginForm');
    const identifierInput = document.getElementById('identifier');
    const passwordInput = document.getElementById('password');
    const messageDiv = document.getElementById('message');
    const submitBtn = document.getElementById('submitBtn') || loginForm?.querySelector('button[type="submit"]');

    // Automatically redirect if user already has a valid token session
    const existingToken = localStorage.getItem('token');
    const existingRole = localStorage.getItem('role');
    if (existingToken) {
        console.log('[LOGIN] Existing session detected for role:', existingRole);
        // User can still choose to sign in as another user, but session is available
    }

    /**
     * Determines the correct API base URL.
     * If running from a dev server (e.g. Live Server port 5500), points to port 3000.
     */
    const getApiUrl = (endpoint) => {
        const isLiveServer = window.location.port && window.location.port !== '3000' && window.location.protocol.startsWith('http');
        if (isLiveServer) {
            return `http://localhost:3000${endpoint}`;
        }
        return endpoint;
    };

    /**
     * Displays a styled feedback message and triggers toast notification.
     */
    const showMessage = (msg, type = 'error') => {
        if (!messageDiv) return;

        if (!msg) {
            messageDiv.innerHTML = '';
            messageDiv.className = 'mt-4 text-center text-sm font-medium min-h-[1.25rem] hidden';
            return;
        }

        const isError = type === 'error';
        const isSuccess = type === 'success';

        messageDiv.className = `mt-4 p-3.5 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-between gap-2 transition-all duration-300 animate-fadeIn ${
            isError 
                ? 'bg-red-500/10 text-red-400 border border-red-500/30 shadow-lg shadow-red-500/5' 
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/5'
        }`;

        messageDiv.innerHTML = `
            <div class="flex items-center space-x-2 text-left">
                <i class="fas fa-${isError ? 'exclamation-circle text-red-400' : 'check-circle text-emerald-400'} text-base flex-shrink-0"></i>
                <span>${msg}</span>
            </div>
            ${isError && msg.includes('server') ? '<button type="button" onclick="document.getElementById(\'loginForm\')?.requestSubmit()" class="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-bold transition flex-shrink-0">Retry</button>' : ''}
        `;

        if (typeof window.showToast === 'function') {
            window.showToast(msg, isSuccess ? 'success' : 'error');
        }
    };

    // Check if user was redirected due to session expiration or inactivity
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('expired') === '1' || urlParams.get('session') === 'expired') {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('user');
        showMessage('Your session has expired due to inactivity. Please sign in again.', 'error');
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            // CRITICAL: Stop default HTTP form submission to prevent silent page reload
            e.preventDefault();
            console.log('[LOGIN] Form submit event intercepted.');

            const identifier = identifierInput ? identifierInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value : '';

            // 1. Client-side validation
            if (!identifier) {
                showMessage('Please enter your mobile number, car registration, or email.', 'error');
                identifierInput?.focus();
                return;
            }

            if (!password) {
                showMessage('Please enter your password.', 'error');
                passwordInput?.focus();
                return;
            }

            // 2. Loading state: update button and disable form
            const originalBtnContent = submitBtn ? submitBtn.innerHTML : 'Sign In';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `
                    <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Signing In...
                `;
            }
            showMessage(''); // Clear previous errors

            const apiUrl = getApiUrl('/api/auth/login');
            console.log(`[LOGIN] Sending credentials to: ${apiUrl}`);

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ identifier, password })
                });

                console.log(`[LOGIN] Received HTTP status: ${response.status}`);

                let data;
                try {
                    data = await response.json();
                } catch (jsonErr) {
                    console.error('[LOGIN] Failed to parse JSON response:', jsonErr);
                    throw new Error(`Server returned status ${response.status} with non-JSON response.`);
                }

                console.log('[LOGIN] Response payload:', data);

                if (response.ok && data.token) {
                    // 3. Synchronize auth state in localStorage
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('role', data.role || 'customer');
                    if (data.user) {
                        localStorage.setItem('user', JSON.stringify(data.user));
                    }

                    const userRole = (data.role || 'customer').toLowerCase();
                    showMessage(`Authentication successful! Redirecting to ${userRole} portal...`, 'success');

                    // 4. Role-based navigation
                    const targetPage = userRole === 'admin' ? 'admin-dashboard.html' : 'customer-portal.html';
                    console.log(`[LOGIN SUCCESS] Redirecting user to: ${targetPage}`);

                    setTimeout(() => {
                        window.location.href = targetPage;
                    }, 800);

                } else {
                    // Handled rejection from backend (e.g. 400 or 401)
                    const errorMsg = data.message || 'Invalid mobile number, car registration, or password.';
                    console.warn('[LOGIN REJECTED]', errorMsg);
                    showMessage(errorMsg, 'error');

                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnContent;
                    }
                }

            } catch (error) {
                console.error('[LOGIN EXCEPTION]', error);

                let userFriendlyError = 'An unexpected error occurred while contacting the server.';
                if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                    userFriendlyError = 'Cannot reach backend server. Please verify the server is running on port 3000.';
                } else if (error.message) {
                    userFriendlyError = error.message;
                }

                showMessage(userFriendlyError, 'error');

                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnContent;
                }
            }
        });
    } else {
        console.error('[LOGIN ERROR] loginForm element not found in DOM!');
    }
});

// ============================================================================
// DYNAMIC QR CODE LOGIN HANDLER & REAL-TIME POLLING
// ============================================================================
let qrPollInterval = null;
let qrCountdownInterval = null;
let activeQrSessionId = null;
let activeQrToken = null;

function switchLoginMode(mode) {
    const passwordTab = document.getElementById('tabPasswordMode');
    const qrTab = document.getElementById('tabQrMode');
    const loginForm = document.getElementById('loginForm');
    const qrContainer = document.getElementById('qrLoginContainer');

    if (mode === 'qr') {
        if (passwordTab) passwordTab.className = "flex-1 py-2.5 text-xs font-bold rounded-xl text-gray-400 hover:text-white transition flex items-center justify-center gap-2";
        if (qrTab) qrTab.className = "flex-1 py-2.5 text-xs font-bold rounded-xl bg-[#1f2430] text-white shadow transition flex items-center justify-center gap-2";
        if (loginForm) loginForm.classList.add('hidden');
        if (qrContainer) {
            qrContainer.classList.remove('hidden');
            qrContainer.classList.add('animate-fadeIn');
        }
        loadLoginQrCode();
    } else {
        if (qrTab) qrTab.className = "flex-1 py-2.5 text-xs font-bold rounded-xl text-gray-400 hover:text-white transition flex items-center justify-center gap-2";
        if (passwordTab) passwordTab.className = "flex-1 py-2.5 text-xs font-bold rounded-xl bg-[#1f2430] text-white shadow transition flex items-center justify-center gap-2";
        if (qrContainer) qrContainer.classList.add('hidden');
        if (loginForm) {
            loginForm.classList.remove('hidden');
            loginForm.classList.add('animate-fadeIn');
        }
        stopQrPolling();
    }
}

function stopQrPolling() {
    if (qrPollInterval) clearInterval(qrPollInterval);
    if (qrCountdownInterval) clearInterval(qrCountdownInterval);
    qrPollInterval = null;
    qrCountdownInterval = null;
}

async function loadLoginQrCode() {
    stopQrPolling();

    const spinner = document.getElementById('qrLoadingSpinner');
    const qrImg = document.getElementById('loginQrImage');
    const expiredOverlay = document.getElementById('qrExpiredOverlay');
    const statusText = document.getElementById('qrStatusText');
    const countdownEl = document.getElementById('qrCountdown');
    const pulseDot = document.getElementById('qrPulseDot');

    if (spinner) spinner.classList.remove('hidden');
    if (qrImg) qrImg.classList.add('hidden');
    if (expiredOverlay) expiredOverlay.classList.add('hidden');
    if (statusText) statusText.textContent = 'Generating dynamic QR...';
    if (countdownEl) {
        countdownEl.textContent = '02:00';
        countdownEl.className = 'font-mono font-bold text-amber-400';
    }
    if (pulseDot) pulseDot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';

    const getApiUrl = (endpoint) => {
        const isLiveServer = window.location.port && window.location.port !== '3000' && window.location.protocol.startsWith('http');
        return isLiveServer ? `http://localhost:3000${endpoint}` : endpoint;
    };

    try {
        const res = await fetch(getApiUrl('/api/qr/generate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'login', expiresInSeconds: 120 })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.message || 'Failed to initialize QR session.');
        }

        activeQrSessionId = data.sessionId;
        activeQrToken = data.token;

        if (spinner) spinner.classList.add('hidden');
        if (qrImg) {
            qrImg.src = data.qrCodeDataUrl;
            qrImg.classList.remove('hidden');
        }
        if (statusText) statusText.textContent = 'Waiting for scan...';

        // Start Countdown Timer
        let secondsLeft = data.expiresInSeconds || 120;
        qrCountdownInterval = setInterval(() => {
            secondsLeft--;
            const mins = Math.floor(secondsLeft / 60);
            const secs = secondsLeft % 60;
            if (countdownEl) {
                countdownEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                if (secondsLeft <= 30) {
                    countdownEl.className = 'font-mono font-bold text-red-500 animate-pulse';
                }
            }

            if (secondsLeft <= 0) {
                stopQrPolling();
                if (expiredOverlay) expiredOverlay.classList.remove('hidden');
                if (statusText) statusText.textContent = 'QR session expired';
                if (pulseDot) pulseDot.className = 'w-2 h-2 rounded-full bg-red-500';
            }
        }, 1000);

        // Start Status Polling Loop (every 1.5s)
        qrPollInterval = setInterval(async () => {
            if (!activeQrSessionId) return;

            try {
                const pollRes = await fetch(getApiUrl(`/api/qr/status/${activeQrSessionId}`));
                const pollData = await pollRes.json();

                if (pollData.status === 'scanned') {
                    if (statusText) statusText.textContent = 'Device detected! Authorizing...';
                    if (pulseDot) pulseDot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
                } else if (pollData.status === 'completed' && pollData.token) {
                    stopQrPolling();
                    if (statusText) statusText.textContent = 'Authentication successful!';
                    if (pulseDot) pulseDot.className = 'w-2 h-2 rounded-full bg-emerald-400';

                    // Save token & user
                    localStorage.setItem('token', pollData.token);
                    const userRole = (pollData.user?.role || 'customer').toLowerCase();
                    localStorage.setItem('role', userRole);
                    if (pollData.user) {
                        localStorage.setItem('user', JSON.stringify(pollData.user));
                    }

                    // Show visual feedback & redirect
                    const messageDiv = document.getElementById('message');
                    if (messageDiv) {
                        messageDiv.className = 'mt-4 p-3 rounded-xl text-sm font-medium flex items-center justify-center space-x-2 bg-green-500/10 text-green-400 border border-green-500/30';
                        messageDiv.innerHTML = '<i class="fas fa-check-circle text-base mr-1.5"></i><span>QR Login Approved! Redirecting...</span>';
                    }

                    const targetPage = userRole === 'admin' ? 'admin-dashboard.html' : 'customer-portal.html';
                    setTimeout(() => {
                        window.location.href = targetPage;
                    }, 600);
                } else if (pollData.status === 'expired') {
                    stopQrPolling();
                    if (expiredOverlay) expiredOverlay.classList.remove('hidden');
                    if (statusText) statusText.textContent = 'QR session expired';
                }
            } catch (pollErr) {
                console.warn('[QR POLL NOTICE] Minor polling retry:', pollErr.message);
            }
        }, 1500);

    } catch (err) {
        console.error('[QR INIT ERROR]', err);
        if (statusText) statusText.textContent = 'Error loading QR code';
    }
}

async function simulateMobileQrScan() {
    if (!activeQrToken) return;

    const btn = document.getElementById('simulateScanBtn');
    const originalText = btn ? btn.innerHTML : 'Simulate';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Scanning & Approving...';
    }

    const getApiUrl = (endpoint) => {
        const isLiveServer = window.location.port && window.location.port !== '3000' && window.location.protocol.startsWith('http');
        return isLiveServer ? `http://localhost:3000${endpoint}` : endpoint;
    };

    try {
        const res = await fetch(getApiUrl('/api/qr/verify-login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: activeQrToken })
        });

        const data = await res.json();
        console.log('[QR SIMULATOR] Result:', data);
    } catch (e) {
        console.error('[QR SIMULATOR ERROR]', e);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

window.switchLoginMode = switchLoginMode;
window.loadLoginQrCode = loadLoginQrCode;
window.simulateMobileQrScan = simulateMobileQrScan;
