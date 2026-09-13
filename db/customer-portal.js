/**
 * customer-portal.js
 * Front-end controller for User Portal
 * Dynamically fetches user profile, active parking session, and payment history
 * from PostgreSQL via /api/user/profile.
 */

// Application State
const state = {
    user: null,
    activeSession: null,
    paymentHistory: [],
    loading: true,
    error: null
};

let sessionCountdownInterval = null;
let pendingPhotoBase64 = null;

document.addEventListener('DOMContentLoaded', () => {
    initPortal();
});

function initPortal() {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    const token = localStorage.getItem('token');

    // 1. Guard check: Redirect to login if user is unauthenticated
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // 2. Instant Optimistic Render from cached user session (0ms lag)
    try {
        const rawCached = localStorage.getItem('user');
        if (rawCached) {
            const cachedUser = JSON.parse(rawCached);
            state.user = {
                firstName: cachedUser.firstName || cachedUser.firstname || 'Driver',
                lastName: cachedUser.lastName || cachedUser.lastname || '',
                email: cachedUser.email || '',
                mobileNumber: cachedUser.mobileNumber || cachedUser.mobilenumber || '',
                carRegistration: cachedUser.carRegistration || cachedUser.carregistration || '',
                profilePhoto: cachedUser.profilePhoto || cachedUser.profilephoto || null,
                role: cachedUser.role || 'customer',
                freeParkingDuration: cachedUser.freeParkingDuration || cachedUser.freeparkingduration || 30,
                dailyChargeLimit: cachedUser.dailyChargeLimit || cachedUser.dailychargelimit || 100.00,
                loyaltyLevel: cachedUser.loyaltyLevel || 'Standard'
            };
            renderUI();
            setLoading(false); // Skip blocking overlay when cached data is ready!
        }
    } catch (e) {
        console.warn('Could not parse cached user:', e);
    }

    // 3. Initialize session expiration tracking and inactivity detection
    if (window.SessionManager) {
        window.SessionManager.init();
    }

    // 4. Fetch authenticated user data from backend for real-time sync
    fetchUserData();
}

/**
 * Determines the correct API base URL.
 * Automatically targets port 3000 if running from a separate dev server (e.g. Live Server port 5500).
 */
const getApiUrl = (endpoint) => {
    const isLiveServer = window.location.port && window.location.port !== '3000' && window.location.protocol.startsWith('http');
    if (isLiveServer) {
        return `http://localhost:3000${endpoint}`;
    }
    return endpoint;
};

/**
 * Fetches dynamic user data from PostgreSQL via /api/customer/profile (or /api/user/profile)
 */
