/**
 * admin-dashboard.js
 * Central governance and user management controller for facility admins.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    // 1. Strict Role & Authentication Gate
    if (!token || (role && role.toLowerCase() !== 'admin')) {
        if (typeof window.showToast === 'function') {
            window.showToast('Admin privilege required. Redirecting...', 'warning');
        }
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 500);
        return;
    }

    const tableBody = document.querySelector('#admin-table tbody');
    const statUsers = document.getElementById('statTotalUsers');
    const statVehicles = document.getElementById('statTotalVehicles');
    const statAdmins = document.getElementById('statTotalAdmins');

    try {
        const response = await fetch('/api/auth/users', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            const users = await response.json();

            // Update Metric Stat Counters
            if (statUsers) statUsers.textContent = users.length;
            if (statVehicles) statVehicles.textContent = users.filter(u => u.carregistration && u.carregistration.trim()).length;
            if (statAdmins) statAdmins.textContent = users.filter(u => (u.role || '').toLowerCase() === 'admin').length;

            if (!tableBody) return;
            tableBody.innerHTML = ''; // Clear skeleton loading rows

            // Handle empty users state
            if (!users || users.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-6 py-16 text-center text-gray-400">
                            <div class="max-w-sm mx-auto">
                                <i class="fas fa-users-slash text-4xl mb-3 block text-gray-600"></i>
                                <p class="text-base font-bold text-white mb-1">No Registered Accounts</p>
                                <p class="text-xs text-gray-500">There are currently no registered customer or admin accounts in the database.</p>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }

            // Render user rows
            users.forEach(user => {
                const row = document.createElement('tr');
                row.className = 'border-b border-[#2a3040]/70 hover:bg-[#1f2430]/50 transition-colors';
                
                const first = user.firstname || 'User';
                const last = user.lastname || '';
                const initials = ((first[0] || '') + (last[0] || '')).toUpperCase() || 'U';
                const isAdmin = (user.role || '').toLowerCase() === 'admin';
                const phone = user.mobilenumber || 'Not provided';
                const plate = user.carregistration || 'None';

                row.innerHTML = `
                    <td class="px-6 py-4 flex items-center space-x-3">
                        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4f8ef7] to-[#7c3aed] flex items-center justify-center text-xs font-bold text-white shadow-md shadow-blue-500/10 flex-shrink-0">
                            ${initials}
                        </div>
                        <div>
                            <span class="font-bold text-white block text-sm">${first} ${last}</span>
                            <span class="text-[11px] text-gray-500">${user.email || 'No email registered'}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="text-gray-300 font-mono text-xs">${phone}</span>
                    </td>
                    <td class="px-6 py-4">
                        ${plate !== 'None' 
                            ? `<span class="bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold">${plate}</span>`
                            : `<span class="text-gray-500 text-xs italic">Unassigned</span>`
                        }
                    </td>
                    <td class="px-6 py-4">
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1.5 ${
                            isAdmin 
                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' 
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                        }">
                            <i class="fas ${isAdmin ? 'fa-shield-alt text-[9px]' : 'fa-user text-[9px]'}"></i>
                            ${(user.role || 'customer').toUpperCase()}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <button type="button" onclick="inspectUser('${user.customerid || user.id}', '${first} ${last}')" class="px-3 py-1.5 rounded-lg bg-[#1f2430] border border-[#2a3040] hover:border-[#4f8ef7] text-gray-300 hover:text-white transition text-xs font-semibold">
                            Details
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });

        } else {
            if (response.status === 403 || response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('role');
                window.location.href = 'login.html?session=expired';
                return;
            }
            throw new Error(`Server returned HTTP status ${response.status}`);
        }
    } catch (error) {
        console.error('[ADMIN ERROR] Failed to fetch users:', error);
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-12 text-center text-red-400">
                        <i class="fas fa-exclamation-triangle text-3xl mb-3 block text-red-400"></i>
                        <p class="font-bold text-white text-base">Failed to Synchronize Records</p>
                        <p class="text-xs text-red-300/80 mb-4">Could not retrieve account list from server: ${error.message}</p>
                        <button type="button" onclick="location.reload()" class="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl text-xs font-bold transition inline-flex items-center gap-2">
                            <i class="fas fa-redo"></i> Retry Connection
                        </button>
                    </td>
                </tr>
            `;
        }
    }
});

// Quick Inspect User Details
window.inspectUser = function(userId, userName) {
    if (typeof window.showToast === 'function') {
        window.showToast(`Account Profile for: ${userName} (ID: ${userId})`, 'info');
    }
};
