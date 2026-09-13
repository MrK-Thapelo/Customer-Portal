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
     * Displays a styled feedback message.
     */
    const showMessage = (msg, type = 'error') => {
        if (!messageDiv) return;

        if (!msg) {
            messageDiv.innerHTML = '';
            messageDiv.className = 'mt-4 text-center text-sm font-medium min-h-[1.25rem] hidden';
            return;
        }

        const isError = type === 'error';
        messageDiv.className = `mt-4 p-3 rounded-xl text-sm font-medium flex items-center justify-center space-x-2 ${
            isError 
                ? 'bg-red-500/10 text-red-400 border border-red-500/30' 
                : 'bg-green-500/10 text-green-400 border border-green-500/30'
        }`;

        messageDiv.innerHTML = `
            <i class="fas fa-${isError ? 'exclamation-circle' : 'check-circle'} text-base mr-1.5 flex-shrink-0"></i>
            <span>${msg}</span>
        `;
    };

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