async function fetchUserData() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    setLoading(true);
    setError(null);

    const targetUrl = getApiUrl('/api/customer/profile');
    console.log(`[PORTAL] Fetching customer details from: ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // Handle session expiration / unauthorized access
        if (response.status === 401 || response.status === 403) {
            console.warn('[PORTAL] Authentication rejected (status ' + response.status + '). Redirecting to login.');
            if (window.SessionManager) {
                window.SessionManager.logout('expired');
            } else {
                localStorage.removeItem('token');
                localStorage.removeItem('role');
                localStorage.removeItem('user');
                window.location.href = 'login.html?expired=1';
            }
            return;
        }

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Unable to retrieve user record from database.');
        }

        const rawUser = data.user;

        // Normalize user record fields (handling both camelCase from our query and lowercase postgres fallbacks)
        state.user = {
            id: rawUser.id || rawUser.customerid,
            firstName: rawUser.firstName || rawUser.firstname || '',
            lastName: rawUser.lastName || rawUser.lastname || '',
            email: rawUser.email || '',
            mobileNumber: rawUser.mobileNumber || rawUser.mobilenumber || '',
            carRegistration: rawUser.carRegistration || rawUser.carregistration || '',
            profilePhoto: rawUser.profilePhoto || rawUser.profilephoto || null,
            role: rawUser.role || 'customer',
            freeParkingDuration: rawUser.freeParkingDuration || rawUser.freeparkingduration || 30,
            dailyChargeLimit: rawUser.dailyChargeLimit || rawUser.dailychargelimit || 100.00,
            loyaltyLevel: rawUser.loyaltyLevel || 'Standard'
        };

        state.activeSession = rawUser.activeSession || null;
        state.paymentHistory = Array.isArray(rawUser.paymentHistory) ? rawUser.paymentHistory : [];

        // Update UI with retrieved data
        renderUI();
        setLoading(false);

    } catch (err) {
        console.error('Error in fetchUserData:', err);
        setError(err.message || 'Failed to connect to backend server.');
        setLoading(false);
    }
}

/**
 * Manages loading state and UI indicators
 */
function setLoading(isLoading) {
    state.loading = isLoading;
    const overlay = document.getElementById('portalLoadingOverlay');
    if (overlay) {
        if (isLoading && !state.user) {
            overlay.classList.remove('opacity-0', 'pointer-events-none', 'hidden');
        } else {
            overlay.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => overlay.classList.add('hidden'), 250);
        }
    }
}

/**
 * Displays or clears global error banner
 */
function setError(errorMessage) {
    state.error = errorMessage;
    const banner = document.getElementById('portalErrorBanner');
    const msgEl = document.getElementById('portalErrorMessage');

    if (banner) {
        if (errorMessage) {
            if (msgEl) msgEl.textContent = errorMessage;
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    }
}

/**
 * Populates all UI components with actual PostgreSQL data
 */
function renderUI() {
    const user = state.user;
    if (!user) return;

    const fullName = `${user.firstName} ${user.lastName}`.trim() || 'Valued Customer';
    const initials = ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase() || 'CP';

    // 1. Navbar & Welcome Greetings
    const welcomeEl = document.getElementById('welcomeUserName');
    if (welcomeEl) welcomeEl.textContent = user.firstName || fullName;

    // Badges
    const roleBadge = document.getElementById('roleBadge');
    if (roleBadge) roleBadge.textContent = user.role.toUpperCase();

    const loyaltyBadge = document.getElementById('loyaltyBadge');
    if (loyaltyBadge) loyaltyBadge.textContent = user.loyaltyLevel;

    // 2. Profile Summary Sidebar Card
    const namePreview = document.getElementById('profileNamePreview');
    if (namePreview) namePreview.textContent = fullName;

    const emailPreview = document.getElementById('profileEmailPreview');
    if (emailPreview) emailPreview.textContent = user.email || 'No email registered';

    const phonePreview = document.getElementById('profilePhonePreview');
    if (phonePreview) phonePreview.textContent = user.mobileNumber || 'No mobile registered';

    const carRegPreview = document.getElementById('profileCarRegistrationPreview');
    if (carRegPreview) carRegPreview.textContent = user.carRegistration || 'Not registered';

    // Update Profile Avatars (Sidebar & Form)
    ['sidebarPhotoContainer', 'profilePhotoContainer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (user.profilePhoto) {
                el.innerHTML = `<img src="${user.profilePhoto}" alt="${fullName}" class="w-full h-full object-cover">`;
            } else {
                el.innerHTML = `<span>${initials}</span>`;
            }
        }
    });

    // 3. Free Parking Duration Quick Stat
    const freeDurationEl = document.getElementById('freeParkingDurationDisplay');
    if (freeDurationEl) freeDurationEl.textContent = user.freeParkingDuration;

    // 4. Current Parking Session
    renderActiveSession(state.activeSession, user);

    // 5. Payment Section License Plate
    const payPlate = document.getElementById('paymentLicensePlate');
    if (payPlate) payPlate.textContent = user.carRegistration || 'None registered';

    // 6. Payment History Table
    renderPaymentHistory(state.paymentHistory);

    // 7. Profile Edit Form Pre-population
    populateProfileForm(user);
}

/**
 * Renders the active parking session or empty state
 */
function renderActiveSession(session, user) {
    const badgeEl = document.getElementById('sessionBadge');
    const locationEl = document.getElementById('sessionLocation');
    const plateEl = document.getElementById('sessionPlate');
    const remainingTimeEl = document.getElementById('remainingTime');
    const entryTimeText = document.getElementById('sessionEntryTimeText');
    const extendBtn = document.getElementById('extendTimeBtn');

    if (sessionCountdownInterval) {
        clearInterval(sessionCountdownInterval);
        sessionCountdownInterval = null;
    }

    if (session) {
        // Active session found
        if (badgeEl) {
            badgeEl.className = "bg-green-500/10 text-green-400 px-3 py-1 rounded-full text-xs font-bold border border-green-500/20";
            badgeEl.innerHTML = '<i class="fas fa-circle text-[8px] mr-1"></i>ACTIVE';
        }
        if (locationEl) locationEl.textContent = session.location || 'Facility Gate A';
        if (plateEl) plateEl.textContent = session.carRegistration || user.carRegistration || 'N/A';
        if (extendBtn) extendBtn.disabled = false;

        // Format entry time
        if (entryTimeText && session.entryTime) {
            const entryDate = new Date(session.entryTime);
            entryTimeText.textContent = `Entry: ${entryDate.toLocaleDateString()} at ${entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }

        // Countdown logic based on timeout or free duration
        let targetExpiry;
        if (session.sessionTimeout) {
            targetExpiry = new Date(session.sessionTimeout).getTime();
        } else if (session.entryTime) {
            targetExpiry = new Date(session.entryTime).getTime() + (user.freeParkingDuration * 60 * 1000);
        } else {
            targetExpiry = Date.now() + (30 * 60 * 1000);
        }

        const updateCountdown = () => {
            const now = Date.now();
            const diff = Math.max(0, Math.floor((targetExpiry - now) / 1000));
            const hrs = Math.floor(diff / 3600);
            const mins = Math.floor((diff % 3600) / 60);
            const secs = diff % 60;

            if (remainingTimeEl) {
                if (hrs > 0) {
                    remainingTimeEl.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                } else {
                    remainingTimeEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                }
                if (diff <= 300) { // 5 minutes warning
                    remainingTimeEl.className = "text-3xl font-mono font-bold text-red-500 animate-pulse";
                } else {
                    remainingTimeEl.className = "text-3xl font-mono font-bold text-[#4f8ef7]";
                }
            }

            if (diff <= 0 && sessionCountdownInterval) {
                clearInterval(sessionCountdownInterval);
                if (remainingTimeEl) remainingTimeEl.textContent = "00:00 (Overstay)";
            }
        };

        updateCountdown();
        sessionCountdownInterval = setInterval(updateCountdown, 1000);

    } else {
        // No active session
        if (badgeEl) {
            badgeEl.className = "bg-gray-500/10 text-gray-400 px-3 py-1 rounded-full text-xs font-bold border border-gray-500/20";
            badgeEl.innerHTML = '<i class="fas fa-minus-circle text-[8px] mr-1"></i>INACTIVE';
        }
        if (locationEl) locationEl.textContent = 'No active parking session';
        if (plateEl) plateEl.textContent = user.carRegistration || 'No vehicle registered';
        if (remainingTimeEl) {
            remainingTimeEl.textContent = '--:--';
            remainingTimeEl.className = "text-3xl font-mono font-bold text-[#6b7280]";
        }
        if (entryTimeText) entryTimeText.textContent = 'Vehicle is not currently logged in parking';
        if (extendBtn) extendBtn.disabled = true;
    }
}

/**
 * Renders dynamically fetched payment records into the history table
 */
function renderPaymentHistory(payments) {
    const tbody = document.getElementById('paymentHistoryBody');
    if (!tbody) return;

    if (!payments || payments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="p-8 text-center text-gray-400">
                    <i class="fas fa-receipt text-2xl mb-2 block text-gray-500"></i>
                    No previous payment records found for this account.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = payments.map(p => {
        const dateStr = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'Recent';
        const formattedAmount = 'R' + parseFloat(p.amount || 0).toFixed(2);
        const status = (p.status || 'Completed').toUpperCase();
        const isPaid = status === 'COMPLETED' || status === 'PAID';

        return `
            <tr class="border-b border-[#2a3040] hover:bg-[#1f2430]/40 transition">
                <td class="p-3.5 text-gray-300 font-mono text-xs">${dateStr}</td>
                <td class="p-3.5 text-white font-medium">Parking - ${p.location || 'Facility Charge'}</td>
                <td class="p-3.5 font-bold text-white font-mono">${formattedAmount}</td>
                <td class="p-3.5">
                    <span class="${isPaid ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'} px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center">
                        <i class="fas fa-${isPaid ? 'check-circle' : 'clock'} mr-1 text-[10px]"></i>${status}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Pre-populates the profile editing form fields
 */
function populateProfileForm(user) {
    const fields = {
        'firstName': user.firstName,
        'lastName': user.lastName,
        'email': user.email,
        'mobileNumber': user.mobileNumber,
        'carRegistration': user.carRegistration
    };

    for (const [id, value] of Object.entries(fields)) {
        const input = document.getElementById(id);
        if (input) input.value = value || '';
    }
}

/**
 * Handles avatar file selection with preview
 */
function handlePhotoSelect(input) {
    const file = input.files[0];
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            alert('Selected image exceeds the 2MB size limit.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            pendingPhotoBase64 = e.target.result;
            const container = document.getElementById('profilePhotoContainer');
            if (container) {
                container.innerHTML = `<img src="${pendingPhotoBase64}" class="w-full h-full object-cover">`;
            }
        };
        reader.readAsDataURL(file);
    }
}

/**
 * Saves profile updates to PostgreSQL via PUT /api/user/profile
 */
async function saveProfile(event) {
    event.preventDefault();
    const token = localStorage.getItem('token');

    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const mobileNumber = document.getElementById('mobileNumber').value.trim();
    const carRegistration = document.getElementById('carRegistration').value.trim();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalBtnContent = submitBtn ? submitBtn.innerHTML : 'Save Changes';

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...';
    }

    // 1. Update password if provided
    if (currentPassword || newPassword) {
        if (!currentPassword || !newPassword) {
            alert('Please provide both current and new passwords.');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnContent;
            }
            return;
        }

        try {
            const pwdRes = await fetch('/api/auth/change-password', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            if (!pwdRes.ok) {
                const pwdData = await pwdRes.json();
                alert(pwdData.message || 'Password update failed.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnContent;
                }
                return;
            }
        } catch (pwdErr) {
            console.error('Password change error:', pwdErr);
            alert('An unexpected error occurred while changing password.');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnContent;
            }
            return;
        }
    }

    // 2. Update profile details
    try {
        const payload = {
            firstName,
            lastName,
            mobileNumber,
            carRegistration
        };

        if (pendingPhotoBase64) {
            payload.profilePhoto = pendingPhotoBase64;
        }

        const response = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            pendingPhotoBase64 = null;

            // Clear password inputs
            if (document.getElementById('currentPassword')) document.getElementById('currentPassword').value = '';
            if (document.getElementById('newPassword')) document.getElementById('newPassword').value = '';

            // Update local state with saved user
            state.user = {
                ...state.user,
                ...result.user
            };

            renderUI();
            if (typeof window.showToast === 'function') {
                window.showToast('Profile updated successfully!', 'success');
            } else if (typeof showToast === 'function') {
                showToast('Profile updated successfully!');
            }
            setTimeout(() => showSection('dashboard'), 800);
        } else {
            const err = result.message || 'Failed to update profile.';
            if (typeof window.showToast === 'function') {
                window.showToast(err, 'error');
            } else {
                alert(err);
            }
        }
    } catch (err) {
        console.error('Profile save error:', err);
        const netErr = 'Server communication error while saving profile.';
        if (typeof window.showToast === 'function') {
            window.showToast(netErr, 'error');
        } else {
            alert(netErr);
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnContent;
        }
    }
}

/**
 * ============================================================================
 * SessionManager
 * ============================================================================
 * Comprehensive client-side session monitoring & extension architecture:
 * 1. Tracks active JWT token expiration claims (`exp`) and live idle duration.
 * 2. Monitors DOM events (mouse, keyboard, touch, scroll) for user inactivity.
 * 3. Drives the live navbar countdown and status dot (emerald -> amber -> red).
 * 4. Displays the Session Expiring warning modal when <= 120 seconds remain.
 * 5. Handles seamless asynchronous session extension via /api/auth/extend-session
 *    without reloading the page or losing current form / portal state.
 * 6. Safely handles absolute expiration with automatic redirect to login.html?expired=1.
 */
const SessionManager = {
    checkInterval: null,
    lastActivityTime: Date.now(),
    sessionExpiresAt: null,
    warningModalOpen: false,
    INACTIVITY_TIMEOUT_MS: 15 * 60 * 1000, // 15 minutes max idle before forcing prompt
    WARNING_THRESHOLD_SEC: 120,             // Alert user when 2 minutes (120s) remain

    init() {
        const token = localStorage.getItem('token');
        if (!token) return;

        this.parseExpirationFromToken(token);
        this.setupActivityListeners();
        this.startSessionTimer();

        console.log('[SESSION] SessionManager active. Current expiry target:', new Date(this.sessionExpiresAt).toLocaleTimeString());
    },

    /**
     * Decodes the JWT token payload without external libraries to read the expiration timestamp.
     */
    parseExpirationFromToken(token) {
        try {
            const parts = token.split('.');
            if (parts.length === 3) {
                const base64Url = parts[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const jsonPayload = decodeURIComponent(
                    atob(base64)
                        .split('')
                        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                        .join('')
                );
                const decoded = JSON.parse(jsonPayload);
                if (decoded && decoded.exp) {
                    this.sessionExpiresAt = decoded.exp * 1000;
                    return;
                }
            }
        } catch (err) {
            console.warn('[SESSION] Could not parse JWT exp claim, using 2h default:', err);
        }

        // Fallback: 2 hours from current timestamp
        this.sessionExpiresAt = Date.now() + 2 * 60 * 60 * 1000;
    },

    /**
     * Attaches throttled event listeners across the document to detect user interaction.
     */
    setupActivityListeners() {
        const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
        let throttleTimer = null;

        const recordActivity = () => {
            if (throttleTimer) return;
            throttleTimer = setTimeout(() => {
                throttleTimer = null;
            }, 2500); // Throttled to once every 2.5s to preserve CPU performance

            this.lastActivityTime = Date.now();
        };

        events.forEach(eventName => {
            window.addEventListener(eventName, recordActivity, { passive: true });
        });
    },

    /**
     * Starts the 1-second interval loop evaluating session health.
     */
    startSessionTimer() {
        if (this.checkInterval) clearInterval(this.checkInterval);

        this.updateDisplays();
        this.checkInterval = setInterval(() => {
            this.tick();
        }, 1000);
    },

    /**
     * Periodic check invoked every second.
     */
    tick() {
        const now = Date.now();
        const tokenRemainingSec = Math.max(0, Math.floor((this.sessionExpiresAt - now) / 1000));
        const idleDurationMs = now - this.lastActivityTime;
        const idleRemainingSec = Math.max(0, Math.floor((this.INACTIVITY_TIMEOUT_MS - idleDurationMs) / 1000));

        // Effective remaining time is bounded by token expiration and idle timeout
        const effectiveRemainingSec = Math.min(tokenRemainingSec, idleRemainingSec);

        this.updateDisplays(effectiveRemainingSec);

        // Absolute expiration reached
        if (effectiveRemainingSec <= 0) {
            console.warn('[SESSION] Session validity reached 0. Redirecting to login.');
            this.logout('expired');
            return;
        }

        // Warning threshold reached (<= 120s)
        if (effectiveRemainingSec <= this.WARNING_THRESHOLD_SEC) {
            this.showWarningModal(effectiveRemainingSec);
        } else if (this.warningModalOpen) {
            // User interacted and reset idle timer past warning threshold
            this.hideWarningModal();
        }
    },

    /**
     * Formats seconds into MM:SS (or HH:MM:SS)
     */
    formatTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;

        if (hours > 0) {
            return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    },

    /**
     * Updates all session status UI elements across the portal.
     */
    updateDisplays(remainingSec) {
        if (remainingSec === undefined) {
            remainingSec = Math.max(0, Math.floor((this.sessionExpiresAt - Date.now()) / 1000));
        }

        const formatted = this.formatTime(remainingSec);

        // Navbar desktop countdown
        const navCountdown = document.getElementById('navSessionCountdown');
        if (navCountdown) {
            navCountdown.textContent = formatted;
            if (remainingSec <= 60) {
                navCountdown.className = "font-mono font-bold text-red-500 animate-pulse";
            } else if (remainingSec <= this.WARNING_THRESHOLD_SEC) {
                navCountdown.className = "font-mono font-bold text-amber-400";
            } else {
                navCountdown.className = "font-mono font-bold text-emerald-400";
            }
        }

        // Navbar mobile countdown
        const navMobile = document.getElementById('navSessionCountdownMobile');
        if (navMobile) navMobile.textContent = formatted;

        // Pulse dot styling
        const dot = document.getElementById('sessionStatusDot');
        if (dot) {
            if (remainingSec <= 60) {
                dot.className = "w-2 h-2 rounded-full bg-red-500 animate-ping";
            } else if (remainingSec <= this.WARNING_THRESHOLD_SEC) {
                dot.className = "w-2 h-2 rounded-full bg-amber-400 animate-pulse";
            } else {
                dot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-pulse";
            }
        }

        // Warning modal countdown
        const modalCountdown = document.getElementById('sessionExpiryCountdown');
        if (modalCountdown) {
            modalCountdown.textContent = formatted;
            if (remainingSec <= 30) {
                modalCountdown.className = "text-4xl font-mono font-bold text-red-500 animate-pulse";
            } else {
                modalCountdown.className = "text-4xl font-mono font-bold text-amber-400";
            }
        }
    },

    showWarningModal(remainingSec) {
        this.warningModalOpen = true;
        const modal = document.getElementById('sessionWarningModal');
        if (modal && !modal.classList.contains('active')) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            console.log('[SESSION] Inactivity warning modal activated (remaining: ' + remainingSec + 's)');
        }
    },

    hideWarningModal() {
        this.warningModalOpen = false;
        const modal = document.getElementById('sessionWarningModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    },

    /**
     * Calls backend /api/auth/extend-session to refresh JWT and DB lastlogin.
     * Preserves all user view state, tab position, and unsaved form data.
     */
    async extendSession() {
        const token = localStorage.getItem('token');
        if (!token) {
            this.logout('expired');
            return;
        }

        const modalBtn = document.getElementById('extendSessionModalBtn');
        let originalText = '';
        if (modalBtn) {
            originalText = modalBtn.innerHTML;
            modalBtn.disabled = true;
            modalBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Extending...';
        }

        // 1. Instant Optimistic UI Update (0ms delay)
        const previousExpiry = this.sessionExpiresAt;
        this.sessionExpiresAt = Date.now() + 2 * 60 * 60 * 1000;
        this.lastActivityTime = Date.now();
        this.hideWarningModal();
        this.updateDisplays();
        if (typeof window.showToast === 'function') {
            window.showToast('Session extended (+2 hrs added)!', 'success');
        }

        try {
            console.log('[SESSION] Contacting backend to extend session...');
            const endpoint = typeof getApiUrl === 'function' ? getApiUrl('/api/auth/extend-session') : '/api/auth/extend-session';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (response.ok && data.success) {
                if (data.token) {
                    localStorage.setItem('token', data.token);
                }
                if (data.expiresAt) {
                    this.sessionExpiresAt = data.expiresAt;
                }
                this.updateDisplays();
                console.log('[SESSION] Extended successfully on server. New expiry:', new Date(this.sessionExpiresAt).toLocaleTimeString());
            } else {
                this.sessionExpiresAt = previousExpiry;
                this.updateDisplays();
                throw new Error(data.message || 'Session extension denied by server.');
            }

        } catch (err) {
            console.error('[SESSION ERROR] Extension failed:', err);
            if (typeof window.showToast === 'function') {
                window.showToast('Could not extend session: ' + err.message, 'error');
            }
            if (err.message.includes('expired') || err.message.includes('Access denied')) {
                setTimeout(() => this.logout('expired'), 1200);
            }
        } finally {
            if (modalBtn) {
                modalBtn.disabled = false;
                modalBtn.innerHTML = originalText;
            }
        }
    },

    /**
     * Clears local storage and redirects safely.
     */
    logout(reason = 'manual') {
        if (this.checkInterval) clearInterval(this.checkInterval);

        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('user');

        if (reason === 'expired') {
            window.location.href = 'login.html?expired=1';
        } else {
            window.location.href = 'login.html';
        }
    }
};

window.SessionManager = SessionManager;
window.state = state;
window.renderActiveSession = renderActiveSession;
window.fetchUserData = fetchUserData;
